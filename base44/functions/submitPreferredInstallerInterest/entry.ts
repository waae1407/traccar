import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function norm(value) { return String(value || '').trim(); }
function cleanPhone(value) { return String(value || '').replace(/[^0-9+]/g, ''); }
function distanceMiles(a, b) {
  if (!a || !b) return Infinity;
  const lat1 = Number(a.lat), lon1 = Number(a.lon), lat2 = Number(b.lat), lon2 = Number(b.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;
  const R = 3958.8, toRad = v => v * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
async function geocode(address) {
  if (!address) return null;
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&country=US&format=json&limit=1`, { headers: { 'User-Agent': 'uRide-App' } });
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data?.[0];
  if (!hit) return null;
  const parts = String(hit.display_name || '').split(',').map(p => p.trim());
  return { lat: Number(hit.lat), lon: Number(hit.lon), display: hit.display_name || address, city: parts[1] || '', state: parts.find(p => /^[A-Z]{2}$/.test(p)) || '', zip: (hit.display_name || '').match(/\b\d{5}\b/)?.[0] || '' };
}
async function sendWelcome(base44, lead) {
  if (!lead.installer_email) return;
  await base44.asServiceRole.functions.invoke('sendEmail', {
    to: lead.installer_email,
    subject: 'Welcome to the uRide Preferred Installer Network',
    body: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827"><h2>Welcome to the uRide Preferred Installer Network</h2><p>Hi ${lead.installer_name || 'Installer'},</p><p>Thanks for joining the uRide Preferred Installer Network.</p><p>Your installation has been recorded successfully.</p><p><strong>Your current verification progress:</strong></p><div style="font-size:22px;font-weight:800;margin:16px 0">${lead.successful_install_count || 0} / 3 successful installs</div><p>Once you complete 3 successful uRide installations, your profile can become uRide Verified.</p><p>We will contact you when installer opportunities are available in your area.</p><p><a href="https://uridehub.com/installers" style="display:inline-block;background:#111827;color:white;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">Claim Installer Profile</a></p></div>`,
    from_name: 'uRide Installer Network'
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const now = new Date().toISOString();
    const installRecordId = norm(body.install_record_id);
    const record = installRecordId ? (await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ id: installRecordId }))[0] : null;
    const vehicle = record?.vehicle_id ? (await base44.asServiceRole.entities.Vehicle.filter({ id: record.vehicle_id }))[0] : null;
    const device = record?.telematics_device_id ? (await base44.asServiceRole.entities.TelematicsDevice.filter({ id: record.telematics_device_id }))[0] : null;
    const host = record?.host_id ? (await base44.asServiceRole.entities.Host.filter({ id: record.host_id }))[0] : null;

    const installerEmail = norm(body.installer_email || record?.installer_email || record?.assigned_installer_email).toLowerCase();
    const installerPhone = cleanPhone(body.installer_phone || record?.installer_phone);
    const installerName = norm(body.installer_name || record?.installer_name);
    const businessName = norm(body.business_name || record?.installer_business_name || installerName);
    const businessAddress = norm(body.business_address || record?.installer_business_address);
    if (!installerName) return Response.json({ error: 'Installer name is required' }, { status: 400 });
    if (!businessName || !businessAddress) return Response.json({ error: 'Business name and address are required' }, { status: 400 });

    const geo = await geocode(businessAddress);
    const signals = [];
    if (vehicle?.vehicle_lat && vehicle?.vehicle_lon) signals.push({ lat: vehicle.vehicle_lat, lon: vehicle.vehicle_lon });
    if (vehicle?.pickup_address && !vehicle?.vehicle_lat) {
      const pickupGeo = await geocode(vehicle.pickup_address);
      if (pickupGeo) signals.push(pickupGeo);
    }
    if (device?.last_latitude && device?.last_longitude) signals.push({ lat: device.last_latitude, lon: device.last_longitude });
    if (host?.city || host?.state) {
      const hostGeo = await geocode([host.city, host.state].filter(Boolean).join(', '));
      if (hostGeo) signals.push(hostGeo);
    }
    const locationVerified = !!geo && signals.some(signal => distanceMiles(geo, signal) <= 1);

    let existing = null;
    if (installerEmail) existing = (await base44.asServiceRole.entities.PreferredInstallerLead.filter({ installer_email: installerEmail }))[0];
    if (!existing && installerPhone) existing = (await base44.asServiceRole.entities.PreferredInstallerLead.filter({ installer_phone: installerPhone }))[0];

    const payload = {
      installer_name: installerName,
      installer_signature_name: norm(body.installer_signature_name || record?.installer_signature_name),
      installer_email: installerEmail,
      installer_phone: installerPhone,
      business_name: businessName,
      business_address: businessAddress,
      business_city: body.business_city || geo?.city || '',
      business_state: body.business_state || geo?.state || '',
      business_zip: body.business_zip || geo?.zip || '',
      business_latitude: geo?.lat,
      business_longitude: geo?.lon,
      install_record_id: record?.id || '',
      vehicle_id: record?.vehicle_id || '',
      telematics_device_id: record?.telematics_device_id || '',
      device_unique_id: record?.device_unique_id || device?.unique_id || '',
      vin: record?.vin || '',
      host_id: record?.host_id || '',
      company_id: record?.company_id || '',
      joined_preferred_network: true,
      location_verified: locationVerified,
      verification_required_count: 3,
      lead_status: existing?.lead_status || 'pending',
      source: existing?.source || 'install_completion',
      created_at: existing?.created_at || now,
      updated_at: now
    };
    let lead = existing ? await base44.asServiceRole.entities.PreferredInstallerLead.update(existing.id, payload) : await base44.asServiceRole.entities.PreferredInstallerLead.create(payload);
    if (record?.id) await base44.asServiceRole.entities.TelematicsInstallRecord.update(record.id, { preferred_installer_lead_id: lead.id, installer_email: installerEmail, installer_phone: installerPhone, installer_business_name: businessName, installer_business_address: businessAddress });
    const progress = await base44.asServiceRole.functions.invoke('recalculatePreferredInstallerProgress', { lead_id: lead.id });
    lead = progress.data?.lead || lead;
    await sendWelcome(base44, lead);
    return Response.json({ ok: true, lead });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});