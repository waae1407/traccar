import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// TELEMATICS CENTER — DASHBOARD SUMMARY ONLY
// Target: <1 second, <150 KB payload
// Does NOT load command history, event history, or full device details.
// Returns KPIs + minimal device status list only.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'admin';
    const body = await req.json().catch(() => ({}));
    const { host_id: bodyHostId } = body;

    let scopedHostId = bodyHostId;
    if (!isAdmin) {
      const [hosts, hostByUser] = await Promise.all([
        base44.asServiceRole.entities.Host.filter({ email: user.email }),
        base44.asServiceRole.entities.Host.filter({ user_id: user.id }),
      ]);
      const myHost = hosts[0] || hostByUser[0];
      if (!myHost) return Response.json({ error: 'Host not found' }, { status: 403 });
      scopedHostId = myHost.id;
    }

    const now = new Date();
    const staleCutoff = new Date(now.getTime() - 30 * 60 * 1000);
    const today = now.toISOString().split('T')[0];

    // Single batch: just devices (100 limit for dashboard — enough for KPIs)
    // For KPI counts we only need status fields, not full enrichment
    const devices = scopedHostId
      ? await base44.asServiceRole.entities.TelematicsDevice.filter({ host_id: scopedHostId }, '-updated_date', 500)
      : await base44.asServiceRole.entities.TelematicsDevice.list('-updated_date', 500);

    // KPI counts from device list only (no commands/events loaded)
    const totalDevices = devices.length;
    const onlineCount = devices.filter(d => d.online_status === 'online').length;
    const offlineCount = devices.filter(d => d.online_status === 'offline').length;
    const staleCount = devices.filter(d => {
      if (d.online_status === 'online') return false;
      if (!d.last_seen_at) return true;
      return new Date(d.last_seen_at) < staleCutoff;
    }).length;
    const starterDisabledCount = devices.filter(d => d.starter_disabled).length;
    const liveEnabledCount = devices.filter(d => d.lifecycle_status === 'live_enabled').length;

    // Parallel: lightweight counts for commands/installs/alerts today
    // Use small limits — we only need totals for the KPI bar
    const [recentCommands, pendingInstalls, activeAlarms, recentAlerts] = await Promise.all([
      base44.asServiceRole.entities.TelematicsCommand.list('-created_date', 50),
      base44.asServiceRole.entities.TelematicsInstallRecord.filter({ qa_status: 'pending' }, '-created_date', 100),
      base44.asServiceRole.entities.TelematicsAlarmSession.filter({ status: 'active' }, '-started_at', 20),
      base44.asServiceRole.entities.OperationalAlert.filter({ domain: 'telematics' }, '-created_date', 50),
    ]);

    // Scope commands to this host's devices if needed
    const deviceIds = new Set(devices.map(d => d.id));
    const scopedVehicleIds = new Set(devices.map(d => d.vehicle_id).filter(Boolean));
    const scopedCommands = scopedHostId
      ? recentCommands.filter(c =>
          deviceIds.has(c.telematics_device_id) ||
          deviceIds.has(c.device_id) ||
          (c.vehicle_id && scopedVehicleIds.has(c.vehicle_id))
        )
      : recentCommands;

    const commandFailedCount = scopedCommands.filter(c =>
      ['failed', 'expired', 'blocked'].includes(c.queue_status || c.status)
    ).length;
    const commandTodayCount = scopedCommands.filter(c =>
      c.created_at && c.created_at.startsWith(today)
    ).length;
    const installerCount = await base44.asServiceRole.entities.PreferredInstallerLead.list('-created_date', 1)
      .then(r => r.length > 0 ? null : 0).catch(() => 0);

    // Minimal offline device list (just id, unique_id, vehicle_id, last_seen_at)
    const offlineDeviceSummary = devices
      .filter(d => d.online_status === 'offline' || (!d.last_seen_at && d.install_status !== 'not_started'))
      .slice(0, 20)
      .map(d => ({
        id: d.id,
        unique_id: d.unique_id,
        vehicle_id: d.vehicle_id,
        online_status: d.online_status,
        last_seen_at: d.last_seen_at,
        starter_disabled: d.starter_disabled,
        provider_key: d.provider_key,
      }));

    const warnings = [];
    if (offlineCount > 0) warnings.push(`${offlineCount} device(s) offline`);
    if (staleCount > 0) warnings.push(`${staleCount} device(s) have stale heartbeat`);
    if (commandFailedCount > 0) warnings.push(`${commandFailedCount} recent command(s) failed`);
    if (starterDisabledCount > 0) warnings.push(`${starterDisabledCount} vehicle(s) with starter disabled`);
    if (totalDevices >= 500) warnings.push('Device list capped at 500 — use Devices tab for full list');

    return Response.json({
      kpis: {
        total_devices: totalDevices,
        online_count: onlineCount,
        offline_count: offlineCount,
        stale_count: staleCount,
        starter_disabled_count: starterDisabledCount,
        live_enabled_count: liveEnabledCount,
        command_failed_count: commandFailedCount,
        commands_today: commandTodayCount,
        installs_pending_qa: pendingInstalls.length,
        active_alarms: activeAlarms.length,
        open_alerts_count: recentAlerts.length,
      },
      offline_device_summary: offlineDeviceSummary,
      active_alarms: activeAlarms.slice(0, 5),
      warnings,
      scope: isAdmin && !scopedHostId ? 'admin' : 'host',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getTelematicsDashboard]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});