import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// TELEMATICS DASHBOARD — Traccar is source of truth for device status
// Online/offline/stale is computed from Traccar lastUpdate timestamps, not Base44 fields.

function joinUrl(baseUrl, path) { return `${baseUrl.replace(/\/+$/, '')}${path}`; }
function envValue(name) { return String(Deno.env.toObject()[name] || '').trim(); }

async function fetchTraccarDevices() {
  const baseUrl = envValue('TRACCAR_BASE_URL');
  const username = envValue('TRACCAR_USERNAME');
  const password = envValue('TRACCAR_PASSWORD');
  if (!baseUrl || !username || !password) return null;
  try {
    const res = await fetch(joinUrl(baseUrl, '/api/devices'), {
      headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

async function fetchTraccarPositions() {
  const baseUrl = envValue('TRACCAR_BASE_URL');
  const username = envValue('TRACCAR_USERNAME');
  const password = envValue('TRACCAR_PASSWORD');
  if (!baseUrl || !username || !password) return [];
  try {
    const res = await fetch(joinUrl(baseUrl, '/api/positions'), {
      headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// Determine online status from Traccar lastUpdate timestamp
// Traccar "status" field: "online" | "unknown" | "offline"
// We also use lastUpdate age as fallback
function traccarOnlineStatus(td, pos) {
  // Prefer Traccar's own status field if present
  if (td?.status === 'online') return 'online';
  if (td?.status === 'offline') return 'offline';

  // Fall back to timestamp age
  const lastUpdate = pos?.fixTime || pos?.deviceTime || pos?.serverTime || td?.lastUpdate;
  if (!lastUpdate) return 'unknown';
  const ageMs = Date.now() - new Date(lastUpdate).getTime();
  if (ageMs < 30 * 60 * 1000) return 'online';          // < 30 min
  if (ageMs < 24 * 60 * 60 * 1000) return 'stale';      // 30 min – 24 h
  return 'offline';
}

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

    const today = new Date().toISOString().split('T')[0];

    // Fetch Base44 devices and Traccar devices+positions in parallel
    const [base44Devices, traccarDevices, traccarPositions] = await Promise.all([
      scopedHostId
        ? base44.asServiceRole.entities.TelematicsDevice.filter({ host_id: scopedHostId }, '-updated_date', 500)
        : base44.asServiceRole.entities.TelematicsDevice.list('-updated_date', 500),
      fetchTraccarDevices(),
      fetchTraccarPositions(),
    ]);

    // Build Traccar lookup maps
    const traccarById = new Map();
    const traccarByUniqueId = new Map();
    const traccarPositionMap = new Map(); // traccar numeric id -> position
    if (traccarDevices) {
      for (const td of traccarDevices) {
        traccarById.set(String(td.id), td);
        traccarByUniqueId.set(String(td.uniqueId || '').trim().toUpperCase(), td);
      }
    }
    for (const pos of traccarPositions) {
      traccarPositionMap.set(String(pos.deviceId), pos);
    }

    // Enrich each Base44 device with Traccar live status.
    // CRITICAL: if Traccar is reachable but a device has NO match in Traccar,
    // its status is "not_in_traccar" — NOT stale. Only devices Traccar knows about
    // get online/offline/stale status from Traccar's own status field + timestamps.
    let onlineCount = 0, offlineCount = 0, staleCount = 0, unknownCount = 0, notInTraccarCount = 0;
    const enrichedDevices = base44Devices.map(d => {
      const traccarDeviceId = String(d.traccar_device_id || '');
      const uniqueIdKey = String(d.unique_id || '').trim().toUpperCase();
      const td = traccarById.get(traccarDeviceId) || traccarByUniqueId.get(uniqueIdKey);

      let status;
      let lastUpdate = null;

      if (!traccarDevices) {
        // Traccar unreachable — fall back to Base44 cache
        status = d.online_status || 'unknown';
      } else if (!td) {
        // Device exists in Base44 but NOT in Traccar — don't count as stale/offline
        status = 'not_in_traccar';
        notInTraccarCount++;
      } else {
        const pos = traccarPositionMap.get(String(td.id));
        lastUpdate = pos?.fixTime || pos?.deviceTime || pos?.serverTime || td?.lastUpdate;
        status = traccarOnlineStatus(td, pos);
      }

      if (status === 'online') onlineCount++;
      else if (status === 'offline') offlineCount++;
      else if (status === 'stale') staleCount++;
      else if (status !== 'not_in_traccar') unknownCount++;

      return {
        id: d.id,
        unique_id: d.unique_id,
        vehicle_id: d.vehicle_id,
        online_status: status,
        traccar_native_status: td?.status || null,
        last_heartbeat_at: lastUpdate || d.last_seen_at,
        traccar_synced: !!td,
        provider_key: d.provider_key,
        starter_disabled: d.starter_disabled,
        lifecycle_status: d.lifecycle_status,
      };
    });

    const totalDevices = base44Devices.length;
    const starterDisabledCount = base44Devices.filter(d => d.starter_disabled).length;
    const liveEnabledCount = base44Devices.filter(d => d.lifecycle_status === 'live_enabled').length;
    const traccarSyncedCount = enrichedDevices.filter(d => d.traccar_synced).length;

    // Parallel: lightweight counts
    const [recentCommands, pendingInstalls, activeAlarms, recentAlerts] = await Promise.all([
      base44.asServiceRole.entities.TelematicsCommand.list('-created_date', 50),
      base44.asServiceRole.entities.TelematicsInstallRecord.filter({ qa_status: 'pending' }, '-created_date', 100),
      base44.asServiceRole.entities.TelematicsAlarmSession.filter({ status: 'active' }, '-started_at', 20),
      base44.asServiceRole.entities.OperationalAlert.filter({ domain: 'telematics' }, '-created_date', 50),
    ]);

    const deviceIds = new Set(base44Devices.map(d => d.id));
    const scopedVehicleIds = new Set(base44Devices.map(d => d.vehicle_id).filter(Boolean));
    const scopedCommands = scopedHostId
      ? recentCommands.filter(c => deviceIds.has(c.telematics_device_id) || deviceIds.has(c.device_id) || (c.vehicle_id && scopedVehicleIds.has(c.vehicle_id)))
      : recentCommands;

    const commandSentFailedCount = scopedCommands.filter(c =>
      ['failed', 'expired', 'blocked'].includes(c.queue_status || c.status) &&
      !['delivered', 'acknowledged', 'executed'].includes(c.confirmation_status || '')
    ).length;
    const commandTodayCount = scopedCommands.filter(c => c.created_at && c.created_at.startsWith(today)).length;

    const offlineDeviceSummary = enrichedDevices
      .filter(d => ['offline', 'stale', 'unknown'].includes(d.online_status))
      .slice(0, 20);

    const warnings = [];
    if (offlineCount > 0) warnings.push(`${offlineCount} device(s) offline`);
    if (staleCount > 0) warnings.push(`${staleCount} device(s) have stale heartbeat (30min–24h)`);
    if (commandSentFailedCount > 0) warnings.push(`${commandSentFailedCount} command(s) failed to send`);
    if (starterDisabledCount > 0) warnings.push(`${starterDisabledCount} vehicle(s) with starter disabled`);
    if (!traccarDevices) warnings.push('Traccar unreachable — status from Base44 cache');
    if (notInTraccarCount > 0) warnings.push(`${notInTraccarCount} Base44 device(s) not provisioned in Traccar`);
    if (totalDevices >= 500) warnings.push('Device list capped at 500 — use Devices tab for full list');

    return Response.json({
      kpis: {
        total_devices: totalDevices,
        online_count: onlineCount,
        offline_count: offlineCount,
        stale_count: staleCount,
        unknown_count: unknownCount,
        not_in_traccar_count: notInTraccarCount,
        starter_disabled_count: starterDisabledCount,
        live_enabled_count: liveEnabledCount,
        command_failed_count: commandSentFailedCount,
        commands_today: commandTodayCount,
        installs_pending_qa: pendingInstalls.length,
        active_alarms: activeAlarms.length,
        open_alerts_count: recentAlerts.length,
        traccar_device_count: traccarDevices ? traccarDevices.length : null,
        traccar_synced_count: traccarSyncedCount,
      },
      offline_device_summary: offlineDeviceSummary,
      active_alarms: activeAlarms.slice(0, 5),
      warnings,
      traccar_available: !!traccarDevices,
      scope: isAdmin && !scopedHostId ? 'admin' : 'host',
      generated_at: new Date().toISOString(),
      status_source: traccarDevices ? 'traccar_live' : 'base44_cache',
    });
  } catch (error) {
    console.error('[getTelematicsDashboard]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});