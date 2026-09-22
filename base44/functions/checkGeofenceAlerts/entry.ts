import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

/**
 * checkGeofenceAlerts — Scheduled geofence/movement monitor for GPS-only customers.
 *
 * For each active GeofenceAlert:
 *   - parked_movement: if vehicle moved > radius_miles from parked_lat/parked_lon → alert
 *   - radius_breach:   if vehicle moved > radius_miles from center_lat/center_lon → alert
 *   - curfew:          if vehicle moves during curfew hours → alert
 *
 * If auto_kill_on_breach is true, sends disable_starter command.
 * Sends push + email + SMS to the owner.
 *
 * Triggered by: cron every 5-10 minutes (CRON_SECRET) or admin.
 */

function getDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const cronSecret = url.searchParams.get('secret');
    const isCron = cronSecret === Deno.env.get('CRON_SECRET');

    if (!isCron) {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const now = new Date();
    const results = { checked: 0, alerts_sent: 0, auto_kills: 0, errors: [] };

    // Get all active geofence alerts
    const alerts = await base44.asServiceRole.entities.GeofenceAlert.filter({
      is_active: true,
    }, '-created_date', 500);

    results.checked = alerts.length;

    for (const alert of alerts) {
      try {
        // Suppression check
        if (alert.last_alerted_at) {
          const minsSinceAlert = (now.getTime() - new Date(alert.last_alerted_at).getTime()) / 60000;
          if (minsSinceAlert < (alert.suppress_minutes || 15)) continue;
        }

        // Get device current position
        const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: alert.telematics_device_id }, '-created_date', 1);
        const device = devices[0];
        if (!device || !device.last_latitude || !device.last_longitude) continue;

        const curLat = device.last_latitude;
        const curLon = device.last_longitude;
        let breached = false;
        let breachReason = '';

        if (alert.alert_type === 'parked_movement') {
          if (alert.parked_lat && alert.parked_lon) {
            const dist = getDistanceMiles(alert.parked_lat, alert.parked_lon, curLat, curLon);
            if (dist > (alert.radius_miles || 0.5)) {
              breached = true;
              breachReason = `Vehicle moved ${dist.toFixed(2)} miles from parked location (threshold: ${alert.radius_miles} miles)`;
            }
          }
          // Update parked position if currently parked
          if ((device.speed === 0 || device.ignition_status === 'off') && !breached) {
            if (!alert.parked_lat || Math.abs(alert.parked_lat - curLat) > 0.001 || Math.abs(alert.parked_lon - curLon) > 0.001) {
              await base44.asServiceRole.entities.GeofenceAlert.update(alert.id, {
                parked_lat: curLat,
                parked_lon: curLon,
                last_check_at: now.toISOString(),
              });
            }
          }
        } else if (alert.alert_type === 'radius_breach') {
          if (alert.center_lat && alert.center_lon) {
            const dist = getDistanceMiles(alert.center_lat, alert.center_lon, curLat, curLon);
            if (dist > (alert.radius_miles || 0.5)) {
              breached = true;
              breachReason = `Vehicle left ${alert.radius_miles}-mile geofence (now ${dist.toFixed(2)} miles away)`;
            }
          }
        } else if (alert.alert_type === 'curfew') {
          const hour = now.getHours();
          const startHr = alert.curfew_start_hour ?? 22;
          const endHr = alert.curfew_end_hour ?? 6;
          const inCurfew = startHr > endHr
            ? (hour >= startHr || hour < endHr)
            : (hour >= startHr && hour < endHr);
          if (inCurfew && device.speed > 0) {
            breached = true;
            breachReason = `Vehicle moving during curfew hours (${startHr}:00-${endHr}:00)`;
          }
        }

        if (!breached) {
          await base44.asServiceRole.entities.GeofenceAlert.update(alert.id, {
            last_check_at: now.toISOString(),
          });
          continue;
        }

        // ── BREACH: send alert ──
        const mapsUrl = `https://www.google.com/maps?q=${curLat},${curLon}`;
        const alertTitle = `🚨 Geofence Alert: ${alert.alert_name || 'Vehicle Movement'}`;
        const alertBody = `${breachReason}. Current location: ${mapsUrl}`;

        // Notify owner via all channels
        try {
          await base44.asServiceRole.functions.invoke('routePlatformNotification', {
            event_type: 'geofence_breach',
            severity: 'critical',
            category: 'alert',
            title: alertTitle,
            message: alertBody,
            customer_id: alert.customer_email,
            action_url: '/customer/gps',
            metadata: { geofence_alert_id: alert.id, device_id: alert.telematics_device_id, lat: curLat, lon: curLon, breach_reason: breachReason },
            source_function: 'checkGeofenceAlerts',
          });
        } catch (e) {
          results.errors.push(`Notification for ${alert.id}: ${e.message}`);
        }

        // ── Auto-kill if configured ──
        if (alert.auto_kill_on_breach && device.controls_enabled) {
          try {
            await base44.asServiceRole.functions.invoke('sendTelematicsCommand', {
              telematics_device_id: device.id,
              vehicle_id: device.vehicle_id || '',
              command_type: 'disable_starter',
              source: 'geofence_auto_kill',
              reason: `Geofence breach: ${alert.alert_name}`,
              confirm_starter_command: true,
            });
            results.auto_kills++;
          } catch (e) {
            results.errors.push(`Auto-kill for ${alert.id}: ${e.message}`);
          }
        }

        // Update alert record
        await base44.asServiceRole.entities.GeofenceAlert.update(alert.id, {
          last_alerted_at: now.toISOString(),
          breach_count: (alert.breach_count || 0) + 1,
          last_check_at: now.toISOString(),
        });

        results.alerts_sent++;
      } catch (e) {
        results.errors.push(`Alert ${alert.id}: ${e.message}`);
      }
    }

    return Response.json({ ok: true, ...results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});