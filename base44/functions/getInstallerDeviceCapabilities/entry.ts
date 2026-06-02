import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TEST_DEFINITIONS = {
  device_online: { label: 'Device online', alwaysSupported: true },
  power_voltage_test: { label: 'Power / voltage', alwaysSupported: true },
  gps_signal_test: { label: 'GPS signal', provider: 'supports_location', device: 'gps_enabled', noran: true },
  ignition_acc_test: { label: 'Ignition / ACC', alwaysSupported: true },
  lock_test: { label: 'Lock', provider: 'supports_lock', device: 'lock_unlock_enabled', noran: true },
  unlock_test: { label: 'Unlock', provider: 'supports_unlock', device: 'lock_unlock_enabled', noran: true },
  horn_test: { label: 'Horn', provider: 'supports_horn', device: 'horn_light_enabled', noran: true },
  lights_test: { label: 'Lights', provider: 'supports_lights', device: 'horn_light_enabled', noran: true },
  alarm_test: { label: 'Alarm', provider: 'supports_horn', device: 'horn_light_enabled', noran: true },
  starter_disable_test: { label: 'Starter Disable', provider: 'supports_starter_disable', noran: true },
  starter_restore_test: { label: 'Starter Restore', provider: 'supports_starter_restore', noran: true }
};

function isNoranMt20(providerKey, device) {
  const model = String(device?.model || '').toLowerCase();
  return providerKey === 'traccar_noran_mt20' || (model.includes('noran') && model.includes('mt20'));
}

function isSupported(definition, providerConfig, device, providerKey) {
  if (definition.alwaysSupported) return true;
  if (definition.noran && isNoranMt20(providerKey, device)) return true;
  if (definition.provider && providerConfig?.[definition.provider] === true) return true;
  if (definition.device && device?.[definition.device] === true) return true;
  return false;
}

function isRecent(value, hours = 24) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time <= hours * 60 * 60 * 1000;
}

function pickVoltage(...payloads) {
  for (const payload of payloads) {
    const candidates = [
      payload?.battery_voltage,
      payload?.noran_mt20_8009?.battery_voltage,
      payload?.raw_payload?.noran_mt20_8009?.battery_voltage,
      payload?.voltage,
      payload?.power_voltage,
      payload?.batteryVoltage,
      payload?.attributes?.battery_voltage,
      payload?.attributes?.voltage,
      payload?.position?.attributes?.battery_voltage,
      payload?.position?.attributes?.voltage,
      payload?.attributes?.power
    ];
    for (const value of candidates) {
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return number;
    }
  }
  return null;
}

async function buildAutoChecks(base44, device) {
  const events = device?.id ? await base44.asServiceRole.entities.TelematicsEvent.filter({ telematics_device_id: device.id }) : [];
  const recentEvents = events.filter(event => isRecent(event.created_at || event.created_date, 24));
  const recentGps = isRecent(device.location_updated_at || device.last_seen_at, 24) && Number.isFinite(Number(device.last_latitude)) && Number.isFinite(Number(device.last_longitude));
  const voltage = pickVoltage(device, ...recentEvents.map(event => event.raw_payload));
  const ignitionKnown = device.ignition_status && device.ignition_status !== 'unknown';
  const recentIgnition = recentEvents.some(event => typeof event.ignition === 'boolean' || ['ignition_on', 'ignition_off'].includes(event.event_type));
  const online = isRecent(device.last_seen_at || device.location_updated_at, 24) || recentEvents.length > 0;

  return {
    device_online: { status: online ? 'pass' : 'fail', tip: 'Device must be online first. Check power, SIM, and antenna signal.' },
    power_voltage_test: { status: voltage ? 'pass' : 'fail', value: voltage, tip: 'Check constant power, fuse, and ground.' },
    gps_signal_test: { status: recentGps ? 'pass' : 'fail', tip: 'Move vehicle/device where antenna has sky visibility.' },
    ignition_acc_test: { status: ignitionKnown || recentIgnition ? 'pass' : 'fail', tip: 'Turn ignition ON. Check ACC/ignition wire.' }
  };
}

async function findDeviceByIdentifier(base44, identifier, providerKey) {
  const fields = ['unique_id', 'device_imei', 'provider_device_id', 'traccar_device_id', 'moovetrax_device_id'];
  for (const field of fields) {
    const query = providerKey ? { provider_key: providerKey, [field]: identifier } : { [field]: identifier };
    const matches = await base44.asServiceRole.entities.TelematicsDevice.filter(query);
    if (matches[0]) return matches[0];
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    let providerKey = String(body.provider_key || '').trim();
    const deviceId = String(body.device_id || '').trim();
    if (!deviceId) return Response.json({ error: 'device_id is required' }, { status: 400 });

    let device = await findDeviceByIdentifier(base44, deviceId, providerKey);
    if (!device) {
      device = await base44.asServiceRole.entities.TelematicsDevice.create({
        provider_key: providerKey || 'unknown',
        unique_id: deviceId,
        lifecycle_status: 'inventory',
        assigned_status: 'unassigned',
        install_status: 'not_started',
        online_status: 'unknown',
        created_at: new Date().toISOString()
      });
    }

    providerKey = device.provider_key || providerKey || 'unknown';
    const configs = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: providerKey });
    const config = configs[0] || {};
    const tests = {};
    const labels = {};
    for (const [test, definition] of Object.entries(TEST_DEFINITIONS)) {
      tests[test] = isSupported(definition, config, device, providerKey);
      labels[test] = definition.label;
    }
    const auto_checks = await buildAutoChecks(base44, device);

    return Response.json({ ok: true, provider_key: providerKey, device_id: deviceId, model: device.model || '', device, tests, labels, auto_checks, created_pending_device: device.created_at ? false : false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});