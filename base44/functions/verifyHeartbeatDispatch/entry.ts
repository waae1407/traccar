import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Admin diagnostic: verifies end-to-end heartbeat-based command dispatch for a Noran MT20 device.
// Steps checked:
//   1. Base44 device record — UDP session fields
//   2. Recent inbound packets — did any 0x000f heartbeats arrive?
//   3. Command dispatch health — sent vs parked vs timed out
//   4. Traccar device reachability
//   5. Overall verdict

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, '')}${path}`;
}

async function traccarGet(path) {
  const baseUrl  = String(Deno.env.get('TRACCAR_BASE_URL') || '').trim();
  const username = String(Deno.env.get('TRACCAR_USERNAME') || '').trim();
  const password = String(Deno.env.get('TRACCAR_PASSWORD') || '').trim();
  if (!baseUrl || !username || !password) throw new Error('Traccar credentials not configured.');
  const res = await fetch(joinUrl(baseUrl, path), {
    headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), Accept: 'application/json' }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Traccar ${path} failed (${res.status}): ${text}`);
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const uniqueId = String(body.unique_id || 'NR09G51902').trim().toUpperCase();

    const now = Date.now();
    const report = { unique_id: uniqueId, verified_at: new Date().toISOString(), checks: {} };

    // ── CHECK 1: Base44 device record ──
    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: uniqueId });
    const device = devices[0] || null;
    if (!device) {
      return Response.json({ error: `Device ${uniqueId} not found in Base44.` }, { status: 404 });
    }

    const lastInboundMs = device.last_inbound_packet_at ? new Date(device.last_inbound_packet_at).getTime() : null;
    const ageSeconds = lastInboundMs ? Math.round((now - lastInboundMs) / 1000) : null;
    const isFresh60 = lastInboundMs ? (now - lastInboundMs) <= 60000 : false;
    const isFresh90 = lastInboundMs ? (now - lastInboundMs) <= 90000 : false;

    report.checks.device_record = {
      pass: !!device.traccar_device_id && device.production_commands_enabled === true,
      traccar_device_id: device.traccar_device_id,
      lifecycle_status: device.lifecycle_status,
      production_commands_enabled: device.production_commands_enabled,
      production_command_scope: device.production_command_scope,
      last_inbound_packet_at: device.last_inbound_packet_at,
      last_inbound_packet_type: device.last_inbound_packet_type,
      last_inbound_source: device.last_inbound_source,
      udp_session_status: device.udp_session_status,
      udp_session_age_seconds: ageSeconds,
      fresh_at_60s: isFresh60,
      fresh_at_90s: isFresh90
    };

    // ── CHECK 2: Heartbeat events in Base44 ──
    const events = await base44.asServiceRole.entities.TelematicsEvent.filter(
      { telematics_device_id: device.id }, '-created_date', 50
    );

    const heartbeatEvents = events.filter(e =>
      e.event_type === 'mt20_heartbeat_forwarded_log' ||
      e.raw_payload?.parsed_forwarded_log?.packet_type === '0x000f'
    );
    const positionEvents = events.filter(e =>
      e.event_type === 'mt20_voltage_forwarded_log' ||
      e.event_type?.includes('0032') ||
      e.raw_payload?.parsed_forwarded_log?.packet_type === '0x0032'
    );
    const allEventTypes = [...new Set(events.map(e => e.event_type))];
    const webhookEvents = events.filter(e => e.source === 'webhook');

    // Most recent heartbeat
    const latestHeartbeat = heartbeatEvents[0];
    const heartbeatAgeS = latestHeartbeat
      ? Math.round((now - new Date(latestHeartbeat.created_at || latestHeartbeat.created_date).getTime()) / 1000)
      : null;

    report.checks.heartbeat_forwarding = {
      pass: heartbeatEvents.length > 0,
      heartbeat_events_received: heartbeatEvents.length,
      latest_heartbeat_at: latestHeartbeat?.created_at || null,
      heartbeat_age_seconds: heartbeatAgeS,
      position_events_received: positionEvents.length,
      total_webhook_events: webhookEvents.length,
      all_event_types_seen: allEventTypes,
      diagnosis: heartbeatEvents.length === 0
        ? 'FORWARDER NOT YET DEPLOYED — no 0x000f heartbeat packets have reached Base44'
        : `OK — ${heartbeatEvents.length} heartbeat(s) received, latest ${heartbeatAgeS}s ago`
    };

    // ── CHECK 3: Command dispatch health (last 24h) ──
    const cmds = await base44.asServiceRole.entities.TelematicsCommand.filter(
      { telematics_device_id: device.id }, '-created_date', 50
    );
    const cutoff24h = now - 24 * 3600 * 1000;
    const recent = cmds.filter(c => {
      const ms = new Date(c.created_at || c.created_date || 0).getTime();
      return ms >= cutoff24h;
    });

    const outcomes = { sent: 0, executed: 0, parked: 0, timed_out: 0, failed: 0, other: 0 };
    recent.forEach(c => {
      const s = c.queue_status || c.status;
      if (s === 'sent') outcomes.sent++;
      else if (s === 'executed') outcomes.executed++;
      else if (s === 'pending_waiting_for_fresh_session') outcomes.parked++;
      else if (s === 'failed_no_fresh_session') outcomes.timed_out++;
      else if (s === 'failed' || s === 'expired') outcomes.failed++;
      else outcomes.other++;
    });

    const dispatchRate = recent.length > 0
      ? Math.round(((outcomes.sent + outcomes.executed) / recent.length) * 100)
      : null;

    // Last successful dispatch
    const lastSuccess = cmds.find(c => ['sent', 'executed'].includes(c.queue_status || c.status));
    const lastSuccessAgeS = lastSuccess
      ? Math.round((now - new Date(lastSuccess.sent_at || lastSuccess.created_at || 0).getTime()) / 1000)
      : null;

    report.checks.command_dispatch = {
      pass: outcomes.executed > 0 || outcomes.sent > 0,
      commands_last_24h: recent.length,
      outcomes,
      dispatch_rate_pct: dispatchRate,
      last_successful_dispatch_at: lastSuccess?.sent_at || null,
      last_successful_dispatch_age_seconds: lastSuccessAgeS,
      last_successful_command_type: lastSuccess?.command_type || null,
      diagnosis: outcomes.timed_out > 0 && heartbeatEvents.length === 0
        ? `${outcomes.timed_out} command(s) timed out waiting for heartbeat — forwarder not yet deployed`
        : outcomes.executed > 0 || outcomes.sent > 0
          ? `OK — ${outcomes.executed + outcomes.sent} commands dispatched successfully`
          : 'No commands dispatched in last 24h'
    };

    // ── CHECK 4: Traccar device reachability ──
    let traccarCheck = { pass: false };
    try {
      const allTraccarDevices = await traccarGet('/api/devices');
      const list = Array.isArray(allTraccarDevices) ? allTraccarDevices : [];
      const td = list.find(d => String(d.uniqueId || '').trim().toUpperCase() === uniqueId);
      if (td) {
        const tdLastUpdateMs = td.lastUpdate ? new Date(td.lastUpdate).getTime() : null;
        const tdAgeS = tdLastUpdateMs ? Math.round((now - tdLastUpdateMs) / 1000) : null;
        traccarCheck = {
          pass: true,
          id: td.id,
          uniqueId: td.uniqueId,
          status: td.status,
          lastUpdate: td.lastUpdate,
          lastUpdate_age_seconds: tdAgeS,
          id_in_sync: String(device.traccar_device_id) === String(td.id),
          diagnosis: td.status === 'online'
            ? `OK — Traccar reports device online, last update ${tdAgeS}s ago`
            : `WARNING — Traccar reports status "${td.status}", last update ${tdAgeS ?? 'unknown'}s ago`
        };
      } else {
        traccarCheck = { pass: false, diagnosis: `Device ${uniqueId} not found in Traccar` };
      }
    } catch (err) {
      traccarCheck = { pass: false, error: err.message, diagnosis: `Traccar unreachable: ${err.message}` };
    }
    report.checks.traccar_device = traccarCheck;

    // ── OVERALL VERDICT ──
    const checks = report.checks;
    const forwarderDeployed = checks.heartbeat_forwarding.pass;
    const deviceReady = checks.device_record.pass;
    const dispatchWorking = checks.command_dispatch.pass;
    const traccarReachable = checks.traccar_device.pass;

    const allPass = forwarderDeployed && deviceReady && dispatchWorking && traccarReachable;
    const blockers = [];
    if (!deviceReady) blockers.push('Device not production-ready in Base44');
    if (!forwarderDeployed) blockers.push('0x000f heartbeat forwarder not yet deployed on Traccar server');
    if (!dispatchWorking) blockers.push('No successful command dispatches in last 24h');
    if (!traccarReachable) blockers.push('Traccar unreachable or device not found');

    report.verdict = allPass
      ? 'HEARTBEAT-BASED COMMAND DISPATCH VERIFIED'
      : 'REQUIRES MANUAL REVIEW';
    report.blockers = blockers;
    report.summary = {
      forwarder_deployed: forwarderDeployed,
      device_ready: deviceReady,
      dispatch_working: dispatchWorking,
      traccar_reachable: traccarReachable,
      udp_window_active_seconds: 60,
      next_action: allPass
        ? 'All systems nominal. Monitor dispatch rate and heartbeat continuity.'
        : blockers.join('; ')
    };

    return Response.json({ ok: true, report });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});