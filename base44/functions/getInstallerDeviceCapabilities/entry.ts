import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

function isSupported(definition, providerConfig, device, providerKey) {
  if (definition.alwaysSupported) return true;
  if (definition.noran && isNoranMt20(providerKey, device)) return true;
  if (definition.provider && providerConfig?.[definition.provider] === true) return true;
  if (definition.device && device?.[definition.device] === true) return true;
  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const providerKey = String(body.provider_key || '').trim();
    const deviceId = String(body.device_id || '').trim();
    if (!providerKey || !deviceId) return Response.json({ error: 'provider_key and device_id are required' }, { status: 400 });

    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: providerKey, unique_id: deviceId });
    if (!devices[0]) return Response.json({ error: 'Device not found' }, { status: 404 });

    const configs = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: providerKey });
    const config = configs[0] || {};
    const device = devices[0];
    const tests = {};
    const labels = {};
    for (const [test, definition] of Object.entries(TEST_DEFINITIONS)) {
      tests[test] = isSupported(definition, config, device, providerKey);
      labels[test] = definition.label;
    }

    return Response.json({ ok: true, provider_key: providerKey, device_id: deviceId, model: device.model || '', tests, labels });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});