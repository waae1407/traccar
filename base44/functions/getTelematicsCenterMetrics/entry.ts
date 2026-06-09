import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'admin';
    const body = await req.json().catch(() => ({}));
    const { host_id: bodyHostId, vehicle_id: filterVehicleId, provider_key: filterProvider } = body;

    let scopedHostId = bodyHostId;
    if (!isAdmin) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ email: user.email });
      const hostByUser = await base44.asServiceRole.entities.Host.filter({ user_id: user.id });
      const myHost = hosts[0] || hostByUser[0];
      if (!myHost) return Response.json({ error: 'Host not found' }, { status: 403 });
      scopedHostId = myHost.id;
    }

    const [devices, commands, events, installRecords, installerLeads, operationalAlerts, alarmSessions, vehicles] = await Promise.all([
      scopedHostId ? base44.asServiceRole.entities.TelematicsDevice.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.TelematicsDevice.list('-updated_date', 2000),
      scopedHostId
        ? base44.asServiceRole.entities.TelematicsCommand.list('-created_date', 500).then(cmds => cmds.filter(c => devices.some && c))
        : base44.asServiceRole.entities.TelematicsCommand.list('-created_date', 500),
      base44.asServiceRole.entities.TelematicsEvent.list('-created_date', 500),
      scopedHostId ? base44.asServiceRole.entities.TelematicsInstallRecord.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.TelematicsInstallRecord.list('-created_date', 1000),
      base44.asServiceRole.entities.PreferredInstallerLead.list('-created_date', 500),
      base44.asServiceRole.entities.OperationalAlert.list('-created_date', 200),
      base44.asServiceRole.entities.TelematicsAlarmSession.list('-started_at', 100),
      scopedHostId ? base44.asServiceRole.entities.Vehicle.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.Vehicle.list('-created_date', 2000),
    ]);

    const vehicleMap = Object.fromEntries(vehicles.map(v => [v.id, v]));
    const devicesByHostId = scopedHostId ? devices : devices;

    const filteredDevices = devicesByHostId
      .filter(d => !filterVehicleId || d.vehicle_id === filterVehicleId)
      .filter(d => !filterProvider || d.provider_key === filterProvider);

    const deviceIds = new Set(filteredDevices.map(d => d.id));
    const filteredCommands = commands.filter(c => deviceIds.has(c.telematics_device_id) || (scopedHostId && c.vehicle_id && vehicleMap[c.vehicle_id]));
    const filteredEvents = events.filter(e => deviceIds.has(e.telematics_device_id));
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

    const warnings = [];
    if (staleDevices.length) warnings.push(`${staleDevices.length} device(s) have stale or missing heartbeat`);
    if (offlineDevices.length) warnings.push(`${offlineDevices.length} device(s) are offline`);
    if (commandFailed.length) warnings.push(`${commandFailed.length} recent command(s) failed`);
    if (starterDisabledDevices.length) warnings.push(`${starterDisabledDevices.length} vehicle(s) have starter disabled`);

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
      scope: isAdmin ? 'admin' : 'host',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getTelematicsCenterMetrics]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});