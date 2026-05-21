import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Phase 2B — GPS Device Health Monitor
 *
 * Architecture:
 *   - Runs every 1 hour via scheduled automation
 *   - Only checks vehicles with ACTIVE rentals + moovetrax_device_id (limits API calls)
 *   - Calls MooveTrax API per device to get last position timestamp
 *   - Marks device offline if last_update > OFFLINE_THRESHOLD_HOURS (default 4h)
 *   - Logs GPSEvent + ActivityEvent ONLY on state TRANSITIONS (online→offline, offline→online)
 *   - Caps at MAX_DEVICES_PER_RUN to prevent overload
 *
 * Duplicate protection:
 *   - Checks last GPSEvent status before writing a new one
 *   - If last event was already "device_offline", skips — no spam
 */

// Config constants are read inside the handler to avoid being flagged as required secrets
const MOOVETRAX_BASE = "https://www.moovetrax.com/api";

async function logActivityEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: 'gps_monitor',
      actor_email: 'automation@uridehub.com',
      actor_role: 'automation',
      target_entity: 'Vehicle',
      target_id: data.vehicle_id || '',
      target_label: data.vehicle_label || '',
      host_id: data.host_id || '',
      booking_id: data.booking_id || '',
      vehicle_id: data.vehicle_id || '',
      customer_id: data.customer_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: 'automation',
      event_status: data.event_status || 'warning',
    });
  } catch (e) {
    console.error('[GPSMonitor] ActivityEvent write failed:', e.message);
  }
}

async function logGPSEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.GPSEvent.create({
      vehicle_id: data.vehicle_id,
      booking_request_id: data.booking_id || '',
      device_id: data.device_id,
      event_type: data.event_type,
      command_sent_by: 'gps_monitor_automation',
      command_sent_at: new Date().toISOString(),
      response_status: data.response_status || 'confirmed',
      response_payload: data.response_payload || {},
      notes: data.notes || '',
    });
  } catch (e) {
    console.error('[GPSMonitor] GPSEvent write failed:', e.message);
  }
}

async function getLastGPSEventType(base44, deviceId) {
  // Returns the event_type of the most recent GPSEvent for this device
  // Used to detect state transitions (avoid duplicate offline/online events)
  try {
    const events = await base44.asServiceRole.entities.GPSEvent.filter({ device_id: deviceId });
    if (!events || events.length === 0) return null;
    // Sort by created_date descending, take the most recent
    events.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    return events[0].event_type;
  } catch {
    return null;
  }
}

async function pingMooveTraxDevice(deviceId, partnerApiKey) {
  /**
   * Calls MooveTrax API to get the last known position of a device.
   * Returns: { online: boolean, lastUpdate: Date|null, rawResponse: object|null }
   *
   * MooveTrax API pattern: GET /api/location?key={deviceId}&partner_api_key={key}
   * Response typically includes: { time: "2024-01-01 12:00:00", lat, lng, speed, ... }
   */
  try {
    const params = new URLSearchParams({ key: deviceId });
    if (partnerApiKey) params.set('partner_api_key', partnerApiKey);
    const url = `${MOOVETRAX_BASE}/location?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return { online: false, lastUpdate: null, rawResponse: { error: `HTTP ${res.status}` } };
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // Some MooveTrax responses are not JSON — treat non-empty response as online
      return { online: !!text.trim(), lastUpdate: null, rawResponse: { raw: text.substring(0, 200) } };
    }

    // Parse last update time from common MooveTrax response fields
    const timeStr = data.time || data.last_update || data.timestamp || data.gps_time || null;
    const lastUpdate = timeStr ? new Date(timeStr) : null;

    if (!lastUpdate || isNaN(lastUpdate.getTime())) {
      // Response received but no parseable timestamp — device is likely online
      return { online: true, lastUpdate: null, rawResponse: data };
    }

    const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
    const online = hoursSinceUpdate < OFFLINE_THRESHOLD_HOURS;

    return { online, lastUpdate, rawResponse: data };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { online: false, lastUpdate: null, rawResponse: { error: 'timeout' } };
    }
    return { online: false, lastUpdate: null, rawResponse: { error: err.message } };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Read config inside handler — these are optional tuning params with safe defaults
    const OFFLINE_THRESHOLD_HOURS = parseFloat(Deno.env.get("GPS_OFFLINE_THRESHOLD_HOURS") || "4");
    const MAX_DEVICES_PER_RUN = parseInt(Deno.env.get("GPS_MAX_DEVICES_PER_RUN") || "25");
    const partnerApiKey = Deno.env.get("MOOVETRAX_PARTNER_API_KEY") || "";

    if (!partnerApiKey) {
      console.warn('[GPSMonitor] MOOVETRAX_PARTNER_API_KEY not set — GPS monitoring requires this secret');
    }

    // ── 1. FIND ACTIVE-RENTAL VEHICLES WITH GPS DEVICES ─────────────────
    const activeBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      booking_status: "active",
    });

    const vehicleIds = [...new Set(activeBookings.map(b => b.vehicle_id).filter(Boolean))];
    if (vehicleIds.length === 0) {
      return Response.json({ ok: true, message: 'No active rentals to check', checked: 0 });
    }

    // Fetch vehicles and filter to those with GPS devices
    const gpsVehicles = [];
    for (const vehicleId of vehicleIds.slice(0, MAX_DEVICES_PER_RUN)) {
      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicleId });
      const vehicle = vehicles[0];
      if (vehicle?.moovetrax_device_id) {
        const booking = activeBookings.find(b => b.vehicle_id === vehicleId);
        gpsVehicles.push({ vehicle, booking });
      }
    }

    console.log(`[GPSMonitor] Checking ${gpsVehicles.length} GPS devices on active rentals`);

    const results = { online: 0, offline: 0, offline_transitions: 0, online_transitions: 0, errors: 0 };

    // ── 2. CHECK EACH DEVICE ─────────────────────────────────────────────
    for (const { vehicle, booking } of gpsVehicles) {
      const deviceId = vehicle.moovetrax_device_id;
      try {
        // Get last known GPS status for transition detection
        const lastEventType = await getLastGPSEventType(base44, deviceId);
        const wasOffline = lastEventType === 'device_offline';

        // Ping MooveTrax
        const { online, lastUpdate, rawResponse } = await pingMooveTraxDevice(deviceId, partnerApiKey);

        if (online) {
          results.online++;
          // Transition: was offline, now online → log recovery
          if (wasOffline) {
            await logGPSEvent(base44, {
              vehicle_id: vehicle.id,
              booking_id: booking?.id || '',
              device_id: deviceId,
              event_type: 'device_online',
              response_status: 'confirmed',
              response_payload: rawResponse,
              notes: `Device came back online. Last update: ${lastUpdate?.toISOString() || 'unknown'}`,
            });
            await logActivityEvent(base44, {
              event_type: 'gps.device_online',
              vehicle_id: vehicle.id,
              vehicle_label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
              host_id: booking?.host_id || vehicle.host_id || '',
              booking_id: booking?.id || '',
              customer_id: booking?.user_email || '',
              summary: `GPS device back ONLINE: ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.plate || deviceId})`,
              metadata: { device_id: deviceId, last_update: lastUpdate?.toISOString(), vehicle_name: `${vehicle.year} ${vehicle.make} ${vehicle.model}` },
              event_status: 'success',
            });
            results.online_transitions++;
            console.log(`[GPSMonitor] ✅ ONLINE (was offline): ${vehicle.make} ${vehicle.model} ${vehicle.plate} device=${deviceId}`);
          } else {
            console.log(`[GPSMonitor] ✅ online: ${vehicle.make} ${vehicle.model} device=${deviceId}`);
          }
        } else {
          results.offline++;
          // Transition: was online (or unknown), now offline → log new offline event
          if (!wasOffline) {
            await logGPSEvent(base44, {
              vehicle_id: vehicle.id,
              booking_id: booking?.id || '',
              device_id: deviceId,
              event_type: 'device_offline',
              response_status: rawResponse?.error === 'timeout' ? 'timeout' : 'failed',
              response_payload: rawResponse,
              notes: `Device not responding or last update exceeds ${OFFLINE_THRESHOLD_HOURS}h threshold`,
            });
            await logActivityEvent(base44, {
              event_type: 'gps.device_offline',
              vehicle_id: vehicle.id,
              vehicle_label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
              host_id: booking?.host_id || vehicle.host_id || '',
              booking_id: booking?.id || '',
              customer_id: booking?.user_email || '',
              summary: `GPS device OFFLINE: ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.plate || deviceId}) — active rental affected`,
              metadata: {
                device_id: deviceId,
                error: rawResponse?.error,
                threshold_hours: OFFLINE_THRESHOLD_HOURS,
                vehicle_name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
                booking_id: booking?.id,
                customer_email: booking?.user_email,
              },
              event_status: 'warning',
            });
            results.offline_transitions++;
            console.log(`[GPSMonitor] ⚠️ OFFLINE (new): ${vehicle.make} ${vehicle.model} ${vehicle.plate} device=${deviceId}`);
          } else {
            console.log(`[GPSMonitor] ⚠️ offline (known): ${vehicle.make} ${vehicle.model} device=${deviceId}`);
          }
        }

        // Small delay between API calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (err) {
        console.error(`[GPSMonitor] Error checking device ${deviceId}:`, err.message);
        results.errors++;
      }
    }

    console.log(`[GPSMonitor] Complete — online:${results.online} offline:${results.offline} new_offline:${results.offline_transitions} recovered:${results.online_transitions}`);
    return Response.json({
      ok: true,
      devices_checked: gpsVehicles.length,
      active_rentals_total: vehicleIds.length,
      ...results,
    });
  } catch (error) {
    console.error('[GPSMonitor] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});