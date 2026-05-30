import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROVIDER_KEY = 'traccar_noran_mt20';

function authHeader() {
  const username = Deno.env.get('TRACCAR_USERNAME');
  const password = Deno.env.get('TRACCAR_PASSWORD');
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function baseUrl() {
  return String(Deno.env.get('TRACCAR_BASE_URL') || '').replace(/\/$/, '');
}

function toIso(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function ignitionStatus(position) {
  const attributes = position?.attributes || {};
  const value = attributes.ignition ?? attributes.motion ?? attributes.acc;
  if (value === true || value === 'true' || value === 1 || value === '1') return 'on';
  if (value === false || value === 'false' || value === 0 || value === '0') return 'off';
  return 'unknown';
}

function onlineStatus(device, position) {
  if (device?.status === 'online') return 'online';
  if (device?.status === 'offline') return 'offline';
  if (!position?.fixTime && !position?.deviceTime && !position?.serverTime) return 'unknown';
  const seen = new Date(position.fixTime || position.deviceTime || position.serverTime).getTime();
  return Date.now() - seen > 30 * 60 * 1000 ? 'offline' : 'online';
}

async function traccarGet(path) {
  const response = await fetch(`${baseUrl()}${path}`, { headers: { Authorization: authHeader(), Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Traccar ${path} failed with ${response.status}`);
  return response.json();
}

async function recordFailure(base44, message) {
  const now = new Date().toISOString();
  await base44.asServiceRole.entities.TelematicsEvent.create({
    provider_key: PROVIDER_KEY,
    event_type: 'traccar_position_sync_failed',
    source: 'sync',
    raw_payload: { error: message },
    created_at: now
  });

  const recent = await base44.asServiceRole.entities.TelematicsEvent.filter({ provider_key: PROVIDER_KEY, event_type: 'traccar_position_sync_failed' }, '-created_date', 5);
  const recentFailures = recent.filter(event => Date.now() - new Date(event.created_at || event.created_date).getTime() < 30 * 60 * 1000);
  if (recentFailures.length >= 3) {
    const openAlerts = await base44.asServiceRole.entities.OperationalAlert.filter({ provider_key: PROVIDER_KEY, alert_type: 'provider_health_warning', status: 'new' }, '-created_date', 5);
    if (openAlerts.length === 0) {
      await base44.asServiceRole.entities.OperationalAlert.create({
        alert_type: 'provider_health_warning',
        severity: 'warning',
        status: 'new',
        title: 'Traccar location update delayed',
        message: 'Traccar position sync has failed repeatedly. Last known vehicle locations remain visible but may be stale.',
        recommended_action: 'Review Traccar connectivity and credentials before relying on current GPS freshness.',
        provider_key: PROVIDER_KEY,
        metadata: { recent_failures: recentFailures.length, last_error: message }
      });
    }
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    if (!baseUrl()) return Response.json({ error: 'TRACCAR_BASE_URL is not configured' }, { status: 500 });

    const [traccarDevices, positions, localDevices] = await Promise.all([
      traccarGet('/api/devices'),
      traccarGet('/api/positions'),
      base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: PROVIDER_KEY }, '-updated_date', 500)
    ]);

    const traccarById = new Map((traccarDevices || []).map(device => [String(device.id), device]));
    const positionsByDeviceId = new Map((positions || []).map(position => [String(position.deviceId), position]));
    let updated = 0;
    const skipped = [];

    for (const local of localDevices) {
      const traccarId = String(local.traccar_device_id || local.provider_device_id || '').trim();
      if (!traccarId) { skipped.push({ id: local.id, reason: 'missing_traccar_device_id' }); continue; }
      const position = positionsByDeviceId.get(traccarId);
      if (!position || typeof position.latitude !== 'number' || typeof position.longitude !== 'number') { skipped.push({ id: local.id, reason: 'no_position' }); continue; }
      const traccarDevice = traccarById.get(traccarId);
      const seenAt = toIso(position.fixTime || position.deviceTime || position.serverTime);
      const payload = {
        last_latitude: position.latitude,
        last_longitude: position.longitude,
        last_seen_at: seenAt,
        speed: Number(position.speed || 0),
        course: Number(position.course || 0),
        heading: Number(position.course || 0),
        address: position.address || local.address || '',
        location_source: 'traccar',
        location_updated_at: new Date().toISOString(),
        online_status: onlineStatus(traccarDevice, position),
        ignition_status: ignitionStatus(position)
      };
      await base44.asServiceRole.entities.TelematicsDevice.update(local.id, payload);
      updated += 1;
    }

    return Response.json({ ok: true, provider_key: PROVIDER_KEY, updated, skipped_count: skipped.length, skipped });
  } catch (error) {
    await recordFailure(base44, error.message);
    return Response.json({ ok: false, error: error.message, warning: 'Location update delayed. Last known locations remain available.' }, { status: 500 });
  }
});