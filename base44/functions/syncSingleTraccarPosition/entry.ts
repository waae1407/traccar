/**
 * syncSingleTraccarPosition — Fetches the LIVE position for one device from
 * Traccar and updates the cached last_latitude/last_longitude on the
 * TelematicsDevice record. This is the canonical refresh path: any map on
 * the platform that reads the cache will see the fresh coordinates after
 * this call, with zero extra credit cost beyond the single invocation.
 *
 * Access: admin, host (own devices only), customer (active booking vehicles)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function baseUrl() { return String(Deno.env.get('TRACCAR_BASE_URL') || '').replace(/\/+$/, ''); }
function authHeader() {
  const username = Deno.env.get('TRACCAR_USERNAME');
  const password = Deno.env.get('TRACCAR_PASSWORD');
  return 'Basic ' + btoa(`${username}:${password}`);
}

const KNOTS_TO_MPH = 1.15078;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { telematics_device_id } = body;
    if (!telematics_device_id) return Response.json({ error: 'telematics_device_id is required' }, { status: 400 });
    if (!baseUrl()) return Response.json({ error: 'TRACCAR_BASE_URL is not configured' }, { status: 500 });

    // Resolve device
    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: telematics_device_id });
    const device = devices[0];
    if (!device) return Response.json({ error: 'Device not found' }, { status: 404 });
    if (!device.traccar_device_id) return Response.json({ error: 'Device has no Traccar connection' }, { status: 400 });

    // Access control
    if (user.role === 'admin') {
      // Admin: all devices
    } else if (user.role === 'host') {
      const hosts = await base44.asServiceRole.entities.Host.filter({ user_id: user.id }).catch(() => []);
      const host = hosts[0];
      if (!host || device.host_id !== host.id) {
        return Response.json({ error: 'Forbidden: You do not own this vehicle' }, { status: 403 });
      }
    } else {
      // customer / user — must have active booking on this vehicle
      const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ vehicle_id: device.vehicle_id }).catch(() => []);
      const active = bookings.find(b =>
        ['active', 'approved', 'confirmed'].includes(b.booking_status) &&
        (b.user_email === user.email || b.user_id === user.id)
      );
      if (!active) return Response.json({ error: 'Forbidden: No active booking for this vehicle' }, { status: 403 });
    }

    // Fetch live position from Traccar
    const res = await fetch(`${baseUrl()}/api/positions?deviceId=${device.traccar_device_id}`, {
      headers: { Authorization: authHeader(), Accept: 'application/json' }
    });
    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: `Traccar error (${res.status}): ${text.slice(0, 200)}` }, { status: 502 });
    }
    const positions = await res.json();
    if (!Array.isArray(positions) || positions.length === 0) {
      return Response.json({ ok: true, updated: false, reason: 'No positions returned by Traccar' });
    }

    const latest = positions[positions.length - 1];
    if (typeof latest.latitude !== 'number' || typeof latest.longitude !== 'number') {
      return Response.json({ ok: true, updated: false, reason: 'Invalid coordinates in Traccar response' });
    }

    const now = new Date().toISOString();
    const seenAt = latest.fixTime || latest.deviceTime || latest.serverTime || now;
    const speedMph = Math.round((Number(latest.speed || 0) * KNOTS_TO_MPH) * 10) / 10;

    const updates = {
      last_latitude: latest.latitude,
      last_longitude: latest.longitude,
      last_seen_at: seenAt,
      location_updated_at: now,
      location_source: 'traccar',
      speed: speedMph,
      course: Number(latest.course || 0),
      heading: Number(latest.course || 0),
      address: latest.address || device.address || '',
      online_status: 'online',
    };

    await base44.asServiceRole.entities.TelematicsDevice.update(device.id, updates);

    return Response.json({
      ok: true,
      updated: true,
      device_id: device.id,
      unique_id: device.unique_id,
      position: { lat: latest.latitude, lng: latest.longitude },
      speed: speedMph,
      seen_at: seenAt,
    });
  } catch (error) {
    console.error('[syncSingleTraccarPosition] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});