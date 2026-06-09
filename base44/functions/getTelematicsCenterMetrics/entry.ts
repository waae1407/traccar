import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'admin';
    const body = await req.json().catch(() => ({}));
    const { host_id: bodyHostId, vehicle_id: filterVehicleId, provider_key: filterProvider } = body;

    // Default date range: last 7 days for events/commands
    let { date_from } = body;
    if (!date_from) {
      const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      date_from = past.toISOString().split('T')[0];
    }

    let scopedHostId = bodyHostId;
    if (!isAdmin) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ email: user.email });
      const hostByUser = await base44.asServiceRole.entities.Host.filter({ user_id: user.id });
      const myHost = hosts[0] || hostByUser[0];
      if (!myHost) return Response.json({ error: 'Host not found' }, { status: 403 });
      scopedHostId = myHost.id;
    }

    // Batch 1: Devices and vehicles (scoped, bounded)
    const [devicesRaw, vehicles] = await Promise.all([
      scopedHostId
        ? base44.asServiceRole.entities.TelematicsDevice.filter({ host_id: scopedHostId })
        : base44.asServiceRole.entities.TelematicsDevice.list('-updated_date', 500),
      scopedHostId
        ? base44.asServiceRole.entities.Vehicle.filter({ host_id: scopedHostId })
        : base44.asServiceRole.entities.Vehicle.list('-created_date', 500),
    ]);

    const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));

    const filteredDevices = devicesRaw
      .filter(d => !filterVehicleId || d.vehicle_id === filterVehicleId)
      .filter(d => !filterProvider || d.provider_key === filterProvider);

    // FIX #4: Build deviceIds and vehicleIds sets for correct command filtering
    const deviceIds = new Set(filteredDevices.map(d => d.id));
    const scopedVehicleIds = new Set(filteredDevices.map(d => d.vehicle_id).filter(Boolean));

    // Batch 2: Commands + events + installs (bounded, post-fetched and filtered)
    const [commandsRaw, eventsRaw, installRecords, alarmSessions] = await Promise.all([
      scopedHostId
        ? base44.asServiceRole.entities.TelematicsCommand.list('-created_date', 200)
        : base44.asServiceRole.entities.TelematicsCommand.list('-created_date', 200),
      scopedHostId
        ? base44.asServiceRole.entities.TelematicsEvent.list('-created_date', 200)
        : base44.asServiceRole.entities.TelematicsEvent.list('-created_date', 200),
      scopedHostId
        ? base44.asServiceRole.entities.TelematicsInstallRecord.filter({ host_id: scopedHostId }, '-created_date', 200)
        : base44.asServiceRole.entities.TelematicsInstallRecord.list('-created_date', 200),
      base44.asServiceRole.entities.TelematicsAlarmSession.list('-started_at', 50),
    ]);

    // Batch 3: Alerts and installer leads (bounded)
    const [operationalAlerts, installerLeads] = await Promise.all([
      base44.asServiceRole.entities.OperationalAlert.list('-created_date', 100),
      base44.asServiceRole.entities.PreferredInstallerLead.list('-created_date', 100),
    ]);

    // FIX #4: Correct command filter — scope to device IDs or scoped vehicle IDs (not a no-op)
    const filteredCommands = isAdmin && !scopedHostId
      ? commandsRaw  // admin global: all commands
      : commandsRaw.filter(c =>
          deviceIds.has(c.telematics_device_id) ||
          deviceIds.has(c.device_id) ||
          (c.vehicle_id && scopedVehicleIds.has(c.vehicle_id))
        );

    // Filter events to scoped device set
    const filteredEvents = isAdmin && !scopedHostId
      ? eventsRaw
      : eventsRaw.filter(e => deviceIds.has(e.telematics_device_id));

    const filteredInstalls = installRecords.filter(r => !filterVehicleId || r.vehicle_id === filterVehicleId);

    const now = new Date();
    const staleCutoff = new Date(now.getTime() - 30 * 60 * 1000); // 30 min

    const onlineDevices = filteredDevices.filter(d => d.online_status === 'online');
    const offlineDevices = filteredDevices.filter(d => d.online_status === 'offline');
    const staleDevices = filteredDevices.filter(d => {
      if (d.online_status === 'online') return false;
      if (!d.last_seen_at) return true;
      return new Date(d.last_seen_at) < staleCutoff;
    });
    const starterDisabledDevices = filteredDevices.filter(d => d.starter_disabled);

    const commandFailed = filteredCommands.filter(c => ['failed', 'expired', 'blocked'].includes(c.queue_status || c.status));
    const commandPending = filteredCommands.filter(c => ['queued', 'sending', 'sent'].includes(c.queue_status || c.status));
    const commandSuccess = filteredCommands.filter(c => ['delivered', 'acknowledged', 'executed', 'confirmed'].includes(c.queue_status || c.status));

    const installCompleted = filteredInstalls.filter(r => r.install_status === 'completed');
    const installPending = filteredInstalls.filter(r => ['not_started', 'in_progress'].includes(r.install_status));
    const installFailed = filteredInstalls.filter(r => ['failed', 'correction_needed'].includes(r.install_status));

    const activeAlarms = alarmSessions.filter(s => s.status === 'active');

    const enrichedDevices = filteredDevices.map(d => ({
      ...d,
      vehicle: vehicleMap[d.vehicle_id] || null,
      is_stale: !d.last_seen_at || new Date(d.last_seen_at) < staleCutoff,
    }));

    const isTruncated = commandsRaw.length >= 200 || eventsRaw.length >= 200;

    const warnings = [];
    if (staleDevices.length) warnings.push(`${staleDevices.length} device(s) have stale or missing heartbeat`);
    if (offlineDevices.length) warnings.push(`${offlineDevices.length} device(s) are offline`);
    if (commandFailed.length) warnings.push(`${commandFailed.length} recent command(s) failed`);
    if (starterDisabledDevices.length) warnings.push(`${starterDisabledDevices.length} vehicle(s) have starter disabled`);
    if (isTruncated) warnings.push('Command/event results capped at 200 per type — use narrower date range for complete history');

    return Response.json({
      devices: enrichedDevices,
      commands: filteredCommands.slice(0, 200),
      events: filteredEvents.slice(0, 200),
      install_records: filteredInstalls,
      installer_leads: installerLeads,
      operational_alerts: operationalAlerts.filter(a => a.domain === 'telematics'),
      alarm_sessions: alarmSessions,
      kpis: {
        total_devices: filteredDevices.length,
        online_count: onlineDevices.length,
        offline_count: offlineDevices.length,
        stale_count: staleDevices.length,
        starter_disabled_count: starterDisabledDevices.length,
        command_total: filteredCommands.length,
        command_failed_count: commandFailed.length,
        command_pending_count: commandPending.length,
        command_success_count: commandSuccess.length,
        install_completed: installCompleted.length,
        install_pending: installPending.length,
        install_failed: installFailed.length,
        active_alarms: activeAlarms.length,
      },
      offline_vehicles: offlineDevices.map(d => vehicleMap[d.vehicle_id]).filter(Boolean),
      stale_heartbeat_devices: staleDevices,
      starter_disabled_devices: starterDisabledDevices,
      active_alarms: activeAlarms,
      warnings,
      query_limits_used: { commands: 200, events: 200, devices: scopedHostId ? 'host-scoped' : 500, installs: 200 },
      is_truncated: isTruncated,
      date_range_used: { date_from, command_event_window: 'last 7 days default' },
      scope: isAdmin ? 'admin' : 'host',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getTelematicsCenterMetrics]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});