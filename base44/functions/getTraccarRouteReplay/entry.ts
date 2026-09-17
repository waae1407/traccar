/**
 * getTraccarRouteReplay — Fetches historical GPS positions from Traccar for route replay.
 *
 * Accepts: telematics_device_id, from (ISO), to (ISO)
 * Returns positions sorted oldest-first with speed converted to mph.
 *
 * Access control:
 *   admin   → all devices
 *   host    → only devices on their own vehicles
 *   customer → only devices on vehicles with their active booking
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function baseUrl() { return String(Deno.env.get('TRACCAR_BASE_URL') || '').replace(/\/+$/, ''); }
function authHeader() {
  const username = Deno.env.get('TRACCAR_USERNAME');
  const password = Deno.env.get('TRACCAR_PASSWORD');
  return 'Basic ' + btoa(`${username}:${password}`);
}

async function traccarGet(path) {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: { Authorization: authHeader(), Accept: 'application/json' }
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Traccar (${res.status}): ${text.slice(0, 200)}`);
  return data;
}

const KNOTS_TO_MPH = 1.15078;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { telematics_device_id, from, to } = body;

    if (!telematics_device_id) return Response.json({ error: 'telematics_device_id is required' }, { status: 400 });
    if (!from || !to) return Response.json({ error: 'from and to dates are required' }, { status: 400 });
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
    } else if (user.role === 'customer' || user.role === 'user') {
      const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ vehicle_id: device.vehicle_id }).catch(() => []);
      const activeBooking = bookings.find(b =>
        ['active', 'approved', 'confirmed'].includes(b.booking_status) &&
        (b.user_email === user.email || b.user_id === user.id)
      );
      if (!activeBooking) {
        return Response.json({ error: 'Forbidden: No active booking for this vehicle' }, { status: 403 });
      }
    } else {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch positions from Traccar
    const fromEnc = encodeURIComponent(from);
    const toEnc = encodeURIComponent(to);
    const raw = await traccarGet(`/api/positions?deviceId=${device.traccar_device_id}&from=${fromEnc}&to=${toEnc}`);

    // Sort oldest first for replay, convert speed to mph, filter invalid coords
    const positions = (Array.isArray(raw) ? raw : [])
      .filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
        && p.latitude !== 0 && p.longitude !== 0
        && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180)
      .sort((a, b) => new Date(a.fixTime || a.deviceTime || 0) - new Date(b.fixTime || b.deviceTime || 0))
      .map(p => ({
        lat: p.latitude,
        lng: p.longitude,
        speed_mph: Math.round((p.speed || 0) * KNOTS_TO_MPH * 10) / 10,
        course: p.course || 0,
        timestamp: p.fixTime || p.deviceTime || p.serverTime,
        altitude: p.altitude,
        address: p.address,
      }));

    return Response.json({
      ok: true,
      device: { unique_id: device.unique_id, traccar_device_id: device.traccar_device_id },
      positions,
      count: positions.length,
    });
  } catch (error) {
    console.error('[getTraccarRouteReplay] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});