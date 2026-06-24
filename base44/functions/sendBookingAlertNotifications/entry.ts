/**
 * sendBookingAlertNotifications — Sends critical alerts to hosts/admins for booking issues
 *
 * Event types:
 *   - pickup_inspection_incomplete: Start date passed, no pickup photos
 *   - rental_overdue: End date passed, booking not completed
 *   - return_review_required: Dropoff submitted, host must review
 *   - admin_attention_required: High-priority booking needs admin review
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const APP_URL = "https://uridehub.com";
const LOGO_URL = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

function emailTemplate(headline, bodyContent) {
  return `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <div style="background:linear-gradient(135deg,#e91e8c,#7c3aed);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
    <img src="${LOGO_URL}" alt="uRide" style="width:48px;height:48px;border-radius:12px;border:2px solid rgba(255,255,255,0.3);display:block;margin:0 auto 10px"/>
    <h1 style="color:white;margin:0;font-size:22px;font-weight:800">${headline}</h1>
  </div>
  <div style="background:#fafafa;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px">
    ${bodyContent}
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center">Questions? <a href="mailto:support@uridehub.com" style="color:#9ca3af">support@uridehub.com</a> · uridehub.com</p>
  </div>
</div>`;
}

async function sendEmail(to, subject, html) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY || !to) return { ok: false, error: "NO_API_KEY_OR_RECIPIENT" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "uRide <noreply@uridehub.com>", to: [to], subject, html }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.message || "EMAIL_FAILED", message_id: null };
  return { ok: true, message_id: data.id };
}

async function sendSMS(to, body) {
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_PHONE = Deno.env.get("TWILIO_PHONE_NUMBER");
  
  if (!to || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) return { ok: false, error: "TWILIO_NOT_CONFIGURED", sid: null };
  
  const phone = String(to).replace(/\D/g, "");
  const normalized = phone.startsWith("1") && phone.length === 11 ? `+${phone}` : `+1${phone}`;
  if (normalized.length < 12) return { ok: false, error: "INVALID_PHONE", sid: null };
  
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: { "Authorization": "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: normalized, From: TWILIO_PHONE, Body: body }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.message || "SMS_FAILED", sid: null };
  return { ok: true, sid: data.sid };
}

async function checkDedup(base44, idempotency_key) {
  if (!idempotency_key) return false;
  const existing = await base44.asServiceRole.entities.ActivityEvent.filter({ dedupe_key: idempotency_key }, '-created_date', 1).catch(() => []);
  return existing.length > 0;
}

async function logDelivery(base44, { event_type, idempotency_key, recipient_email, recipient_phone, channel, provider, provider_message_id, provider_status, failure_reason, source_event, source_entity_type, source_entity_id, host_id, booking_id, vehicle_id }) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type,
      actor_id: 'sendBookingAlertNotifications',
      actor_email: 'automation@uridehub.com',
      actor_role: 'automation',
      target_entity: source_entity_type || '',
      target_id: source_entity_id || '',
      host_id: host_id || '',
      booking_id: booking_id || '',
      vehicle_id: vehicle_id || '',
      user_email: recipient_email || '',
      summary: `${event_type} — ${channel} — ${provider_status}`,
      dedupe_key: idempotency_key || '',
      metadata: {
        recipient_email,
        recipient_phone,
        channel,
        provider,
        provider_message_id: provider_message_id || null,
        provider_status,
        failure_reason: failure_reason || null,
        source_event,
        source_entity_type,
        source_entity_id,
      },
      source: 'notification_system',
      event_status: provider_status === 'sent' ? 'success' : 'error',
    });
  } catch (e) {
    console.error('[sendBookingAlertNotifications] logDelivery failed:', e.message);
  }
}

async function handlePickupInspectionIncomplete(base44, { booking, host, vehicle }) {
  if (!booking?.id || !host?.id) return { error: "Missing booking or host" };
  const vehicleName = vehicle?.display_name || booking.vehicle_name || 'vehicle';
  
  // DELEGATE TO CENTRAL ROUTER
  const routerResult = await base44.asServiceRole.functions.invoke('routePlatformNotification', {
    event_type: 'pickup_inspection_incomplete',
    severity: 'critical',
    category: 'bookings',
    title: `⚠️ Pickup Inspection Incomplete — ${vehicleName}`,
    message: `Rental started on ${booking.start_date} but customer has not completed pickup inspection. Weekly billing is active.`,
    booking_id: booking.id,
    host_id: host.id,
    customer_id: booking.user_id,
    vehicle_id: booking.vehicle_id,
    action_url: '/admin/booking-360?id=' + booking.id,
    metadata: { rental_start: booking.start_date, weekly_billing_active: true },
    notify_admin: true,
  }).catch(e => ({ data: { error: e.message } }));
  
  return { delegated_to_router: true, router_result: routerResult?.data };
}

async function handleRentalOverdue(base44, { booking, host, vehicle }) {
  if (!booking?.id || !host?.id) return { error: "Missing booking or host" };
  const today = new Date().toISOString().slice(0, 10);
  const results = {};
  const vehicleName = vehicle?.display_name || booking.vehicle_name || 'vehicle';
  const daysOverdue = Math.floor((Date.now() - new Date(`${booking.end_date}T23:59:59`).getTime()) / (1000 * 60 * 60 * 24));

  // In-app notification to host
  const inAppKey = `rental_overdue:${booking.id}:${host.id}:inapp:${today}`;
  if (!await checkDedup(base44, inAppKey)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: `🚨 RENTAL OVERDUE — ${vehicleName}`,
      body: `Rental ended ${booking.end_date} (${daysOverdue} days overdue). Customer has not returned vehicle. Weekly billing continues. Contact customer immediately.`,
      type: 'alert',
      category: 'bookings',
      severity: 'critical',
      is_read: false,
      booking_request_id: booking.id,
      host_id: host.id,
    }).catch(() => {});
    await logDelivery(base44, { event_type: 'notification.rental_overdue.inapp', idempotency_key: inAppKey, recipient_email: host.email, channel: 'inapp', provider: 'base44', provider_status: 'sent', source_event: 'rental_overdue', source_entity_type: 'BookingRequest', source_entity_id: booking.id, host_id: host.id, booking_id: booking.id, vehicle_id: booking.vehicle_id });
    results.inapp = 'sent';
  } else { results.inapp = 'deduped'; }

  // Email to host
  const emailKey = `rental_overdue:${booking.id}:${host.id}:email:${today}`;
  if (!await checkDedup(base44, emailKey)) {
    const html = emailTemplate('🚨 Rental Overdue — Action Required', `
      <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${host.full_name?.split(' ')[0] || 'there'},</p>
      <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:12px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#7f1d1d">🚨 Rental is <strong>${daysOverdue} day${daysOverdue > 1 ? 's' : ''}</strong> overdue.</p>
        <p style="margin:0;font-size:13px;color:#7f1d1d">Customer has not returned the vehicle. Weekly billing continues until return is completed.</p>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Vehicle</td><td style="font-size:14px;font-weight:600;color:#111;text-align:right">${vehicleName}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Customer</td><td style="font-size:14px;color:#111;text-align:right">${booking.customer_full_name || booking.user_email}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">End Date</td><td style="font-size:14px;color:#dc2626;text-align:right">${booking.end_date}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Days Overdue</td><td style="font-size:14px;font-weight:700;color:#dc2626;text-align:right">${daysOverdue}</td></tr>
        </table>
      </div>
      <div style="text-align:center">
        <a href="${APP_URL}/admin/booking-360?id=${booking.id}" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#991b1b);color:white;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">Take Action →</a>
      </div>
    `);
    const emailResult = await sendEmail(host.email, `🚨 RENTAL OVERDUE — ${vehicleName} (${daysOverdue} days)`, html);
    await logDelivery(base44, { event_type: emailResult.ok ? 'notification.rental_overdue.email' : 'notification.delivery_failed', idempotency_key: emailKey, recipient_email: host.email, channel: 'email', provider: 'resend', provider_message_id: emailResult.message_id, provider_status: emailResult.ok ? 'sent' : 'failed', failure_reason: emailResult.error, source_event: 'rental_overdue', source_entity_type: 'BookingRequest', source_entity_id: booking.id, host_id: host.id, booking_id: booking.id });
    results.email = emailResult.ok ? 'sent' : `failed:${emailResult.error}`;
  } else { results.email = 'deduped'; }

  // SMS to host
  const smsKey = `rental_overdue:${booking.id}:${host.id}:sms:${today}`;
  if (host.phone && !await checkDedup(base44, smsKey)) {
    const smsResult = await sendSMS(host.phone, `uRide URGENT: ${vehicleName} is ${daysOverdue} days OVERDUE. Customer has not returned. Weekly billing continues. Act now: ${APP_URL}/admin/booking-360?id=${booking.id}`);
    await logDelivery(base44, { event_type: smsResult.ok ? 'notification.rental_overdue.sms' : 'notification.delivery_failed', idempotency_key: smsKey, recipient_email: host.email, recipient_phone: host.phone, channel: 'sms', provider: 'twilio', provider_message_id: smsResult.sid, provider_status: smsResult.ok ? 'sent' : 'failed', failure_reason: smsResult.error, source_event: 'rental_overdue', source_entity_type: 'BookingRequest', source_entity_id: booking.id, host_id: host.id, booking_id: booking.id });
    results.sms = smsResult.ok ? 'sent' : `failed:${smsResult.error}`;
  } else { results.sms = host.phone ? 'deduped' : 'no_phone'; }

  // Admin alert
  const adminAlertKey = `rental_overdue:${booking.id}:admin_alert:${today}`;
  if (!await checkDedup(base44, adminAlertKey)) {
    try {
      await base44.asServiceRole.entities.PaymentOperationalAlert.create({
        alert_type: 'rental_overdue',
        severity: 'critical',
        status: 'new',
        billing_context: 'active_rental',
        booking_id: booking.id,
        host_id: host.id,
        customer_id: booking.user_id || '',
        vehicle_id: booking.vehicle_id || '',
        renter_email: booking.user_email,
        related_entity_type: 'BookingRequest',
        related_entity_id: booking.id,
        title: `Rental Overdue ${daysOverdue} Days — ${vehicleName}`,
        message: `Customer ${booking.customer_full_name || booking.user_email} has not returned vehicle. End date was ${booking.end_date}. Weekly billing continues.`,
        recommended_action: 'Contact customer, consider GPS tracking, or escalate to collections if no response.',
        financial_impact_amount: (booking.weekly_rate || 0) * (daysOverdue > 0 ? daysOverdue : 1),
        currency: 'usd',
        requires_admin_action: true,
        requires_host_action: true,
        requires_customer_action: true,
        source: 'booking_monitor',
      });
      results.admin_alert = 'sent';
    } catch (e) {
      results.admin_alert = `failed:${e.message}`;
    }
    await logDelivery(base44, { event_type: 'notification.rental_overdue.admin_alert', idempotency_key: adminAlertKey, recipient_email: 'admin', channel: 'admin_alert', provider: 'base44', provider_status: 'sent', source_event: 'rental_overdue', source_entity_type: 'BookingRequest', source_entity_id: booking.id, host_id: host.id, booking_id: booking.id });
  } else { results.admin_alert = 'deduped'; }

  return results;
}

async function handleReturnReviewRequired(base44, { booking, host, vehicle }) {
  if (!booking?.id || !host?.id) return { error: "Missing booking or host" };
  const today = new Date().toISOString().slice(0, 10);
  const results = {};
  const vehicleName = vehicle?.display_name || booking.vehicle_name || 'vehicle';

  // In-app notification to host
  const inAppKey = `return_review_required:${booking.id}:${host.id}:inapp:${today}`;
  if (!await checkDedup(base44, inAppKey)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: `📋 Return Review Required — ${vehicleName}`,
      body: `Customer submitted dropoff photos. Review return inspection and approve/reject to complete the rental.`,
      type: 'alert',
      category: 'bookings',
      severity: 'warning',
      is_read: false,
      booking_request_id: booking.id,
      host_id: host.id,
    }).catch(() => {});
    await logDelivery(base44, { event_type: 'notification.return_review_required.inapp', idempotency_key: inAppKey, recipient_email: host.email, channel: 'inapp', provider: 'base44', provider_status: 'sent', source_event: 'return_review_required', source_entity_type: 'BookingRequest', source_entity_id: booking.id, host_id: host.id, booking_id: booking.id, vehicle_id: booking.vehicle_id });
    results.inapp = 'sent';
  } else { results.inapp = 'deduped'; }

  // Email to host
  const emailKey = `return_review_required:${booking.id}:${host.id}:email:${today}`;
  if (!await checkDedup(base44, emailKey)) {
    const html = emailTemplate('Return Review Required', `
      <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${host.full_name?.split(' ')[0] || 'there'},</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px">Customer has submitted dropoff photos for <strong>${vehicleName}</strong>. Please review the return inspection and approve or reject to complete the rental.</p>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Vehicle</td><td style="font-size:14px;font-weight:600;color:#111;text-align:right">${vehicleName}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Customer</td><td style="font-size:14px;color:#111;text-align:right">${booking.customer_full_name || booking.user_email}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Return Submitted</td><td style="font-size:14px;color:#111;text-align:right">${booking.dropoff_submitted_at ? new Date(booking.dropoff_submitted_at).toLocaleDateString() : 'N/A'}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Status</td><td style="font-size:14px;font-weight:700;color:#f59e0b;text-align:right">${booking.booking_status}</td></tr>
        </table>
      </div>
      <div style="text-align:center">
        <a href="${APP_URL}/host/return-reviews" style="display:inline-block;background:linear-gradient(135deg,#e91e8c,#7c3aed);color:white;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">Review Return →</a>
      </div>
    `);
    const emailResult = await sendEmail(host.email, `Return Review Required — ${vehicleName}`, html);
    await logDelivery(base44, { event_type: emailResult.ok ? 'notification.return_review_required.email' : 'notification.delivery_failed', idempotency_key: emailKey, recipient_email: host.email, channel: 'email', provider: 'resend', provider_message_id: emailResult.message_id, provider_status: emailResult.ok ? 'sent' : 'failed', failure_reason: emailResult.error, source_event: 'return_review_required', source_entity_type: 'BookingRequest', source_entity_id: booking.id, host_id: host.id, booking_id: booking.id });
    results.email = emailResult.ok ? 'sent' : `failed:${emailResult.error}`;
  } else { results.email = 'deduped'; }

  return results;
}

// ── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event_type, booking_id } = body;

    if (!event_type) return Response.json({ error: 'Missing event_type' }, { status: 400 });

    // Fetch booking
    let booking = body.booking;
    if (!booking && booking_id) {
      const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_id });
      booking = bookings[0];
    }

    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });

    // Fetch host and vehicle
    const [hosts, vehicles] = await Promise.all([
      booking.host_id ? base44.asServiceRole.entities.Host.filter({ id: booking.host_id }) : Promise.resolve([]),
      booking.vehicle_id ? base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id }) : Promise.resolve([]),
    ]);

    const host = hosts[0];
    const vehicle = vehicles[0];

    if (!host) return Response.json({ error: 'Host not found' }, { status: 404 });

    let result;
    switch (event_type) {
      case 'pickup_inspection_incomplete':
        result = await handlePickupInspectionIncomplete(base44, { booking, host, vehicle });
        break;
      case 'rental_overdue':
        result = await handleRentalOverdue(base44, { booking, host, vehicle });
        break;
      case 'return_review_required':
        result = await handleReturnReviewRequired(base44, { booking, host, vehicle });
        break;
      default:
        return Response.json({ error: `Unknown event_type: ${event_type}` }, { status: 400 });
    }

async function handleRentalOverdue(base44, { booking, host, vehicle }) {
  if (!booking?.id || !host?.id) return { error: "Missing booking or host" };
  const today = new Date().toISOString().slice(0, 10);
  const results = {};
  const vehicleName = vehicle?.display_name || booking.vehicle_name || 'vehicle';
  const daysOverdue = booking.end_date ? Math.round((new Date() - new Date(booking.end_date + 'T23:59:59')) / (1000 * 60 * 60 * 24)) : 0;

  // In-app notification to host
  const inAppKey = `rental_overdue:${booking.id}:${host.id}:inapp:${today}`;
  if (!await checkDedup(base44, inAppKey)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: `🚨 RENTAL OVERDUE — ${vehicleName}`,
      body: `Rental ended ${booking.end_date} (${daysOverdue} days overdue). Customer has not returned vehicle. Weekly billing continues. Contact customer immediately.`,
      type: 'alert',
      category: 'bookings',
      severity: 'critical',
      is_read: false,
      booking_request_id: booking.id,
      host_id: host.id,
    }).catch(() => {});
    await logDelivery(base44, { event_type: 'notification.rental_overdue.inapp', idempotency_key: inAppKey, recipient_email: host.email, channel: 'inapp', provider: 'base44', provider_status: 'sent', source_event: 'rental_overdue', source_entity_type: 'BookingRequest', source_entity_id: booking.id, host_id: host.id, booking_id: booking.id, vehicle_id: booking.vehicle_id });
    results.inapp = 'sent';
  } else { results.inapp = 'deduped'; }

  // Email to host
  const emailKey = `rental_overdue:${booking.id}:${host.id}:email:${today}`;
  if (!await checkDedup(base44, emailKey)) {
    const html = emailTemplate('🚨 Rental Overdue — Action Required', `
      <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${host.full_name?.split(' ')[0] || 'there'},</p>
      <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:12px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#7f1d1d">🚨 A rental vehicle is OVERDUE.</p>
        <p style="margin:0;font-size:13px;color:#7f1d1d">Customer has not returned the vehicle. Weekly billing continues until return.</p>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Vehicle</td><td style="font-size:14px;font-weight:600;color:#111;text-align:right">${vehicleName}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Customer</td><td style="font-size:14px;color:#111;text-align:right">${booking.customer_full_name || booking.user_email}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">End Date</td><td style="font-size:14px;color:#dc2626;text-align:right">${booking.end_date} (${daysOverdue} days overdue)</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Status</td><td style="font-size:14px;font-weight:700;color:#f59e0b;text-align:right">${booking.booking_status}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Weekly Rate</td><td style="font-size:14px;font-weight:700;color:#111;text-align:right">$${booking.weekly_rate}</td></tr>
        </table>
      </div>
      <div style="text-align:center">
        <a href="${APP_URL}/admin/booking-360?id=${booking.id}" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#991b1b);color:white;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">View Booking Details →</a>
      </div>
    `);
    const emailResult = await sendEmail(host.email, `🚨 RENTAL OVERDUE: ${vehicleName} — ${daysOverdue} days`, html);
    await logDelivery(base44, { event_type: emailResult.ok ? 'notification.rental_overdue.email' : 'notification.delivery_failed', idempotency_key: emailKey, recipient_email: host.email, channel: 'email', provider: 'resend', provider_message_id: emailResult.message_id, provider_status: emailResult.ok ? 'sent' : 'failed', failure_reason: emailResult.error, source_event: 'rental_overdue', source_entity_type: 'BookingRequest', source_entity_id: booking.id, host_id: host.id, booking_id: booking.id });
    results.email = emailResult.ok ? 'sent' : `failed:${emailResult.error}`;
  } else { results.email = 'deduped'; }

  // SMS to host
  const smsKey = `rental_overdue:${booking.id}:${host.id}:sms:${today}`;
  if (host.phone && !await checkDedup(base44, smsKey)) {
    const smsResult = await sendSMS(host.phone, `uRide URGENT: ${vehicleName} rental is ${daysOverdue} days OVERDUE. Customer: ${booking.customer_full_name || booking.user_email}. Weekly billing continues. Contact immediately: ${APP_URL}/admin/booking-360?id=${booking.id}`);
    await logDelivery(base44, { event_type: smsResult.ok ? 'notification.rental_overdue.sms' : 'notification.delivery_failed', idempotency_key: smsKey, recipient_email: host.email, recipient_phone: host.phone, channel: 'sms', provider: 'twilio', provider_message_id: smsResult.sid, provider_status: smsResult.ok ? 'sent' : 'failed', failure_reason: smsResult.error, source_event: 'rental_overdue', source_entity_type: 'BookingRequest', source_entity_id: booking.id, host_id: host.id, booking_id: booking.id });
    results.sms = smsResult.ok ? 'sent' : `failed:${smsResult.error}`;
  } else { results.sms = host.phone ? 'deduped' : 'no_phone'; }

  return results;
}

async function handleReturnReviewRequired(base44, { booking, host, vehicle }) {
  if (!booking?.id || !host?.id) return { error: "Missing booking or host" };
  const today = new Date().toISOString().slice(0, 10);
  const results = {};
  const vehicleName = vehicle?.display_name || booking.vehicle_name || 'vehicle';

  // In-app notification to host
  const inAppKey = `return_review_required:${booking.id}:${host.id}:inapp:${today}`;
  if (!await checkDedup(base44, inAppKey)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: `✅ Return Inspection Submitted — ${vehicleName}`,
      body: `Customer has submitted dropoff photos. Review and approve/reject the return to complete the booking and stop billing.`,
      type: 'alert',
      category: 'bookings',
      severity: 'warning',
      is_read: false,
      booking_request_id: booking.id,
      host_id: host.id,
    }).catch(() => {});
    await logDelivery(base44, { event_type: 'notification.return_review_required.inapp', idempotency_key: inAppKey, recipient_email: host.email, channel: 'inapp', provider: 'base44', provider_status: 'sent', source_event: 'return_review_required', source_entity_type: 'BookingRequest', source_entity_id: booking.id, host_id: host.id, booking_id: booking.id, vehicle_id: booking.vehicle_id });
    results.inapp = 'sent';
  } else { results.inapp = 'deduped'; }

  // Email to host
  const emailKey = `return_review_required:${booking.id}:${host.id}:email:${today}`;
  if (!await checkDedup(base44, emailKey)) {
    const html = emailTemplate('Return Inspection Submitted', `
      <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${host.full_name?.split(' ')[0] || 'there'},</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px">Customer has submitted dropoff photos for <strong>${vehicleName}</strong>. Please review and approve or reject the return to complete the booking.</p>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Vehicle</td><td style="font-size:14px;font-weight:600;color:#111;text-align:right">${vehicleName}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Customer</td><td style="font-size:14px;color:#111;text-align:right">${booking.customer_full_name || booking.user_email}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Return Submitted</td><td style="font-size:14px;color:#111;text-align:right">${booking.dropoff_submitted_at ? new Date(booking.dropoff_submitted_at).toLocaleDateString() : '—'}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Status</td><td style="font-size:14px;font-weight:700;color:#f59e0b;text-align:right">${booking.booking_status}</td></tr>
        </table>
      </div>
      <div style="text-align:center">
        <a href="${APP_URL}/host/vehicles" style="display:inline-block;background:linear-gradient(135deg,#e91e8c,#7c3aed);color:white;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">Review Return →</a>
      </div>
    `);
    const emailResult = await sendEmail(host.email, `Return Inspection Submitted — ${vehicleName}`, html);
    await logDelivery(base44, { event_type: emailResult.ok ? 'notification.return_review_required.email' : 'notification.delivery_failed', idempotency_key: emailKey, recipient_email: host.email, channel: 'email', provider: 'resend', provider_message_id: emailResult.message_id, provider_status: emailResult.ok ? 'sent' : 'failed', failure_reason: emailResult.error, source_event: 'return_review_required', source_entity_type: 'BookingRequest', source_entity_id: booking.id, host_id: host.id, booking_id: booking.id });
    results.email = emailResult.ok ? 'sent' : `failed:${emailResult.error}`;
  } else { results.email = 'deduped'; }

  return results;
}

    return Response.json({ ok: true, event_type, booking_id: booking.id, result });
  } catch (error) {
    console.error('[sendBookingAlertNotifications] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});