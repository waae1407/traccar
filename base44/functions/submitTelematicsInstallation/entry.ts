import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ADMIN_EMAIL = 'admin@uridehub.com';
const PUBLIC_REQUIRED = ['power_voltage_test', 'gps_signal_test', 'ignition_acc_test', 'tamper_security_test'];
const CAPABILITY_TESTS = {
  lock_test: { device: 'lock_unlock_enabled', provider: 'supports_lock' },
  unlock_test: { device: 'lock_unlock_enabled', provider: 'supports_unlock' },
  horn_test: { device: 'horn_light_enabled', provider: 'supports_horn' },
  lights_test: { device: 'horn_light_enabled', provider: 'supports_lights' },
  starter_disable_test: { provider: 'supports_starter_disable' },
  starter_restore_test: { provider: 'supports_starter_restore' }
};

function isSupportedCapability(providerConfig, capability) {
  return !!(capability.provider && providerConfig?.[capability.provider]);
}

function normalizeVin(vin) {
  return String(vin || '').trim().toUpperCase();
}

function displayVehicle(vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.id;
}

function getDeviceIdentifier(body) {
  return String(body.telematics_device_id || body.device_id || body.unique_id || '').trim();
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
    const providerKey = String(body.provider_key || '').trim();
    const deviceIdentifier = getDeviceIdentifier(body);
    const vin = normalizeVin(body.vin);
    const now = new Date().toISOString();

    if (!providerKey || !deviceIdentifier) return Response.json({ error: 'Device provider and ID are required' }, { status: 400 });
    if (!vin || vin.length !== 17) return Response.json({ error: 'A valid 17-character VIN is required' }, { status: 400 });
    if (!body.installer_name || !body.installer_signature_name) return Response.json({ error: 'Installer name and signature are required' }, { status: 400 });
    if (!Array.isArray(body.install_photos) || body.install_photos.length === 0) return Response.json({ error: 'At least one installation photo is required' }, { status: 400 });

    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: providerKey, unique_id: deviceIdentifier });
    const device = devices[0];
    if (!device) return Response.json({ error: 'Device not found' }, { status: 404 });

    const providerConfigs = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: providerKey });
    const providerConfig = providerConfigs[0] || null;

    const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ vin });
    const vehicle = vehicles[0];
    const existing = await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ telematics_device_id: device.id });

    const basePayload = {
      company_id: device.company_id || vehicle?.company_id || '',
      host_id: vehicle?.host_id || device.host_id || '',
      vehicle_id: vehicle?.id || device.vehicle_id || '',
      vin,
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

    if (!vehicle) {
      const unmatchedPayload = { ...basePayload, install_status: 'unmatched_vin' };
      const record = existing[0]
        ? await base44.asServiceRole.entities.TelematicsInstallRecord.update(existing[0].id, unmatchedPayload)
        : await base44.asServiceRole.entities.TelematicsInstallRecord.create(unmatchedPayload);
      await base44.asServiceRole.entities.TelematicsDevice.update(device.id, { install_status: 'in_progress', lifecycle_status: 'installation_started' });
      await notify(base44, { type: 'unmatched', device, record });
      return Response.json({ ok: false, status: 'unmatched_vin', message: 'VIN not found in uRideHub. Admin review required before this device can be completed.', record });
    }

    const allTestKeys = [...PUBLIC_REQUIRED, ...Object.keys(CAPABILITY_TESTS)];
    const testSummary = {};
    const failedTests = [];
    for (const key of allTestKeys) {
      const value = body[key];
      const capability = CAPABILITY_TESTS[key];
      const supported = capability ? isSupportedCapability(providerConfig, capability) : true;
      if (!value) return Response.json({ error: `${key} is required` }, { status: 400 });
      if (value === 'not_supported' && supported) return Response.json({ error: `${key} is supported and cannot be marked not_supported` }, { status: 400 });
      if (value !== 'not_supported' && !supported) return Response.json({ error: `${key} is not supported and must be marked not_supported` }, { status: 400 });
      if (value === 'fail') failedTests.push(key);
      testSummary[key] = value;
    }

    await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
      vehicle_id: vehicle.id,
      host_id: vehicle.host_id || '',
      assigned_status: 'assigned',
      install_status: failedTests.length ? 'failed' : 'installed',
      lifecycle_status: failedTests.length ? 'installation_started' : 'installation_completed',
      installation_completed_at: failedTests.length ? device.installation_completed_at || '' : now
    });

    let host = null;
    if (vehicle.host_id) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id });
      host = hosts[0] || null;
    }

    const status = failedTests.length ? 'failed' : 'completed';
    const payload = {
      ...basePayload,
      host_id: vehicle.host_id || '',
      vehicle_id: vehicle.id,
      install_status: status,
      installation_completed_at: failedTests.length ? existing[0]?.installation_completed_at || '' : now,
      test_summary: testSummary,
      failed_tests: failedTests,
      ...testSummary,
      voltage_verified: testSummary.power_voltage_test === 'pass',
      gps_verified: testSummary.gps_signal_test === 'pass',
      ignition_verified: testSummary.ignition_acc_test === 'pass',
      lock_unlock_verified: testSummary.lock_test === 'pass' && testSummary.unlock_test === 'pass',
      tamper_check_verified: testSummary.tamper_security_test === 'pass',
      gps_test_passed: testSummary.gps_signal_test === 'pass',
      ignition_test_passed: testSummary.ignition_acc_test === 'pass',
      lock_test_passed: testSummary.lock_test === 'pass',
      unlock_test_passed: testSummary.unlock_test === 'pass',
      horn_light_test_passed: testSummary.horn_test === 'pass' && testSummary.lights_test === 'pass',
      kill_restore_test_passed: testSummary.starter_disable_test === 'pass' && testSummary.starter_restore_test === 'pass'
    };

    const record = existing[0]
      ? await base44.asServiceRole.entities.TelematicsInstallRecord.update(existing[0].id, payload)
      : await base44.asServiceRole.entities.TelematicsInstallRecord.create(payload);

    await base44.asServiceRole.entities.TelematicsEvent.create({
      company_id: device.company_id || vehicle.company_id || '',
      telematics_device_id: device.id,
      provider_key: providerKey,
      vehicle_id: vehicle.id,
      event_type: failedTests.length ? 'installation_failed' : 'installation_completed',
      source: 'installer',
      raw_payload: { install_record_id: record.id, vin, failed_tests: failedTests, installer: payload.installer_name },
      created_at: now
    });

    await notify(base44, { type: status, host, device, vehicle, record, failedTests });
    return Response.json({ ok: true, status, message: failedTests.length ? 'Installation test failed. Admin/host has been notified.' : 'Installation complete. Admin/host has been notified.', record, vehicle });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});