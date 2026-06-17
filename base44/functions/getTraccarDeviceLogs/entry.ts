import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function baseUrl() {
  return String(Deno.env.get('TRACCAR_BASE_URL') || '').replace(/\/+$/, '');
}

function authHeader() {
  const username = Deno.env.get('TRACCAR_USERNAME');
  const password = Deno.env.get('TRACCAR_PASSWORD');
  return 'Basic ' + btoa(`${username}:${password}`);
}

function joinUrl(path) {
  return `${baseUrl()}${path}`;
}

async function traccarGet(path) {
  const res = await fetch(joinUrl(path), {
    headers: { Authorization: authHeader(), Accept: 'application/json' }
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Traccar ${path} failed (${res.status}): ${text}`);
  return data;
}

function isoAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json();
    const identifier = String(body.identifier || body.device_id || body.unique_id || '').trim().toUpperCase();
    const hoursBack = Math.min(Math.max(Number(body.hours_back || 24), 1), 168); // 1h–7d
    const maxPositions = Math.min(Math.max(Number(body.max_positions || 100), 1), 500);

    if (!identifier) return Response.json({ error: 'identifier or device_id is required' }, { status: 400 });
    if (!baseUrl()) return Response.json({ error: 'TRACCAR_BASE_URL is not configured' }, { status: 500 });

    // 1. Find the Traccar device by uniqueId / name
    const allDevices = await traccarGet('/api/devices');
    const deviceList = Array.isArray(allDevices) ? allDevices : [];
    const traccarDevice = deviceList.find(d =>
      String(d.uniqueId || '').toUpperCase() === identifier ||
      String(d.name || '').toUpperCase() === identifier ||
      String(d.id || '') === identifier
    );

    if (!traccarDevice) {
      return Response.json({
        ok: false,
        error: `Device "${identifier}" not found in Traccar.`,
        searched_count: deviceList.length
      }, { status: 404 });
    }

    const deviceId = traccarDevice.id;
    const fromIso = isoAgo(hoursBack);
    const toIso = new Date().toISOString();
    const fromEnc = encodeURIComponent(fromIso);
    const toEnc = encodeURIComponent(toIso);

    // 2. Fetch positions
    let positions = [];
    try {
      const raw = await traccarGet(
        `/api/positions?deviceId=${deviceId}&from=${fromEnc}&to=${toEnc}`
      );
      positions = (Array.isArray(raw) ? raw : [])
        .sort((a, b) => new Date(b.fixTime || b.deviceTime || 0) - new Date(a.fixTime || a.deviceTime || 0))
        .slice(0, maxPositions)
        .map(p => ({
          id: p.id,
          fixTime: p.fixTime,
          deviceTime: p.deviceTime,
          serverTime: p.serverTime,
          latitude: p.latitude,
          longitude: p.longitude,
          altitude: p.altitude,
          speed: p.speed,
          course: p.course,
          valid: p.valid,
          accuracy: p.accuracy,
          address: p.address,
          attributes: p.attributes || {}
        }));
    } catch (err) {
      console.warn('Positions fetch failed:', err.message);
    }

    // 3. Fetch events
    let events = [];
    try {
      const raw = await traccarGet(
        `/api/reports/events?deviceId=${deviceId}&from=${fromEnc}&to=${toEnc}&type=allEvents`
      );
      events = (Array.isArray(raw) ? raw : [])
        .sort((a, b) => new Date(b.eventTime || 0) - new Date(a.eventTime || 0))
        .slice(0, 200)
        .map(e => ({
          id: e.id,
          eventTime: e.eventTime,
          type: e.type,
          positionId: e.positionId,
          geofenceId: e.geofenceId,
          maintenanceId: e.maintenanceId,
          attributes: e.attributes || {}
        }));
    } catch (err) {
      console.warn('Events fetch failed:', err.message);
    }

    // 4. Latest position
    let latestPosition = null;
    try {
      const raw = await traccarGet(`/api/positions?deviceId=${deviceId}`);
      const list = Array.isArray(raw) ? raw : [];
      if (list.length) {
        const p = list[list.length - 1];
        latestPosition = {
          fixTime: p.fixTime,
          deviceTime: p.deviceTime,
          serverTime: p.serverTime,
          latitude: p.latitude,
          longitude: p.longitude,
          speed: p.speed,
          course: p.course,
          valid: p.valid,
          address: p.address,
          attributes: p.attributes || {}
        };
      }
    } catch (err) {
      console.warn('Latest position fetch failed:', err.message);
    }

    return Response.json({
      ok: true,
      query: { identifier, hours_back: hoursBack, from: fromIso, to: toIso },
      device: {
        id: traccarDevice.id,
        name: traccarDevice.name,
        uniqueId: traccarDevice.uniqueId,
        status: traccarDevice.status,
        lastUpdate: traccarDevice.lastUpdate,
        disabled: traccarDevice.disabled,
        phone: traccarDevice.phone,
        model: traccarDevice.model,
        category: traccarDevice.category
      },
      latest_position: latestPosition,
      positions: {
        count: positions.length,
        data: positions
      },
      events: {
        count: events.length,
        data: events
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});