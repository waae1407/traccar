import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const providers = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ is_active: true });
    const results = [];
    const now = new Date();

    for (const provider of providers) {
      const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: provider.provider_key });
      const commands = await base44.asServiceRole.entities.TelematicsCommand.filter({ provider_key: provider.provider_key });
      const recentCommands = commands.filter(c => now.getTime() - new Date(c.created_date || c.created_at || 0).getTime() < 24 * 60 * 60 * 1000);
      const failed = recentCommands.filter(c => ['failed', 'blocked', 'expired'].includes(c.queue_status || c.status)).length;
      const missingConfig = !provider.provider_key || !provider.provider_name || (provider.allow_live_commands && !provider.credential_secret_reference);
      const recentDeviceActivity = devices.some(d => d.last_seen_at && now.getTime() - new Date(d.last_seen_at).getTime() < 24 * 60 * 60 * 1000);

      let health = 'healthy';
      if (!provider.is_active) health = 'inactive';
      else if (missingConfig) health = 'critical';
      else if (recentCommands.length > 0 && failed / recentCommands.length > 0.25) health = 'warning';
      else if (devices.length > 0 && !recentDeviceActivity) health = 'warning';

      await base44.asServiceRole.entities.TelematicsProviderConfig.update(provider.id, {
        health_status: health,
        last_health_check_at: now.toISOString(),
      });
      results.push({ provider_key: provider.provider_key, health_status: health, devices: devices.length, recent_commands: recentCommands.length, failed_commands: failed });
    }

    return Response.json({ ok: true, checked: results.length, results, live_provider_api_calls: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});