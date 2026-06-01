import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ADMIN_EMAIL = 'admin@uridehub.com';

function clean(value) { return String(value || '').trim(); }
function normalizeVin(value) { return clean(value).toUpperCase(); }
function normalizeDeviceId(value) { return clean(value).toUpperCase().replace(/\s+/g, ''); }
function displayVehicle(vehicle) { return vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.id : 'Not matched'; }

async function findDevice(base44, identifier) {
  const fields = ['unique_id', 'device_imei', 'provider_device_id', 'traccar_device_id', 'moovetrax_device_id'];
  for (const field of fields) {
    const matches = await base44.asServiceRole.entities.TelematicsDevice.filter({ [field]: identifier });
    if (matches[0]) return matches[0];
  }
  return null;
}

async function sendEmail(base44, to, subject, body) {
  if (!to) return;
  await base44.asServiceRole.functions.invoke('sendEmail', { to, subject, body }).catch(() => null);
}

async function sendSms(phone, message) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!sid || !token || !from || !phone) return;
  const params = new URLSearchParams({ To: phone, From: from, Body: message });
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  }).catch(() => null);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const deviceIdentifier = normalizeDeviceId(body.device_id || body.actual_device_id || body.unique_id);
    const vin = normalizeVin(body.vin);
    const failedTest = clean(body.failed_test || body.test_key || 'unknown');
    const installerName = clean(body.installer_name || body.name);
    const installerPhone = clean(body.installer_phone || body.phone);
    const installerEmail = clean(body.installer_email || body.email);
    const issue = clean(body.issue_description || body.notes || body.description);

    if (!deviceIdentifier) return Response.json({ error: 'Device ID is required' }, { status: 400 });
    if (!installerName || !installerPhone || !issue) return Response.json({ error: 'Name, phone, and issue description are required' }, { status: 400 });

    const device = await findDevice(base44, deviceIdentifier);
    const vehicles = vin ? await base44.asServiceRole.entities.Vehicle.filter({ vin }) : [];
    const vehicle = vehicles[0] || null;
    let host = null;
    if (vehicle?.host_id) host = (await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id }))[0] || null;
    const now = new Date().toISOString();

    const alert = await base44.asServiceRole.entities.OperationalAlert.create({
      alert_type: 'installation_failure',
      severity: 'warning',
      status: 'new',
      title: 'Installer requested telematics help',
      message: `${installerName} requested help for ${failedTest} on ${deviceIdentifier}. ${issue}`,
      recommended_action: 'Contact installer and review failed test context.',
      domain: 'installers',
      provider_key: device?.provider_key || clean(body.provider_key),
      telematics_device_id: device?.id || '',
      vehicle_id: vehicle?.id || '',
      host_id: host?.id || '',
      metadata: { vin, failed_test: failedTest, installer_name: installerName, installer_phone: installerPhone, installer_email: installerEmail, issue, photos: body.photos || [] },
      first_seen_at: now
    });

    await base44.asServiceRole.entities.TelematicsEvent.create({
      company_id: vehicle?.company_id || device?.company_id || '',
      telematics_device_id: device?.id || '',
      provider_key: device?.provider_key || clean(body.provider_key),
      vehicle_id: vehicle?.id || '',
      event_type: 'installer_help_requested',
      source: 'installer',
      raw_payload: { alert_id: alert.id, vin, failed_test: failedTest, installer_name: installerName, installer_phone: installerPhone, installer_email: installerEmail, issue },
      created_at: now
    });

    await base44.asServiceRole.entities.Notification.create({ title: 'Installer requested telematics help', body: `${failedTest}: ${issue}`, type: 'telematics', domain: 'installers', severity: 'warning', recipient_role: 'admin', source_entity_type: 'OperationalAlert', source_entity_id: alert.id });
    if (host?.email) await base44.asServiceRole.entities.Notification.create({ title: 'Installer requested help', body: `${displayVehicle(vehicle)}: ${issue}`, type: 'telematics', domain: 'installers', severity: 'warning', recipient_email: host.email, recipient_role: 'host', source_entity_type: 'OperationalAlert', source_entity_id: alert.id });

    const emailBody = `<p><strong>Device:</strong> ${deviceIdentifier}</p><p><strong>VIN:</strong> ${vin || 'N/A'}</p><p><strong>Vehicle:</strong> ${displayVehicle(vehicle)}</p><p><strong>Host:</strong> ${host?.business_name || host?.full_name || 'N/A'}</p><p><strong>Failed test:</strong> ${failedTest}</p><p><strong>Installer:</strong> ${installerName} ${installerPhone} ${installerEmail}</p><p><strong>Issue:</strong> ${issue}</p>`;
    await sendEmail(base44, ADMIN_EMAIL, 'Installer requested telematics help', emailBody);
    await sendEmail(base44, host?.email, 'Installer requested telematics help', emailBody);
    await sendSms(installerPhone, 'uRideHub: Help request received. Support will review your telematics install issue.');

    return Response.json({ ok: true, alert_id: alert.id, message: 'Help request sent.' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});