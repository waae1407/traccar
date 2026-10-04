/**
 * checkVehicleSecurityAlerts — Scans all devices with active bookings for
 * security breaches, tow/movement events, and critical battery levels.
 * Sends real-time alerts to BOTH the customer (renter) and the host.
 *
 * Alert types:
 *   - security_breach: door_open, trunk_open, shock_alarm, power_cut_alarm
 *   - tow_detected: movement_alarm while parked
 *   - low_battery: voltage < 11.6V (critical)
 *   - device_offline: online_status = offline for >15 min during active rental
 *
 * Uses dedup keys per device+alert_type+day to avoid notification spam.
 * Runs on a 5-minute cron schedule.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ACTIVE_BOOKING_STATUSES = ['active', 'approved', 'confirmed', 'checked_out', 'return_required', 'post_inspection_required', 'overdue_return', 'payment_due', 'grace_period', 'return_pending_host_review', 'under_review'];
const ACTIVE_PHASES = ['payment_complete', 'pickup_required', 'checked_out', 'active', 'return_required', 'return_in_progress', 'host_review'];
const LOW_BATTERY_THRESHOLD = 11.6;
const OFFLINE_THRESHOLD_MINUTES = 15;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function minutesSince(value) {
  if (!value) return Infinity;
  return Math.round((Date.now() - new Date(value).getTime()) / 60000);
}

async function checkDedup(base44, key) {
  if (!key) return false;
  const existing = await base44.asServiceRole.entities.ActivityEvent.filter({ dedupe_key: key }, '-created_date', 1).catch(() => []);
  return existing.length > 0;
}

async function resolveBookingAndHost(base44, device) {
  if (!device?.vehicle_id) return { booking: null, host: null };
  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({
    vehicle_id: device.vehicle_id,
    booking_status: { $in: ACTIVE_BOOKING_STATUSES },
  }, '-updated_date', 5).catch(() => []);

  const booking = bookings.find(b =>
    ACTIVE_PHASES.includes(b.rental_lifecycle_phase) || !b.rental_lifecycle_phase
  ) || bookings[0];

  if (!booking) return { booking: null, host: null };

  const hosts = booking.host_id
    ? await base44.asServiceRole.entities.Host.filter({ id: booking.host_id }).catch(() => [])
    : [];
  const host = hosts[0] || null;

  return { booking, host };
}

async function sendAlertToRecipient(base44, { recipient, role, title, body, category, severity, booking, vehicle, device, alert_type, action_url }) {
  const email = role === 'customer' ? booking?.user_email : recipient?.email;
  const phone = role === 'customer' ? booking?.customer_phone : recipient?.phone;
  const userId = role === 'customer' ? booking?.user_id : recipient?.user_id;

  if (!email) return { skipped: 'no_email' };

  const dedupKey = `${alert_type}:${device.id}:${email}:${todayKey()}`;
  if (await checkDedup(base44, dedupKey)) return { skipped: 'deduped' };

  // In-app notification
  await base44.asServiceRole.entities.Notification.create({
    recipient_user_id: userId || '',
    recipient_role: role,
    recipient_email: email,
    recipient_phone: phone || '',
    title,
    body,
    type: 'alert',
    category,
    severity,
    is_read: false,
    booking_request_id: booking?.id || '',
    vehicle_id: vehicle?.id || device?.vehicle_id || '',
    host_id: recipient?.id || booking?.host_id || '',
    action_url: action_url || (role === 'customer' ? '/my-vehicle' : '/host/telematics'),
    source_function: 'checkVehicleSecurityAlerts',
    metadata: { alert_type, device_id: device?.id, device_unique_id: device?.unique_id },
  }).catch(() => {});

  // Log delivery
  await base44.asServiceRole.entities.ActivityEvent.create({
    event_type: `vehicle_alert.${alert_type}.${role}.inapp`,
    actor_id: 'checkVehicleSecurityAlerts',
    actor_role: 'automation',
    target_entity: 'TelematicsDevice',
    target_id: device?.id || '',
    user_email: email,
    summary: `${title} — ${role} in-app`,
    dedupe_key: dedupKey,
    metadata: { alert_type, device_id: device?.id, recipient_role: role, booking_id: booking?.id },
    source: 'automation',
    event_status: 'success',
  }).catch(() => {});

  return { sent: true, email };
}

async function sendSecurityAlert(base44, { device, booking, host, vehicle, breaches }) {
  const vehicleName = vehicle?.display_name || booking?.vehicle_name || device?.unique_id || 'your vehicle';
  const breachList = breaches.join(', ');
  const title = `🚨 Security Alert — ${vehicleName}`;
  const body = `Security breach detected: ${breachList}. Please check on your vehicle immediately.`;

  const customerResult = await sendAlertToRecipient(base44, {
    recipient: null, role: 'customer', title, body,
    category: 'gps', severity: 'critical',
    booking, vehicle, device, alert_type: 'security_breach',
  });

  const hostResult = host
    ? await sendAlertToRecipient(base44, {
        recipient: host, role: 'host', title,
        body: `Security breach detected on ${vehicleName}: ${breachList}. Active rental: ${booking?.customer_full_name || booking?.user_email || 'N/A'}.`,
        category: 'gps', severity: 'critical',
        booking, vehicle, device, alert_type: 'security_breach',
        action_url: '/host/telematics',
      })
    : { skipped: 'no_host' };

  return { customer: customerResult, host: hostResult };
}

async function sendTowAlert(base44, { device, booking, host, vehicle }) {
  const vehicleName = vehicle?.display_name || booking?.vehicle_name || device?.unique_id || 'your vehicle';
  const title = `🚨 Tow Detected — ${vehicleName}`;
  const body = `Your vehicle appears to be moving while parked. If this is not you, your vehicle may be towed or stolen.`;

  const customerResult = await sendAlertToRecipient(base44, {
    recipient: null, role: 'customer', title, body,
    category: 'gps', severity: 'critical',
    booking, vehicle, device, alert_type: 'tow_detected',
  });

  const hostResult = host
    ? await sendAlertToRecipient(base44, {
        recipient: host, role: 'host', title,
        body: `Movement detected on ${vehicleName} while parked. Possible tow or theft. Renter: ${booking?.customer_full_name || booking?.user_email || 'N/A'}.`,
        category: 'gps', severity: 'critical',
        booking, vehicle, device, alert_type: 'tow_detected',
        action_url: '/host/telematics',
      })
    : { skipped: 'no_host' };

  return { customer: customerResult, host: hostResult };
}

async function sendLowBatteryAlert(base44, { device, booking, host, vehicle, voltage }) {
  const vehicleName = vehicle?.display_name || booking?.vehicle_name || device?.unique_id || 'your vehicle';
  const title = `🔋 Low Battery — ${vehicleName}`;
  const body = `Battery voltage is critically low at ${voltage.toFixed(1)}V. Start the vehicle and run for 30 minutes to recharge.`;

  const customerResult = await sendAlertToRecipient(base44, {
    recipient: null, role: 'customer', title, body,
    category: 'gps', severity: 'warning',
    booking, vehicle, device, alert_type: 'low_battery',
  });

  const hostResult = host
    ? await sendAlertToRecipient(base44, {
        recipient: host, role: 'host', title,
        body: `Battery on ${vehicleName} is critically low at ${voltage.toFixed(1)}V. Vehicle may not start. Renter: ${booking?.customer_full_name || booking?.user_email || 'N/A'}.`,
        category: 'gps', severity: 'warning',
        booking, vehicle, device, alert_type: 'low_battery',
        action_url: '/host/telematics',
      })
    : { skipped: 'no_host' };

  return { customer: customerResult, host: hostResult };
}

async function sendOfflineAlert(base44, { device, booking, host, vehicle, offlineMinutes }) {
  const vehicleName = vehicle?.display_name || booking?.vehicle_name || device?.unique_id || 'your vehicle';
  const title = `📡 Device Offline — ${vehicleName}`;
  const body = `GPS device has been offline for ${offlineMinutes} minutes. Location tracking is unavailable.`;

  const customerResult = await sendAlertToRecipient(base44, {
    recipient: null, role: 'customer', title, body,
    category: 'gps', severity: 'warning',
    booking, vehicle, device, alert_type: 'device_offline',
  });

  const hostResult = host
    ? await sendAlertToRecipient(base44, {
        recipient: host, role: 'host', title,
        body: `GPS device on ${vehicleName} has been offline for ${offlineMinutes} minutes during an active rental. Renter: ${booking?.customer_full_name || booking?.user_email || 'N/A'}.`,
        category: 'gps', severity: 'warning',
        booking, vehicle, device, alert_type: 'device_offline',
        action_url: '/host/telematics',
      })
    : { skipped: 'no_host' };

  return { customer: customerResult, host: hostResult };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const isCron = !!(Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET'));
    const isScheduled = req.headers.get('x-base44-scheduled-function') === 'true';
    if (!isCron && !isScheduled) {
      const user = await base44.auth.me().catch(() => null);
      if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all devices that have a vehicle_id (active or recently active)
    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter(
      { vehicle_id: { $ne: '' }, lifecycle_status: { $ne: 'retired' } },
      '-updated_date', 200
    ).catch(() => []);

    const stats = { checked: 0, security: 0, tow: 0, battery: 0, offline: 0, skipped: 0 };

    for (const device of devices) {
      stats.checked++;

      const { booking, host } = await resolveBookingAndHost(base44, device);
      if (!booking) { stats.skipped++; continue; }

      // Resolve vehicle
      const vehicles = device.vehicle_id
        ? await base44.asServiceRole.entities.Vehicle.filter({ id: device.vehicle_id }).catch(() => [])
        : [];
      const vehicle = vehicles[0] || null;

      // ── 1. Security breach detection ──
      const breaches = [];
      if (device.door_open) breaches.push('Door Open');
      if (device.trunk_open) breaches.push('Trunk Open');
      if (device.shock_alarm) breaches.push('Impact Detected');
      if (device.power_cut_alarm) breaches.push('Power Cut');
      if (breaches.length > 0) {
        await sendSecurityAlert(base44, { device, booking, host, vehicle, breaches });
        stats.security++;
      }

      // ── 2. Tow / movement detection ──
      // Two triggers, either of which means "moving but shouldn't be":
      //   a) movement_alarm + ignition OFF  (reliable when ACC wiring is correct)
      //   b) movement_alarm + doors LOCKED   (fallback when ignition is motion-inferred,
      //      since a locked car should never be moving)
      if (device.movement_alarm === true) {
        const ignitionOff = !device.ignition_status || device.ignition_status === 'off';
        const lockedMoving = device.lock_state === 'locked';
        if (ignitionOff || lockedMoving) {
          await sendTowAlert(base44, { device, booking, host, vehicle });
          stats.tow++;
        }
      }

      // ── 3. Low battery detection ──
      const voltage = device.power_voltage || device.battery_voltage || 0;
      if (voltage > 0 && voltage < LOW_BATTERY_THRESHOLD && device.ignition_status !== 'on') {
        await sendLowBatteryAlert(base44, { device, booking, host, vehicle, voltage });
        stats.battery++;
      }

      // ── 4. Device offline detection (during active rental) ──
      if (device.online_status === 'offline') {
        const offlineMins = minutesSince(device.last_seen_at);
        if (offlineMins >= OFFLINE_THRESHOLD_MINUTES && offlineMins < 1440) { // 15min to 24h
          await sendOfflineAlert(base44, { device, booking, host, vehicle, offlineMinutes: offlineMins });
          stats.offline++;
        }
      }
    }

    return Response.json({
      ok: true,
      checked: stats.checked,
      alerts_sent: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[checkVehicleSecurityAlerts] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});