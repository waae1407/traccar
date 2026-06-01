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

    const device = await findDeviceByIdentifier(base44, deviceId, providerKey);
    if (!device) return Response.json({ error: 'Device not found' }, { status: 404 });

    providerKey = device.provider_key || providerKey || 'unknown';
    const configs = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: providerKey });
    const config = configs[0] || {};
    const tests = {};
    const labels = {};
    for (const [test, definition] of Object.entries(TEST_DEFINITIONS)) {
      tests[test] = isSupported(definition, config, device, providerKey);
      labels[test] = definition.label;
    }

    return Response.json({ ok: true, provider_key: providerKey, device_id: deviceId, model: device.model || '', device, tests, labels });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});