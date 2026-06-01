import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ADMIN_EMAIL = 'admin@uridehub.com';
const TEST_DEFINITIONS = {
  power_voltage_test: { label: 'Power / voltage', alwaysSupported: true },
  gps_signal_test: { label: 'GPS signal', provider: 'supports_location', device: 'gps_enabled', noran: true },
  ignition_acc_test: { label: 'Ignition / ACC', alwaysSupported: true },
  lock_test: { label: 'Lock', provider: 'supports_lock', device: 'lock_unlock_enabled', noran: true },
  unlock_test: { label: 'Unlock', provider: 'supports_unlock', device: 'lock_unlock_enabled', noran: true },
  horn_test: { label: 'Horn', provider: 'supports_horn', device: 'horn_light_enabled', noran: true },
  lights_test: { label: 'Lights', provider: 'supports_lights', device: 'horn_light_enabled', noran: true },
  starter_disable_test: { label: 'Starter Disable', provider: 'supports_starter_disable', noran: true },
  starter_restore_test: { label: 'Starter Restore', provider: 'supports_starter_restore', noran: true }
};

function isNoranMt20(providerKey, device) {
  const model = String(device?.model || '').toLowerCase();
  return providerKey === 'traccar_noran_mt20' || (model.includes('noran') && model.includes('mt20'));
}

function isSupportedCapability(providerConfig, device, providerKey, definition) {
  if (definition.alwaysSupported) return true;
  if (definition.noran && isNoranMt20(providerKey, device)) return true;
  if (definition.provider && providerConfig?.[definition.provider] === true) return true;
  if (definition.device && device?.[definition.device] === true) return true;
  return false;
}

function normalizeVin(vin) {
  return String(vin || '').trim().toUpperCase();
}

function displayVehicle(vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.id;
}

function normalizeDeviceId(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function getDeviceIdentifier(body) {
  return normalizeDeviceId(body.actual_device_id || body.device_id || body.unique_id || body.telematics_device_id);
}

async function findDeviceByIdentifier(base44, identifier, providerKey = '') {
  const fields = ['unique_id', 'device_imei', 'provider_device_id', 'traccar_device_id', 'moovetrax_device_id'];
  for (const field of fields) {
    const query = providerKey ? { provider_key: providerKey, [field]: identifier } : { [field]: identifier };
    const matches = await base44.asServiceRole.entities.TelematicsDevice.filter(query);
    if (matches[0]) return matches[0];
  }
  return null;
}

async function safeSendEmail(base44, payload) {
  try {
    await base44.asServiceRole.functions.invoke('sendEmail', payload);
    return true;
  } catch (error) {
    console.error('[installer-notification] email failed:', error.message);
    return false;
  }
}

async function upsertVinLinkAlert(base44, { vin, device, record }) {
  const dedupeKey = `installer_vin_not_found:${vin}`;
  const payload = {
    alert_type: 'vin_not_found_installation',
    severity: 'warning',
    status: 'new',
    title: 'Vehicle VIN not found during installation',
    message: `VIN ${vin} was entered for device ${device.unique_id || device.id}, but no matching vehicle exists yet.`,
    recommended_action: 'Add vehicle with matching VIN or link device manually',
    domain: 'installers',
    source_entity_type: 'TelematicsInstallRecord',
    source_entity_id: record.id,
    provider_key: device.provider_key,
    telematics_device_id: device.id,
    install_record_id: record.id,
    dedupe_key: dedupeKey,
    first_seen_at: new Date().toISOString(),
    metadata: { vin, device_id: device.unique_id || device.id, vehicle_match_status: 'pending_vehicle_link' }
  };
  const existing = await base44.asServiceRole.entities.OperationalAlert.filter({ dedupe_key: dedupeKey });
  if (existing[0]) return await base44.asServiceRole.entities.OperationalAlert.update(existing[0].id, { ...payload, repeat_count: Number(existing[0].repeat_count || 1) + 1, last_duplicate_at: new Date().toISOString(), status: existing[0].status === 'resolved' ? 'new' : existing[0].status });
  return await base44.asServiceRole.entities.OperationalAlert.create(payload);
}

async function notify(base44, { type, host, device, vehicle, record, failedTests }) {
  const subject = type === 'completed' ? 'Telematics installation completed' : type === 'failed' ? 'Telematics installation failed' : 'Telematics VIN not found';
  const rows = [
    `<p><strong>Device:</strong> ${device.unique_id || device.id}</p>`,
    `<p><strong>VIN:</strong> ${record.vin || 'N/A'}</p>`,
    `<p><strong>Vehicle:</strong> ${vehicle ? displayVehicle(vehicle) : 'Not matched'}</p>`,
    `<p><strong>Installer:</strong> ${record.installer_name || record.installer_signature_name || 'N/A'}</p>`,
    `<p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>`,
    failedTests?.length ? `<p><strong>Failed tests:</strong> ${failedTests.join(', ')}</p>` : '',
    `<pre>${JSON.stringify(record.test_summary || {}, null, 2)}</pre>`
  ].join('');

  await base44.asServiceRole.entities.OperationalAlert.create({
    alert_type: type === 'completed' ? 'provider_health_warning' : 'installation_failure',
    severity: type === 'completed' ? 'info' : 'warning',
    title: subject,
    message: `${subject} for device ${device.unique_id || device.id}${record.vin ? ` and VIN ${record.vin}` : ''}.`,
    recommended_action: type === 'completed' ? 'Review completed installation record.' : 'Review installation record and failed checks.',
    provider_key: device.provider_key,
    telematics_device_id: device.id,
    vehicle_id: vehicle?.id || '',
    host_id: host?.id || record.host_id || '',
    install_record_id: record.id,
    metadata: { notification_type: 'admin', failed_tests: failedTests || [] }
  });

  if (host?.id) {
    await base44.asServiceRole.entities.OperationalAlert.create({
      alert_type: type === 'completed' ? 'provider_health_warning' : 'installation_failure',
      severity: type === 'completed' ? 'info' : 'warning',
      title: subject,
      message: `${subject} for ${vehicle ? displayVehicle(vehicle) : 'your vehicle'}.`,
      recommended_action: type === 'completed' ? 'No action required.' : 'Contact support or review the installation issue.',
      provider_key: device.provider_key,
      telematics_device_id: device.id,
      vehicle_id: vehicle?.id || '',
      host_id: host.id,
      install_record_id: record.id,
      metadata: { notification_type: 'host', failed_tests: failedTests || [] }
    });
  }

  await safeSendEmail(base44, { to: ADMIN_EMAIL, subject, body: rows });
  if (host?.email) await safeSendEmail(base44, { to: host.email, subject, body: rows });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    let providerKey = String(body.provider_key || '').trim();
    const deviceIdentifier = getDeviceIdentifier(body);
    const vin = normalizeVin(body.vin);
    const now = new Date().toISOString();

    if (!deviceIdentifier) return Response.json({ error: 'Physical device barcode is required' }, { status: 400 });
    if (!vin || vin.length !== 17) return Response.json({ error: 'A valid 17-character VIN is required' }, { status: 400 });
    if (!body.installer_name || !body.installer_signature_name) return Response.json({ error: 'Installer name and signature are required' }, { status: 400 });
    if (!Array.isArray(body.install_photos) || body.install_photos.length < 3) return Response.json({ error: 'All required installation photos are required' }, { status: 400 });

    let device = await findDeviceByIdentifier(base44, deviceIdentifier, providerKey);
    if (!device) {
      device = await base44.asServiceRole.entities.TelematicsDevice.create({
        provider_key: 'unknown',
        unique_id: deviceIdentifier,
        lifecycle_status: 'inventory',
        assigned_status: 'unassigned',
        install_status: 'not_started',
        online_status: 'unknown',
        created_at: now
      });
    }
    providerKey = device.provider_key || providerKey || 'unknown';

    const providerConfigs = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: providerKey });
    const providerConfig = providerConfigs[0] || null;

    const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ vin });
    const vehicle = vehicles[0];
    const existing = await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ telematics_device_id: device.id });

    const vehicleMatchStatus = vehicle ? 'matched' : 'pending_vehicle_link';
    const basePayload = {
      company_id: device.company_id || vehicle?.company_id || '',
      host_id: vehicle?.host_id || '',
      vehicle_id: vehicle?.id || '',
      vin,
      vin_entered: vin,
      vehicle_match_status: vehicleMatchStatus,
      telematics_device_id: device.id,
      provider_key: providerKey,
      device_unique_id: device.unique_id,
      installer_name: String(body.installer_name || '').trim(),
      installer_signature_name: String(body.installer_signature_name || '').trim(),
      installation_started_at: existing[0]?.installation_started_at || now,
      installation_notes: String(body.installation_notes || ''),
      install_photos: body.install_photos,
      qa_status: 'not_required',
      notes: String(body.installation_notes || '')
    };

    const testSummary = {};
    const failedTests = [];
    for (const [key, definition] of Object.entries(TEST_DEFINITIONS)) {
      const supported = isSupportedCapability(providerConfig, device, providerKey, definition);
      const value = body[key] || (supported ? '' : 'not_supported');
      if (supported && !value) return Response.json({ error: `${definition.label} test is required` }, { status: 400 });
      if (supported && value === 'not_supported') return Response.json({ error: `This device supports ${definition.label}. Test must be Pass or Fail.` }, { status: 400 });
      if (!supported && value !== 'not_supported') return Response.json({ error: `${definition.label} is not supported and must be marked Not Supported.` }, { status: 400 });
      if (value === 'fail') failedTests.push(key);
      testSummary[key] = value;
    }

    if (failedTests.length) return Response.json({ error: 'All supported capability tests must pass before completing installation' }, { status: 400 });

    await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
      vehicle_id: vehicle?.id || '',
      host_id: vehicle?.host_id || '',
      assigned_status: vehicle ? 'assigned' : 'unassigned',
      install_status: failedTests.length ? 'failed' : 'installed',
      lifecycle_status: failedTests.length ? 'installation_started' : (vehicle ? 'installation_completed' : 'installation_completed_unlinked'),
      installation_completed_at: failedTests.length ? device.installation_completed_at || '' : now
    });

    let host = null;
    if (vehicle?.host_id) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id });
      host = hosts[0] || null;
    }

    const status = failedTests.length ? 'failed' : 'completed';
    const payload = {
      ...basePayload,
      host_id: vehicle?.host_id || '',
      vehicle_id: vehicle?.id || '',
      install_status: status,
      installation_completed_at: failedTests.length ? existing[0]?.installation_completed_at || '' : now,
      test_summary: testSummary,
      failed_tests: failedTests,
      ...testSummary,
      voltage_verified: testSummary.power_voltage_test === 'pass',
      gps_verified: testSummary.gps_signal_test === 'pass',
      ignition_verified: testSummary.ignition_acc_test === 'pass',
      lock_unlock_verified: ['pass', 'not_supported'].includes(testSummary.lock_test) && ['pass', 'not_supported'].includes(testSummary.unlock_test),
      tamper_check_verified: false,
      gps_test_passed: testSummary.gps_signal_test === 'pass',
      ignition_test_passed: testSummary.ignition_acc_test === 'pass',
      lock_test_passed: testSummary.lock_test === 'pass',
      unlock_test_passed: testSummary.unlock_test === 'pass',
      horn_light_test_passed: ['pass', 'not_supported'].includes(testSummary.horn_test) && ['pass', 'not_supported'].includes(testSummary.lights_test),
      kill_restore_test_passed: ['pass', 'not_supported'].includes(testSummary.starter_disable_test) && ['pass', 'not_supported'].includes(testSummary.starter_restore_test)
    };

    const record = existing[0]
      ? await base44.asServiceRole.entities.TelematicsInstallRecord.update(existing[0].id, payload)
      : await base44.asServiceRole.entities.TelematicsInstallRecord.create(payload);

    await base44.asServiceRole.entities.TelematicsEvent.create({
      company_id: device.company_id || vehicle?.company_id || '',
      telematics_device_id: device.id,
      provider_key: providerKey,
      vehicle_id: vehicle?.id || '',
      event_type: failedTests.length ? 'installation_failed' : 'installation_completed',
      source: 'installer',
      raw_payload: { install_record_id: record.id, vin, failed_tests: failedTests, installer: payload.installer_name },
      created_at: now
    });

    if (!vehicle) {
      await upsertVinLinkAlert(base44, { vin, device, record });
      await safeSendEmail(base44, {
        to: ADMIN_EMAIL,
        subject: 'Vehicle VIN not found during installation',
        body: `<p>Installation completed for device ${device.unique_id || device.id}, but VIN ${vin} is not in uRideHub yet.</p><p>Add vehicle with matching VIN or link device manually.</p>`
      });
      return Response.json({ ok: true, status, pending_vehicle_link: true, message: 'VIN not found yet. Installation may continue. uRideHub admin will link this device once the vehicle is added.', record, vehicle: null });
    }

    await notify(base44, { type: status, host, device, vehicle, record, failedTests });
    return Response.json({ ok: true, status, message: failedTests.length ? 'Installation test failed. Admin/host has been notified.' : 'Installation complete. Admin/host has been notified.', record, vehicle });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});