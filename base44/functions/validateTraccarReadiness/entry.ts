import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function envValue(name) { return String(Deno.env.toObject()[name] || '').trim(); }
function present(name) { return !!envValue(name); }
function safeUrl(url) {
  if (!url) return { ok: false, reason: 'missing' };
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? { ok: true } : { ok: false, reason: 'invalid protocol' };
  } catch {
    return { ok: false, reason: 'invalid url' };
  }
}
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    const providers = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: 'traccar_noran_mt20' });
    const provider = providers[0] || null;
    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: 'traccar_noran_mt20' });
    const commands = await base44.asServiceRole.entities.TelematicsCommand.filter({ provider_key: 'traccar_noran_mt20' });
    const baseUrl = envValue('TRACCAR_BASE_URL');
    const urlStatus = safeUrl(baseUrl);
    const credentials = {
      TRACCAR_BASE_URL: { configured: present('TRACCAR_BASE_URL'), valid: urlStatus.ok, reason: urlStatus.reason || '' },
      TRACCAR_USERNAME: { configured: present('TRACCAR_USERNAME') },
      TRACCAR_PASSWORD: { configured: present('TRACCAR_PASSWORD') }
    };
    const credentialReady = credentials.TRACCAR_BASE_URL.configured && credentials.TRACCAR_BASE_URL.valid && credentials.TRACCAR_USERNAME.configured && credentials.TRACCAR_PASSWORD.configured;
    const testDevices = devices.filter(d => d.traccar_test_activation_enabled && (!d.traccar_test_activation_expires_at || new Date(d.traccar_test_activation_expires_at).getTime() > Date.now()));
    const confirmationCounts = commands.reduce((map, cmd) => {
      const key = cmd.confirmation_status || cmd.queue_status || 'pending';
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
    const webhookReady = !!provider?.webhook_secret_reference && present(provider.webhook_secret_reference);
    return Response.json({
      ok: true,
      traccar_production_activation: false,
      ready_for_test_activation: credentialReady && !!provider && provider.execution_mode === 'dry_run' && provider.allow_live_commands === false,
      credentials,
      webhook: { reference: provider?.webhook_secret_reference || '', configured: webhookReady },
      provider: provider ? {
        provider_key: provider.provider_key, is_active: provider.is_active, execution_mode: provider.execution_mode,
        allow_live_commands: provider.allow_live_commands, allow_starter_commands: provider.allow_starter_commands,
        health_status: provider.health_status || 'unknown'
      } : null,
      test_devices: testDevices.map(d => ({ id: d.id, unique_id: d.unique_id, traccar_device_id: d.traccar_device_id, expires_at: d.traccar_test_activation_expires_at })),
      command_confirmation_status: confirmationCounts,
      missing_before_live_commands: ['live commands intentionally disabled', 'provider remains dry_run', 'device-specific test activation only']
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});