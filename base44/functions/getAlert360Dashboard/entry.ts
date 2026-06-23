import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    
    const { host_id } = await req.json().catch(() => ({}));
    const isAdmin = user.role === 'admin';
    const isHost = !isAdmin && !!host_id;

    if (!isAdmin && !isHost) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const eventsFilter = isAdmin ? {} : { host_id, visible_to_host: true };
    
    const [events, incidents, commands, devices] = await Promise.all([
      base44.asServiceRole.entities.TelematicsSafetyEvent.filter(eventsFilter, '-first_seen_at', 500),
      base44.asServiceRole.entities.TelematicsIncident.filter(isAdmin ? {} : { host_id }, '-last_seen_at', 100),
      base44.asServiceRole.entities.TelematicsCommand.filter(isAdmin ? { status: 'failed' } : { status: 'failed' }, '-created_date', 100), // Approximate ACK issues
      base44.asServiceRole.entities.TelematicsDevice.filter(isAdmin ? {} : { host_id })
    ]);

    const now = Date.now();
    const oneDayAgo = new Date(now - 86400000).toISOString();

    const activeCritical = events.filter(e => e.is_active && (isAdmin ? e.severity : e.host_severity) === 'critical').length;
    const activeWarnings = events.filter(e => e.is_active && (isAdmin ? e.severity : e.host_severity) === 'warning').length;
    const openIncidents = incidents.filter(i => i.status === 'open' || i.status === 'investigating').length;
    
    const smokeToday = events.filter(e => e.alert_type === 'cabin_smoke_detected' && e.first_seen_at >= oneDayAgo).length;
    const impactToday = events.filter(e => e.alert_type === 'impact_detected' && e.first_seen_at >= oneDayAgo).length;
    const powerCutEvents = events.filter(e => e.alert_type === 'tracker_power_cut' && e.first_seen_at >= oneDayAgo).length;
    const geofenceBreaches = events.filter(e => e.alert_type === 'geofence_breach' && e.first_seen_at >= oneDayAgo).length;
    const overspeedViolations = events.filter(e => e.alert_type === 'overspeed_violation' && e.first_seen_at >= oneDayAgo).length;
    
    const offlineDevices = devices.filter(d => d.online_status === 'offline').length;
    const parserErrors = isAdmin ? events.filter(e => e.alert_type === 'telematics_parser_error' && e.first_seen_at >= oneDayAgo).length : 0;
    
    // Command ACK Issues
    const ackIssues = isAdmin ? events.filter(e => e.alert_type === 'command_ack_failure' && e.first_seen_at >= oneDayAgo).length : 0;

    // Time metrics
    let totalAckTime = 0;
    let ackCount = 0;
    let totalResTime = 0;
    let resCount = 0;

    events.forEach(e => {
      if (e.acknowledged_at && e.first_seen_at) {
        totalAckTime += new Date(e.acknowledged_at).getTime() - new Date(e.first_seen_at).getTime();
        ackCount++;
      }
      if (e.resolved_at && e.first_seen_at) {
        totalResTime += new Date(e.resolved_at).getTime() - new Date(e.first_seen_at).getTime();
        resCount++;
      }
    });

    const formatMs = (ms) => {
      if (ms === 0) return 'N/A';
      const mins = Math.floor(ms / 60000);
      if (mins < 60) return `${mins}m`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ${mins % 60}m`;
    };

    const meanAck = ackCount > 0 ? formatMs(totalAckTime / ackCount) : 'N/A';
    const meanRes = resCount > 0 ? formatMs(totalResTime / resCount) : 'N/A';

    // Most active
    const vehicleCounts = {};
    const hostCounts = {};
    events.forEach(e => {
      if (e.vehicle_display_name) vehicleCounts[e.vehicle_display_name] = (vehicleCounts[e.vehicle_display_name] || 0) + 1;
      if (e.host_name) hostCounts[e.host_name] = (hostCounts[e.host_name] || 0) + 1;
    });

    const mostActiveVehicle = Object.keys(vehicleCounts).sort((a,b) => vehicleCounts[b] - vehicleCounts[a])[0] || 'None';
    const mostActiveHost = Object.keys(hostCounts).sort((a,b) => hostCounts[b] - hostCounts[a])[0] || 'None';

    const vehiclesWithAlerts = isHost ? Object.keys(vehicleCounts).length : 0;

    return Response.json({
      kpis: {
        activeCritical,
        activeWarnings,
        openIncidents,
        escalatedAlerts: events.filter(e => e.is_active && (e.escalation_level || 0) > 0).length,
        smokeToday,
        impactToday,
        powerCutEvents,
        geofenceBreaches,
        overspeedViolations,
        offlineDevices,
        parserErrors,
        ackIssues,
        meanAck,
        meanRes,
        mostActiveVehicle,
        mostActiveHost,
        vehiclesWithAlerts
      },
      events: events.slice(0, 100),
      incidents: incidents.slice(0, 50)
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});