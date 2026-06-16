import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// TELEMATICS RECONCILIATION
// Compares Traccar device inventory against Base44 TelematicsDevice records.
// Traccar is the source of truth for device existence and last heartbeat.

function joinUrl(baseUrl, path) { return `${baseUrl.replace(/\/+$/, '')}${path}`; }
function envValue(name) { return String(Deno.env.toObject()[name] || '').trim(); }

function traccarOnlineStatus(lastUpdate) {
  if (!lastUpdate) return 'unknown';
  const ageMs = Date.now() - new Date(lastUpdate).getTime();
  if (ageMs < 30 * 60 * 1000) return 'online';
  if (ageMs < 24 * 60 * 60 * 1000) return 'stale';
  return 'offline';
}

function heartbeatAge(lastUpdate) {
  if (!lastUpdate) return null;
  const ageMs = Date.now() - new Date(lastUpdate).getTime();
  if (ageMs < 60 * 1000) return `${Math.round(ageMs / 1000)}s ago`;
  if (ageMs < 60 * 60 * 1000) return `${Math.round(ageMs / 60000)}m ago`;
  if (ageMs < 24 * 60 * 60 * 1000) return `${Math.round(ageMs / 3600000)}h ago`;
  return `${Math.round(ageMs / 86400000)}d ago`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const baseUrl = envValue('TRACCAR_BASE_URL');
    const username = envValue('TRACCAR_USERNAME');
    const password = envValue('TRACCAR_PASSWORD');
    if (!baseUrl || !username || !password) {
      return Response.json({ error: 'Traccar credentials not configured' }, { status: 500 });
    }

    // Fetch Traccar devices and positions in parallel with Base44 devices
    const [traccarDevRes, traccarPosRes, base44Devices] = await Promise.all([
      fetch(joinUrl(baseUrl, '/api/devices'), {
        headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      }),
      fetch(joinUrl(baseUrl, '/api/positions'), {
        headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      }),
      base44.asServiceRole.entities.TelematicsDevice.list('-updated_date', 1000),
    ]);

    if (!traccarDevRes.ok) {
      return Response.json({ error: `Traccar responded with ${traccarDevRes.status}` }, { status: 502 });
    }

    const traccarDevices = await traccarDevRes.json();
    const traccarPositions = traccarPosRes.ok ? await traccarPosRes.json() : [];

    // Build position map: traccar device id -> latest position
    const positionMap = new Map();
    if (Array.isArray(traccarPositions)) {
      for (const pos of traccarPositions) {
        positionMap.set(String(pos.deviceId), pos);
      }
    }

    // Build lookup maps
    // Traccar: by uniqueId (uppercased)
    const traccarByUniqueId = new Map();
    const traccarById = new Map();
    for (const td of traccarDevices) {
      const key = String(td.uniqueId || '').trim().toUpperCase();
      if (key) traccarByUniqueId.set(key, td);
      traccarById.set(String(td.id), td);
    }

    // Base44: by traccar_device_id and by unique_id
    const base44ByTraccarId = new Map();
    const base44ByUniqueId = new Map();
    for (const d of base44Devices) {
      if (d.traccar_device_id) base44ByTraccarId.set(String(d.traccar_device_id), d);
      const key = String(d.unique_id || '').trim().toUpperCase();
      if (key) base44ByUniqueId.set(key, d);
    }

    // --- Reconciliation ---

    // Devices in Traccar with their status
    const traccarRows = traccarDevices.map(td => {
      const pos = positionMap.get(String(td.id));
      const lastUpdate = pos?.fixTime || pos?.deviceTime || pos?.serverTime || td.lastUpdate;
      const uKey = String(td.uniqueId || '').trim().toUpperCase();
      const b44 = base44ByTraccarId.get(String(td.id)) || base44ByUniqueId.get(uKey);
      return {
        traccar_id: td.id,
        unique_id: td.uniqueId || '',
        traccar_name: td.name || '',
        online_status: traccarOnlineStatus(lastUpdate),
        last_update: lastUpdate || null,
        heartbeat_age: heartbeatAge(lastUpdate),
        in_base44: !!b44,
        base44_id: b44?.id || null,
        base44_vehicle_id: b44?.vehicle_id || null,
        base44_lifecycle: b44?.lifecycle_status || null,
      };
    });

    // Devices in Base44 missing from Traccar
    const missingInTraccar = base44Devices
      .filter(d => {
        const uKey = String(d.unique_id || '').trim().toUpperCase();
        const hasTraccarId = d.traccar_device_id && traccarById.has(String(d.traccar_device_id));
        const hasUniqueId = uKey && traccarByUniqueId.has(uKey);
        return !hasTraccarId && !hasUniqueId;
      })
      .map(d => ({
        base44_id: d.id,
        unique_id: d.unique_id || '',
        traccar_device_id: d.traccar_device_id || null,
        vehicle_id: d.vehicle_id || null,
        provider_key: d.provider_key || '',
        lifecycle_status: d.lifecycle_status || '',
        last_seen_at: d.last_seen_at || null,
      }));

    const missingInBase44 = traccarRows.filter(r => !r.in_base44);

    // Summary KPIs
    const onlineCount = traccarRows.filter(r => r.online_status === 'online').length;
    const staleCount = traccarRows.filter(r => r.online_status === 'stale').length;
    const offlineCount = traccarRows.filter(r => r.online_status === 'offline').length;
    const unknownCount = traccarRows.filter(r => r.online_status === 'unknown').length;

    return Response.json({
      summary: {
        traccar_device_count: traccarDevices.length,
        base44_device_count: base44Devices.length,
        matched_count: traccarRows.filter(r => r.in_base44).length,
        missing_in_base44: missingInBase44.length,
        missing_in_traccar: missingInTraccar.length,
        online_count: onlineCount,
        stale_count: staleCount,
        offline_count: offlineCount,
        unknown_count: unknownCount,
        status_source: 'traccar_live',
      },
      traccar_devices: traccarRows,
      missing_in_base44: missingInBase44,
      missing_in_traccar: missingInTraccar,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getTelematicsReconciliation]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});