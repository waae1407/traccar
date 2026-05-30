import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CAPABILITY_BY_TEST = {
  lock_test: 'supports_lock',
  unlock_test: 'supports_unlock',
  horn_test: 'supports_horn',
  lights_test: 'supports_lights',
  starter_disable_test: 'supports_starter_disable',
  starter_restore_test: 'supports_starter_restore'
};

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
    const tests = {};
    for (const [test, capability] of Object.entries(CAPABILITY_BY_TEST)) {
      tests[test] = !!config[capability];
    }

    return Response.json({ ok: true, provider_key: providerKey, device_id: deviceId, model: devices[0].model || '', tests });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});