import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    const { device_id, enabled = true, hours = 24 } = await req.json();
    if (!device_id) return Response.json({ error: 'device_id is required' }, { status: 400 });
    let devices = [];
    try {
      devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: device_id });
    } catch (_error) {
      devices = [];
    }
    const device = devices[0];
    if (!device) return Response.json({ error: 'Device not found' }, { status: 404 });
    if (device.provider_key !== 'traccar_noran_mt20') return Response.json({ error: 'Only Traccar/Noran devices can use this test activation.' }, { status: 400 });
    const providers = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: 'traccar_noran_mt20' });
    const provider = providers[0];
    if (provider && (provider.execution_mode !== 'dry_run' || provider.allow_live_commands)) return Response.json({ error: 'Refusing test activation because provider is not locked to dry_run.' }, { status: 400 });
    const now = new Date();
    const expires = new Date(now.getTime() + Math.max(1, Math.min(Number(hours) || 24, 168)) * 60 * 60 * 1000);
    await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
      traccar_test_activation_enabled: !!enabled,
      traccar_test_activation_expires_at: enabled ? expires.toISOString() : '',
      traccar_test_activation_by: user.email,
      traccar_test_activation_at: now.toISOString()
    });
    await base44.asServiceRole.entities.TelematicsEvent.create({
      company_id: device.company_id || '', telematics_device_id: device.id, provider_key: device.provider_key, vehicle_id: device.vehicle_id || '',
      event_type: enabled ? 'traccar_test_activation_enabled' : 'traccar_test_activation_disabled', source: 'system',
      raw_payload: { enabled: !!enabled, expires_at: enabled ? expires.toISOString() : '', provider_global_activation: false }, created_at: now.toISOString()
    });
    return Response.json({ ok: true, device_id: device.id, enabled: !!enabled, expires_at: enabled ? expires.toISOString() : '', provider_global_activation: false, live_commands_enabled: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});