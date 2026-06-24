/**
 * sendCriticalNotification — Unified critical notification dispatcher
 *
 * Handles:
 *   - booking_approved, booking_rejected
 *   - chargeback_opened, payout_held
 *   - gps_offline_24h, gps_offline_72h
 *   - compliance_expired, compliance_hold_active_booking
 *   - weekly_payment_receipt
 *   - stripe_account_restricted
 *
 * Features:
 *   - Deduplication via idempotency_key on ActivityEvent
 *   - Delivery tracking (Resend message ID, Twilio SID)
 *   - E.164 phone normalization
 *   - SMS failure logging to ActivityEvent
 *   - No retry (fire-and-forget with logging)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE = Deno.env.get("TWILIO_PHONE_NUMBER");
const APP_URL = "https://uridehub.com";
const LOGO_URL = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

// ── Helpers ──────────────────────────────────────────────────────────────────

function toE164(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 10) return null;
  const normalized = digits.startsWith("1") && digits.length === 11 ? `+${digits}` : `+1${digits}`;
  if (normalized.length < 12) return null;
  return normalized;
}

async function sendEmail(to, subject, html) {
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
  const phone = toE164(to);
  if (!phone) return { ok: false, error: "INVALID_PHONE", sid: null };
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) return { ok: false, error: "TWILIO_NOT_CONFIGURED", sid: null };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: { "Authorization": "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: phone, From: TWILIO_PHONE, Body: body }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.message || "SMS_FAILED", sid: null };
  return { ok: true, sid: data.sid };
}

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

async function logDelivery(base44, { event_type, idempotency_key, recipient_email, recipient_phone, channel, provider, provider_message_id, provider_status, failure_reason, source_event, source_entity_type, source_entity_id, host_id, booking_id, vehicle_id, metadata, payload }) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type,
      actor_id: 'sendCriticalNotification',
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
        ...metadata,
      },
      source: 'notification_system',
      event_status: provider_status === 'sent' ? 'success' : 'error',
    });

    // If failed, create a DeliveryFailure record for the retry engine
    if (provider_status === 'failed' && channel !== 'inapp') {
      const now = new Date().toISOString();
      // Compute next retry: attempt 0 → 5 min
      const nextRetry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      await base44.asServiceRole.entities.NotificationDeliveryFailure.create({
        event_type: event_type || source_event || '',
        channel,
        provider,
        recipient: recipient_email || recipient_phone || '',
        failure_reason: failure_reason || 'Unknown',
        first_failed_at: now,
        retry_count: 0,
        next_retry_at: nextRetry,
        resolved: false,
        source_event: source_event || '',
        source_entity_type: source_entity_type || '',
        source_entity_id: source_entity_id || '',
        host_id: host_id || '',
        booking_id: booking_id || '',
        payload: payload || null,
      }).catch(() => {});

      // Log SMS cost for successful sends
      if (channel === 'sms' && provider_message_id) {
        await base44.asServiceRole.entities.NotificationCost.create({
          twilio_sid: provider_message_id,
          channel: 'sms',
          segment_count: 1,
          estimated_cost_usd: 0.0079,
          recipient: recipient_phone || recipient_email || '',
          event_type: source_event || event_type || '',
          category: metadata?.category || source_event || '',
          host_id: host_id || '',
          user_email: recipient_email || '',
          sent_at: now,
        }).catch(() => {});
      }
    }

    // Log SMS cost for successful sends
    if (provider_status === 'sent' && channel === 'sms' && provider_message_id) {
      await base44.asServiceRole.entities.NotificationCost.create({
        twilio_sid: provider_message_id,
        channel: 'sms',
        segment_count: 1,
        estimated_cost_usd: 0.0079,
        recipient: recipient_phone || recipient_email || '',
        event_type: source_event || event_type || '',
        category: metadata?.category || source_event || '',
        host_id: host_id || '',
        user_email: recipient_email || '',
        sent_at: new Date().toISOString(),
      }).catch(() => {});
    }
  } catch (e) {
    console.error('[sendCriticalNotification] logDelivery failed:', e.message);
  }
}

async function checkDedup(base44, idempotency_key) {
  if (!idempotency_key) return false;
  const existing = await base44.asServiceRole.entities.ActivityEvent.filter({ dedupe_key: idempotency_key }, '-created_date', 1).catch(() => []);
  return existing.length > 0;
}

async function sendPush({ user_email, title, body, url }) {
  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const restKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
  if (!appId || !restKey || !user_email) return { ok: false, error: 'NOT_CONFIGURED', notification_id: null, recipients: 0 };
  try {
    const res = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: { 'Authorization': `Key ${restKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        include_aliases: { external_id: [user_email] },
        target_channel: 'push',
        headings: { en: String(title).slice(0, 100) },
        contents: { en: String(body).slice(0, 4000) },
        ...(url ? { url: url.startsWith('http') ? url : `${APP_URL}${url}` } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.errors?.[0] || 'PUSH_FAILED', notification_id: null, recipients: 0 };
    return { ok: true, notification_id: data.id, recipients: data.recipients || 0 };
  } catch (e) {
    return { ok: false, error: e.message, notification_id: null, recipients: 0 };
  }
}

function getPushTemplate(event_type, body) {
  const booking = body.booking || {};
  const vehicle = body.vehicle || {};
  const vehicleName = vehicle.display_name || `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || booking.vehicle_name || 'your vehicle';
  const templates = {
    booking_approved: { title: '✅ Booking Confirmed!', body: `Your ${vehicleName} booking has been approved. View pickup details.`, url: '/my-bookings' },
    booking_rejected: { title: 'Booking Update', body: body.reason || `Your ${vehicleName} booking was not approved.`, url: '/book-now' },
    gps_offline_24h: { title: '📡 GPS Device Offline (24h+)', body: `Your ${vehicleName} GPS device has been offline for 24+ hours.`, url: '/host/telematics' },
    compliance_expired_host: { title: `🚨 ${(body.doc_type || 'Document')} Expired`, body: `${vehicleName} is on Compliance Hold. Upload renewal to reinstate.`, url: '/host/compliance' },
    compliance_hold_active_booking: { title: '⚠️ Rental Action Required', body: `Your ${vehicleName} rental has a compliance issue. Contact support.`, url: '/support' },
    weekly_payment_receipt: { title: `Week ${body.week_number} Payment — $${body.amount}`, body: `$${body.amount} for ${vehicleName} (Week ${body.week_number}) has been processed.`, url: '/my-bookings' },
    stripe_account_restricted: { title: '🔴 Stripe Account Restricted', body: 'Your Stripe payout account has been restricted. Payouts are paused.', url: 'https://dashboard.stripe.com' },
  };
  return templates[event_type] || null;
}

// ── Notification Builders ────────────────────────────────────────────────────

async function handleBookingApproved(base44, { booking }) {
  if (!booking?.id) return { error: "Missing booking" };
  const today = new Date().toISOString().slice(0, 10);
  const results = {};

  // In-app
  const inAppKey = `booking_approved:${booking.id}:${booking.user_email}:inapp`;
  if (!await checkDedup(base44, inAppKey)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: booking.user_email,
      title: '✅ Booking Confirmed!',
      body: `Your ${booking.vehicle_name || 'vehicle'} booking has been approved. Pickup details are now available.`,
      type: 'booking',
      booking_request_id: booking.id,
      category: 'bookings',
      is_read: false,
    }).catch(() => {});
    await logDelivery(base44, { event_type: 'notification.booking_approved.inapp', idempotency_key: inAppKey, recipient_email: booking.user_email, channel: 'inapp', provider: 'base44', provider_status: 'sent', source_event: 'booking_approved', source_entity_type: 'BookingRequest', source_entity_id: booking.id, booking_id: booking.id });
    results.inapp = 'sent';
  } else { results.inapp = 'deduped'; }

  // Email
  const emailKey = `booking_approved:${booking.id}:${booking.user_email}:email`;
  if (!await checkDedup(base44, emailKey)) {
    const html = emailTemplate('🎉 Your Booking is Confirmed!', `
      <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${booking.customer_full_name?.split(' ')[0] || 'there'},</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px">Great news! Your <strong>${booking.vehicle_name}</strong> booking has been approved. You can now view your pickup details in the app.</p>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Vehicle</td><td style="font-size:14px;font-weight:600;color:#111;text-align:right">${booking.vehicle_name || '—'}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Booking Type</td><td style="font-size:14px;color:#111;text-align:right">${booking.booking_type || '—'}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Start Date</td><td style="font-size:14px;color:#111;text-align:right">${booking.start_date || '—'}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Status</td><td style="font-size:14px;font-weight:700;color:#16a34a;text-align:right">✅ Approved</td></tr>
        </table>
      </div>
      <div style="text-align:center;margin-bottom:20px">
        <a href="${APP_URL}/my-bookings" style="display:inline-block;background:linear-gradient(135deg,#e91e8c,#7c3aed);color:white;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">View Pickup Details →</a>
      </div>
    `);
    const emailResult = await sendEmail(booking.user_email, `✅ Booking Confirmed — ${booking.vehicle_name}`, html);
    await logDelivery(base44, { event_type: emailResult.ok ? 'notification.booking_approved.email' : 'notification.delivery_failed', idempotency_key: emailKey, recipient_email: booking.user_email, channel: 'email', provider: 'resend', provider_message_id: emailResult.message_id, provider_status: emailResult.ok ? 'sent' : 'failed', failure_reason: emailResult.error, source_event: 'booking_approved', source_entity_type: 'BookingRequest', source_entity_id: booking.id, booking_id: booking.id });
    results.email = emailResult.ok ? 'sent' : `failed:${emailResult.error}`;
  } else { results.email = 'deduped'; }

  // SMS
  const smsKey = `booking_approved:${booking.id}:${booking.user_email}:sms:${today}`;
  if (booking.customer_phone && !await checkDedup(base44, smsKey)) {
    const smsResult = await sendSMS(booking.customer_phone, `uRide: Your ${booking.vehicle_name || 'vehicle'} booking is CONFIRMED! 🎉 View pickup details: ${APP_URL}/my-bookings`);
    await logDelivery(base44, { event_type: smsResult.ok ? 'notification.booking_approved.sms' : 'notification.delivery_failed', idempotency_key: smsKey, recipient_email: booking.user_email, recipient_phone: booking.customer_phone, channel: 'sms', provider: 'twilio', provider_message_id: smsResult.sid, provider_status: smsResult.ok ? 'sent' : 'failed', failure_reason: smsResult.error, source_event: 'booking_approved', source_entity_type: 'BookingRequest', source_entity_id: booking.id, booking_id: booking.id });
    results.sms = smsResult.ok ? 'sent' : `failed:${smsResult.error}`;
  } else { results.sms = booking.customer_phone ? 'deduped' : 'no_phone'; }

  return results;
}

async function handleBookingRejected(base44, { booking, reason }) {
  if (!booking?.id) return { error: "Missing booking" };
  const results = {};

  const inAppKey = `booking_rejected:${booking.id}:${booking.user_email}:inapp`;
  if (!await checkDedup(base44, inAppKey)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: booking.user_email,
      title: 'Booking Not Approved',
      body: reason || `Your ${booking.vehicle_name || 'vehicle'} booking was not approved. Please contact support for details.`,
      type: 'booking',
      booking_request_id: booking.id,
      category: 'bookings',
      is_read: false,
    }).catch(() => {});
    await logDelivery(base44, { event_type: 'notification.booking_rejected.inapp', idempotency_key: inAppKey, recipient_email: booking.user_email, channel: 'inapp', provider: 'base44', provider_status: 'sent', source_event: 'booking_rejected', source_entity_type: 'BookingRequest', source_entity_id: booking.id, booking_id: booking.id });
    results.inapp = 'sent';
  } else { results.inapp = 'deduped'; }

  const emailKey = `booking_rejected:${booking.id}:${booking.user_email}:email`;
  if (!await checkDedup(base44, emailKey)) {
    const html = emailTemplate('Booking Update', `
      <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${booking.customer_full_name?.split(' ')[0] || 'there'},</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px">Thank you for your interest. Unfortunately your booking for <strong>${booking.vehicle_name}</strong> could not be approved at this time.</p>
      ${reason ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;margin-bottom:20px"><p style="margin:0;font-size:13px;color:#7f1d1d">${reason}</p></div>` : ''}
      <p style="font-size:14px;color:#374151;margin:0 0 20px">You're welcome to browse other available vehicles or contact our support team for assistance.</p>
      <div style="text-align:center;margin-bottom:20px">
        <a href="${APP_URL}/book-now" style="display:inline-block;background:linear-gradient(135deg,#e91e8c,#7c3aed);color:white;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">Browse Vehicles →</a>
      </div>
    `);
    const emailResult = await sendEmail(booking.user_email, `Booking Update — ${booking.vehicle_name}`, html);
    await logDelivery(base44, { event_type: emailResult.ok ? 'notification.booking_rejected.email' : 'notification.delivery_failed', idempotency_key: emailKey, recipient_email: booking.user_email, channel: 'email', provider: 'resend', provider_message_id: emailResult.message_id, provider_status: emailResult.ok ? 'sent' : 'failed', failure_reason: emailResult.error, source_event: 'booking_rejected', source_entity_type: 'BookingRequest', source_entity_id: booking.id, booking_id: booking.id });
    results.email = emailResult.ok ? 'sent' : `failed:${emailResult.error}`;
  } else { results.email = 'deduped'; }

  return results;
}

async function handleChargebackOpened(base44, { dispute, host, booking }) {
  if (!dispute?.id || !host?.id) return { error: "Missing dispute or host" };
  const results = {};
  const dueBy = dispute.due_by ? new Date(dispute.due_by).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Check Stripe';

  const inAppKey = `chargeback_opened:${dispute.id}:${host.id}:inapp`;
  if (!await checkDedup(base44, inAppKey)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: '🚨 Chargeback Opened',
      body: `A chargeback was filed for $${dispute.stripe_dispute_amount || '?'} on ${booking?.vehicle_name || 'a rental'}. Evidence due: ${dueBy}. Act now to avoid losing this dispute.`,
      type: 'alert',
      category: 'payments',
      severity: 'critical',
      is_read: false,
    }).catch(() => {});
    await logDelivery(base44, { event_type: 'notification.chargeback_opened.inapp', idempotency_key: inAppKey, recipient_email: host.email, channel: 'inapp', provider: 'base44', provider_status: 'sent', source_event: 'chargeback_opened', source_entity_type: 'Dispute', source_entity_id: dispute.id, host_id: host.id });
    results.inapp = 'sent';
  } else { results.inapp = 'deduped'; }

  const emailKey = `chargeback_opened:${dispute.id}:${host.id}:email`;
  if (!await checkDedup(base44, emailKey)) {
    const html = emailTemplate('🚨 Chargeback Filed — Action Required', `
      <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${host.full_name?.split(' ')[0] || 'there'},</p>
      <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:12px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#7f1d1d">⚠️ A chargeback has been filed against one of your rentals.</p>
        <p style="margin:0;font-size:13px;color:#7f1d1d">You must submit evidence to dispute this charge or you will lose by default.</p>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Amount</td><td style="font-size:14px;font-weight:700;color:#dc2626;text-align:right">$${dispute.stripe_dispute_amount || '?'}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Vehicle</td><td style="font-size:14px;color:#111;text-align:right">${booking?.vehicle_name || '—'}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Evidence Deadline</td><td style="font-size:14px;font-weight:700;color:#dc2626;text-align:right">${dueBy}</td></tr>
        </table>
      </div>
      <div style="text-align:center;margin-bottom:20px">
        <a href="${APP_URL}/host/payments" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#991b1b);color:white;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">View Dispute Details →</a>
      </div>
    `);
    const emailResult = await sendEmail(host.email, `🚨 ACTION REQUIRED: Chargeback Filed — $${dispute.stripe_dispute_amount || '?'}`, html);
    await logDelivery(base44, { event_type: emailResult.ok ? 'notification.chargeback_opened.email' : 'notification.delivery_failed', idempotency_key: emailKey, recipient_email: host.email, channel: 'email', provider: 'resend', provider_message_id: emailResult.message_id, provider_status: emailResult.ok ? 'sent' : 'failed', failure_reason: emailResult.error, source_event: 'chargeback_opened', source_entity_type: 'Dispute', source_entity_id: dispute.id, host_id: host.id });
    results.email = emailResult.ok ? 'sent' : `failed:${emailResult.error}`;
  } else { results.email = 'deduped'; }

  const today = new Date().toISOString().slice(0, 10);
  const smsKey = `chargeback_opened:${dispute.id}:${host.id}:sms:${today}`;
  if (host.phone && !await checkDedup(base44, smsKey)) {
    const smsResult = await sendSMS(host.phone, `uRide ALERT: A chargeback of $${dispute.stripe_dispute_amount || '?'} was filed on ${booking?.vehicle_name || 'a rental'}. Evidence due: ${dueBy}. Log in immediately: ${APP_URL}/host/payments`);
    await logDelivery(base44, { event_type: smsResult.ok ? 'notification.chargeback_opened.sms' : 'notification.delivery_failed', idempotency_key: smsKey, recipient_email: host.email, recipient_phone: host.phone, channel: 'sms', provider: 'twilio', provider_message_id: smsResult.sid, provider_status: smsResult.ok ? 'sent' : 'failed', failure_reason: smsResult.error, source_event: 'chargeback_opened', source_entity_type: 'Dispute', source_entity_id: dispute.id, host_id: host.id });
    results.sms = smsResult.ok ? 'sent' : `failed:${smsResult.error}`;
  } else { results.sms = host.phone ? 'deduped' : 'no_phone'; }

  return results;
}

async function handlePayoutHeld(base44, { host, payout, dispute }) {
  if (!host?.id) return { error: "Missing host" };
  const results = {};

  const inAppKey = `payout_held:${payout?.id || dispute?.id}:${host.id}:inapp`;
  if (!await checkDedup(base44, inAppKey)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: '⚠️ Payout Placed on Hold',
      body: `Your payout of $${payout?.net_host_payout || '?'} has been placed on hold due to a chargeback dispute. It will be released if the dispute is resolved in your favor.`,
      type: 'alert',
      category: 'payouts',
      is_read: false,
    }).catch(() => {});
    await logDelivery(base44, { event_type: 'notification.payout_held.inapp', idempotency_key: inAppKey, recipient_email: host.email, channel: 'inapp', provider: 'base44', provider_status: 'sent', source_event: 'payout_held', source_entity_type: 'HostPayout', source_entity_id: payout?.id || '', host_id: host.id });
    results.inapp = 'sent';
  } else { results.inapp = 'deduped'; }

  const emailKey = `payout_held:${payout?.id || dispute?.id}:${host.id}:email`;
  if (!await checkDedup(base44, emailKey)) {
    const html = emailTemplate('Payout Placed on Hold', `
      <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${host.full_name?.split(' ')[0] || 'there'},</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px">A payout of <strong>$${payout?.net_host_payout || '?'}</strong> has been temporarily held due to an active chargeback dispute.</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="margin:0;font-size:13px;color:#92400e">If the dispute is resolved in your favor, this payout will be released automatically. If you lose the dispute, the held amount may be used to satisfy the chargeback.</p>
      </div>
      <div style="text-align:center;margin-bottom:20px">
        <a href="${APP_URL}/host/payouts" style="display:inline-block;background:linear-gradient(135deg,#e91e8c,#7c3aed);color:white;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">View Payout Details →</a>
      </div>
    `);
    const emailResult = await sendEmail(host.email, `Payout Hold — $${payout?.net_host_payout || '?'} Pending Dispute Resolution`, html);
    await logDelivery(base44, { event_type: emailResult.ok ? 'notification.payout_held.email' : 'notification.delivery_failed', idempotency_key: emailKey, recipient_email: host.email, channel: 'email', provider: 'resend', provider_message_id: emailResult.message_id, provider_status: emailResult.ok ? 'sent' : 'failed', failure_reason: emailResult.error, source_event: 'payout_held', source_entity_type: 'HostPayout', source_entity_id: payout?.id || '', host_id: host.id });
    results.email = emailResult.ok ? 'sent' : `failed:${emailResult.error}`;
  } else { results.email = 'deduped'; }

  return results;
}

async function handleGPSOffline24h(base44, { vehicle, booking, host, device_id, last_update }) {
  if (!host?.id || !vehicle?.id) return { error: "Missing host or vehicle" };
  const today = new Date().toISOString().slice(0, 10);
  const results = {};
  const vehicleName = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim();

  const inAppKey = `gps_offline_24h:${device_id}:${host.id}:inapp:${today}`;
  if (!await checkDedup(base44, inAppKey)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: '📡 GPS Device Offline (24h+)',
      body: `Your ${vehicleName} GPS device has been offline for 24+ hours. Last seen: ${last_update || 'unknown'}. Please verify vehicle status.`,
      type: 'alert',
      category: 'gps',
      severity: 'critical',
      is_read: false,
    }).catch(() => {});
    await logDelivery(base44, { event_type: 'notification.gps_offline_24h.inapp', idempotency_key: inAppKey, recipient_email: host.email, channel: 'inapp', provider: 'base44', provider_status: 'sent', source_event: 'gps_offline_24h', source_entity_type: 'Vehicle', source_entity_id: vehicle.id, host_id: host.id, vehicle_id: vehicle.id, metadata: { device_id, last_update } });
    results.inapp = 'sent';
  } else { results.inapp = 'deduped'; }

  const emailKey = `gps_offline_24h:${device_id}:${host.id}:email:${today}`;
  if (!await checkDedup(base44, emailKey)) {
    const html = emailTemplate('📡 GPS Device Offline (24h+)', `
      <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${host.full_name?.split(' ')[0] || 'there'},</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px">Your GPS device on <strong>${vehicleName}</strong> has been offline for over 24 hours.</p>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:20px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Vehicle</td><td style="font-size:14px;font-weight:600;color:#111;text-align:right">${vehicleName}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Device ID</td><td style="font-size:14px;color:#111;text-align:right">${device_id || '—'}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Last Seen</td><td style="font-size:14px;color:#dc2626;text-align:right">${last_update || 'Unknown'}</td></tr>
          ${booking ? `<tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Active Rental</td><td style="font-size:14px;color:#f59e0b;text-align:right">⚠️ ${booking.customer_full_name || booking.user_email}</td></tr>` : ''}
        </table>
      </div>
      <div style="text-align:center">
        <a href="${APP_URL}/host/telematics" style="display:inline-block;background:linear-gradient(135deg,#e91e8c,#7c3aed);color:white;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">View Fleet GPS →</a>
      </div>
    `);
    const emailResult = await sendEmail(host.email, `📡 GPS Offline Alert — ${vehicleName} (24h+)`, html);
    await logDelivery(base44, { event_type: emailResult.ok ? 'notification.gps_offline_24h.email' : 'notification.delivery_failed', idempotency_key: emailKey, recipient_email: host.email, channel: 'email', provider: 'resend', provider_message_id: emailResult.message_id, provider_status: emailResult.ok ? 'sent' : 'failed', failure_reason: emailResult.error, source_event: 'gps_offline_24h', source_entity_type: 'Vehicle', source_entity_id: vehicle.id, host_id: host.id, vehicle_id: vehicle.id });
    results.email = emailResult.ok ? 'sent' : `failed:${emailResult.error}`;
  } else { results.email = 'deduped'; }

  const smsKey = `gps_offline_24h:${device_id}:${host.id}:sms:${today}`;
  if (host.phone && !await checkDedup(base44, smsKey)) {
    const smsResult = await sendSMS(host.phone, `uRide GPS ALERT: ${vehicleName} GPS device offline 24h+. Last seen: ${last_update || 'unknown'}. Check your fleet: ${APP_URL}/host/telematics`);
    await logDelivery(base44, { event_type: smsResult.ok ? 'notification.gps_offline_24h.sms' : 'notification.delivery_failed', idempotency_key: smsKey, recipient_email: host.email, recipient_phone: host.phone, channel: 'sms', provider: 'twilio', provider_message_id: smsResult.sid, provider_status: smsResult.ok ? 'sent' : 'failed', failure_reason: smsResult.error, source_event: 'gps_offline_24h', source_entity_type: 'Vehicle', source_entity_id: vehicle.id, host_id: host.id, vehicle_id: vehicle.id });
    results.sms = smsResult.ok ? 'sent' : `failed:${smsResult.error}`;
  } else { results.sms = host.phone ? 'deduped' : 'no_phone'; }

  return results;
}

async function handleGPSOffline72h(base44, { vehicle, booking, host, device_id, last_update }) {
  if (!vehicle?.id) return { error: "Missing vehicle" };
  const today = new Date().toISOString().slice(0, 10);
  const vehicleName = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim();

  const alertKey = `gps_offline_72h:${device_id}:${today}`;
  if (await checkDedup(base44, alertKey)) return { admin_alert: 'deduped' };

  // Create admin operational alert directly via service role (no user auth context in this flow)
  try {
    await base44.asServiceRole.entities.PaymentOperationalAlert.create({
      alert_type: 'gps_offline_72h',
      severity: 'critical',
      status: 'new',
      billing_context: 'gps_fleet',
      vehicle_id: vehicle.id,
      host_id: host?.id || '',
      booking_id: booking?.id || '',
      related_entity_type: 'Vehicle',
      related_entity_id: vehicle.id,
      title: `GPS Offline 72h+ — ${vehicleName}`,
      message: `GPS device ${device_id} on ${vehicleName} has been offline for 72+ hours. Active rental: ${booking ? (booking.customer_full_name || booking.user_email) : 'none'}.`,
      recommended_action: 'Verify vehicle location. Check with host. Consider escalating if active rental is affected.',
      financial_impact_amount: 0,
      currency: 'usd',
      requires_admin_action: true,
      requires_host_action: !!host?.id,
      requires_customer_action: false,
      source: 'gps_monitor',
    });
  } catch (e) {
    console.error('[sendCriticalNotification] GPS 72h admin alert failed:', e.message);
  }

  await logDelivery(base44, { event_type: 'notification.gps_offline_72h.admin_alert', idempotency_key: alertKey, recipient_email: 'admin', channel: 'admin_alert', provider: 'base44', provider_status: 'sent', source_event: 'gps_offline_72h', source_entity_type: 'Vehicle', source_entity_id: vehicle.id, host_id: host?.id || '', vehicle_id: vehicle.id, metadata: { device_id, last_update } });

  return { admin_alert: 'sent' };
}

async function handleComplianceExpiredHost(base44, { host, vehicle, doc_type, expiry_date }) {
  if (!host?.id || !vehicle?.id) return { error: "Missing host or vehicle" };
  const today = new Date().toISOString().slice(0, 10);
  const vehicleName = vehicle.display_name || `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim();
  const docLabel = { insurance: 'Insurance', registration: 'Registration', inspection: 'Inspection', title: 'Title' }[doc_type] || doc_type;
  const results = {};

  const inAppKey = `compliance_expired:${vehicle.id}:${doc_type}:${host.id}:inapp:${today}`;
  if (!await checkDedup(base44, inAppKey)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: `🚨 ${docLabel} Expired — Vehicle Suspended`,
      body: `${docLabel} for ${vehicleName} expired on ${expiry_date}. Vehicle is on Compliance Hold. Upload renewal to reinstate.`,
      type: 'alert',
      category: 'compliance',
      severity: 'critical',
      is_read: false,
    }).catch(() => {});
    await logDelivery(base44, { event_type: 'notification.compliance_expired.inapp', idempotency_key: inAppKey, recipient_email: host.email, channel: 'inapp', provider: 'base44', provider_status: 'sent', source_event: 'compliance_expired', source_entity_type: 'Vehicle', source_entity_id: vehicle.id, host_id: host.id, vehicle_id: vehicle.id });
    results.inapp = 'sent';
  } else { results.inapp = 'deduped'; }

  const emailKey = `compliance_expired:${vehicle.id}:${doc_type}:${host.id}:email:${today}`;
  if (!await checkDedup(base44, emailKey)) {
    const html = emailTemplate(`🚨 ${docLabel} Expired — Vehicle on Hold`, `
      <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${host.full_name?.split(' ')[0] || 'there'},</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px">Your <strong>${docLabel}</strong> for <strong>${vehicleName}</strong> expired on <strong>${expiry_date}</strong>. Your vehicle has been automatically placed on <strong>Compliance Hold</strong>.</p>
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="margin:0;font-size:13px;color:#7f1d1d"><strong>To reinstate:</strong> Upload a renewed ${docLabel} at the link below. Our team will verify and reinstate your vehicle automatically.</p>
      </div>
      <div style="text-align:center;margin-bottom:20px">
        <a href="${APP_URL}/host/compliance" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#991b1b);color:white;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">Upload Renewal →</a>
      </div>
    `);
    const emailResult = await sendEmail(host.email, `🚨 ${docLabel} Expired — ${vehicleName} on Compliance Hold`, html);
    await logDelivery(base44, { event_type: emailResult.ok ? 'notification.compliance_expired.email' : 'notification.delivery_failed', idempotency_key: emailKey, recipient_email: host.email, channel: 'email', provider: 'resend', provider_message_id: emailResult.message_id, provider_status: emailResult.ok ? 'sent' : 'failed', failure_reason: emailResult.error, source_event: 'compliance_expired', source_entity_type: 'Vehicle', source_entity_id: vehicle.id, host_id: host.id });
    results.email = emailResult.ok ? 'sent' : `failed:${emailResult.error}`;
  } else { results.email = 'deduped'; }

  const smsKey = `compliance_expired:${vehicle.id}:${doc_type}:${host.id}:sms:${today}`;
  if (host.phone && !await checkDedup(base44, smsKey)) {
    const smsResult = await sendSMS(host.phone, `uRide: ${docLabel} EXPIRED for ${vehicleName}. Vehicle on Compliance Hold. Upload renewal: ${APP_URL}/host/compliance`);
    await logDelivery(base44, { event_type: smsResult.ok ? 'notification.compliance_expired.sms' : 'notification.delivery_failed', idempotency_key: smsKey, recipient_email: host.email, recipient_phone: host.phone, channel: 'sms', provider: 'twilio', provider_message_id: smsResult.sid, provider_status: smsResult.ok ? 'sent' : 'failed', failure_reason: smsResult.error, source_event: 'compliance_expired', source_entity_type: 'Vehicle', source_entity_id: vehicle.id, host_id: host.id });
    results.sms = smsResult.ok ? 'sent' : `failed:${smsResult.error}`;
  } else { results.sms = host.phone ? 'deduped' : 'no_phone'; }

  return results;
}

async function handleComplianceHoldActiveBooking(base44, { booking, vehicle, doc_type }) {
  if (!booking?.id || !booking?.user_email) return { error: "Missing booking or customer email" };
  const today = new Date().toISOString().slice(0, 10);
  const vehicleName = vehicle?.display_name || `${vehicle?.year || ''} ${vehicle?.make || ''} ${vehicle?.model || ''}`.trim() || booking.vehicle_name;
  const docLabel = { insurance: 'Insurance', registration: 'Registration', inspection: 'Inspection', title: 'Title' }[doc_type] || 'compliance document';
  const results = {};

  const inAppKey = `compliance_hold_active_booking:${booking.id}:${booking.user_email}:inapp`;
  if (!await checkDedup(base44, inAppKey)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: booking.user_email,
      title: '⚠️ Important: Your Rental Vehicle Has a Compliance Issue',
      body: `Your ${vehicleName} rental has been affected by a compliance hold. Please contact support immediately for assistance.`,
      type: 'alert',
      category: 'bookings',
      booking_request_id: booking.id,
      severity: 'critical',
      is_read: false,
    }).catch(() => {});
    await logDelivery(base44, { event_type: 'notification.compliance_hold_active_booking.inapp', idempotency_key: inAppKey, recipient_email: booking.user_email, channel: 'inapp', provider: 'base44', provider_status: 'sent', source_event: 'compliance_hold_active_booking', source_entity_type: 'BookingRequest', source_entity_id: booking.id, booking_id: booking.id, vehicle_id: vehicle?.id || '' });
    results.inapp = 'sent';
  } else { results.inapp = 'deduped'; }

  const emailKey = `compliance_hold_active_booking:${booking.id}:${booking.user_email}:email`;
  if (!await checkDedup(base44, emailKey)) {
    const html = emailTemplate('⚠️ Your Rental — Action Required', `
      <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${booking.customer_full_name?.split(' ')[0] || 'there'},</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px">Your rental of <strong>${vehicleName}</strong> has been affected by a vehicle compliance issue. Our team has been notified and is working to resolve this quickly.</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px">Please <strong>contact support immediately</strong> so we can assist you with a replacement vehicle or alternative arrangement.</p>
      <div style="text-align:center;margin-bottom:20px">
        <a href="${APP_URL}/support" style="display:inline-block;background:linear-gradient(135deg,#e91e8c,#7c3aed);color:white;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">Contact Support →</a>
      </div>
    `);
    const emailResult = await sendEmail(booking.user_email, `⚠️ Action Required: Your ${vehicleName} Rental`, html);
    await logDelivery(base44, { event_type: emailResult.ok ? 'notification.compliance_hold_active_booking.email' : 'notification.delivery_failed', idempotency_key: emailKey, recipient_email: booking.user_email, channel: 'email', provider: 'resend', provider_message_id: emailResult.message_id, provider_status: emailResult.ok ? 'sent' : 'failed', failure_reason: emailResult.error, source_event: 'compliance_hold_active_booking', source_entity_type: 'BookingRequest', source_entity_id: booking.id, booking_id: booking.id });
    results.email = emailResult.ok ? 'sent' : `failed:${emailResult.error}`;
  } else { results.email = 'deduped'; }

  const smsKey = `compliance_hold_active_booking:${booking.id}:${booking.user_email}:sms`;
  if (booking.customer_phone && !await checkDedup(base44, smsKey)) {
    const smsResult = await sendSMS(booking.customer_phone, `uRide: Important update on your ${vehicleName} rental. A compliance issue requires immediate attention. Please contact support: ${APP_URL}/support`);
    await logDelivery(base44, { event_type: smsResult.ok ? 'notification.compliance_hold_active_booking.sms' : 'notification.delivery_failed', idempotency_key: smsKey, recipient_email: booking.user_email, recipient_phone: booking.customer_phone, channel: 'sms', provider: 'twilio', provider_message_id: smsResult.sid, provider_status: smsResult.ok ? 'sent' : 'failed', failure_reason: smsResult.error, source_event: 'compliance_hold_active_booking', source_entity_type: 'BookingRequest', source_entity_id: booking.id, booking_id: booking.id });
    results.sms = smsResult.ok ? 'sent' : `failed:${smsResult.error}`;
  } else { results.sms = booking.customer_phone ? 'deduped' : 'no_phone'; }

  return results;
}

async function handleWeeklyPaymentReceipt(base44, { booking, amount, week_number }) {
  if (!booking?.id || !booking?.user_email) return { error: "Missing booking or email" };
  const results = {};

  const inAppKey = `weekly_receipt:${booking.id}:week_${week_number}:${booking.user_email}:inapp`;
  if (!await checkDedup(base44, inAppKey)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: booking.user_email,
      title: `Week ${week_number} Payment Received — $${amount}`,
      body: `$${amount} for your ${booking.vehicle_name} rental (Week ${week_number}) has been processed. Next charge: ${booking.next_billing_date || 'in 7 days'}.`,
      type: 'payment',
      booking_request_id: booking.id,
      category: 'payments',
      is_read: false,
    }).catch(() => {});
    await logDelivery(base44, { event_type: 'notification.weekly_receipt.inapp', idempotency_key: inAppKey, recipient_email: booking.user_email, channel: 'inapp', provider: 'base44', provider_status: 'sent', source_event: 'weekly_payment_receipt', source_entity_type: 'BookingRequest', source_entity_id: booking.id, booking_id: booking.id });
    results.inapp = 'sent';
  } else { results.inapp = 'deduped'; }

  const emailKey = `weekly_receipt:${booking.id}:week_${week_number}:${booking.user_email}:email`;
  if (!await checkDedup(base44, emailKey)) {
    const ref = `UR-W${week_number}-${booking.id?.slice(-6)?.toUpperCase()}`;
    const html = emailTemplate(`Week ${week_number} Payment Confirmed`, `
      <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${booking.customer_full_name?.split(' ')[0] || 'there'},</p>
      <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 20px">Your Week ${week_number} rental payment has been processed successfully.</p>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:20px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Reference</td><td style="font-size:13px;font-family:monospace;color:#111;text-align:right">${ref}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Vehicle</td><td style="font-size:14px;color:#111;text-align:right">${booking.vehicle_name}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Week</td><td style="font-size:14px;color:#111;text-align:right">Week ${week_number}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Amount Charged</td><td style="font-size:15px;font-weight:700;color:#111;text-align:right">$${amount}</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af">Next Billing Date</td><td style="font-size:14px;color:#374151;text-align:right">${booking.next_billing_date || '7 days'}</td></tr>
        </table>
      </div>
      <div style="text-align:center">
        <a href="${APP_URL}/my-bookings" style="display:inline-block;background:linear-gradient(135deg,#e91e8c,#7c3aed);color:white;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">View My Rental →</a>
      </div>
    `);
    const emailResult = await sendEmail(booking.user_email, `Week ${week_number} Payment Confirmed — $${amount} · ${booking.vehicle_name} · ${ref}`, html);
    await logDelivery(base44, { event_type: emailResult.ok ? 'notification.weekly_receipt.email' : 'notification.delivery_failed', idempotency_key: emailKey, recipient_email: booking.user_email, channel: 'email', provider: 'resend', provider_message_id: emailResult.message_id, provider_status: emailResult.ok ? 'sent' : 'failed', failure_reason: emailResult.error, source_event: 'weekly_payment_receipt', source_entity_type: 'BookingRequest', source_entity_id: booking.id, booking_id: booking.id });
    results.email = emailResult.ok ? 'sent' : `failed:${emailResult.error}`;
  } else { results.email = 'deduped'; }

  return results;
}

async function handleStripeAccountRestricted(base44, { host, stripe_account_id, restriction_reason }) {
  if (!host?.id) return { error: "Missing host" };
  const today = new Date().toISOString().slice(0, 10);
  const results = {};

  const inAppKey = `stripe_restricted:${host.id}:inapp:${today}`;
  if (!await checkDedup(base44, inAppKey)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: '🔴 Stripe Account Restricted',
      body: 'Your Stripe payout account has been restricted. Payouts are paused until you resolve this. Go to your Stripe dashboard immediately.',
      type: 'alert',
      category: 'payouts',
      severity: 'critical',
      is_read: false,
    }).catch(() => {});
    await logDelivery(base44, { event_type: 'notification.stripe_restricted.inapp', idempotency_key: inAppKey, recipient_email: host.email, channel: 'inapp', provider: 'base44', provider_status: 'sent', source_event: 'stripe_account_restricted', source_entity_type: 'Host', source_entity_id: host.id, host_id: host.id });
    results.inapp = 'sent';
  } else { results.inapp = 'deduped'; }

  const emailKey = `stripe_restricted:${host.id}:email:${today}`;
  if (!await checkDedup(base44, emailKey)) {
    const html = emailTemplate('🔴 Stripe Account Restricted — Action Required', `
      <p style="font-size:15px;color:#374151;margin:0 0 20px">Hi ${host.full_name?.split(' ')[0] || 'there'},</p>
      <div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:12px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#7f1d1d">🔴 Your Stripe Connect account has been restricted.</p>
        <p style="margin:0;font-size:13px;color:#7f1d1d">Payouts are paused until you resolve this issue in your Stripe dashboard.</p>
      </div>
      ${restriction_reason ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;margin-bottom:20px"><p style="margin:0;font-size:13px;color:#92400e"><strong>Reason:</strong> ${restriction_reason}</p></div>` : ''}
      <div style="text-align:center;margin-bottom:20px">
        <a href="https://dashboard.stripe.com" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#991b1b);color:white;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none">Go to Stripe Dashboard →</a>
      </div>
    `);
    const emailResult = await sendEmail(host.email, '🔴 Stripe Account Restricted — Payouts Paused', html);
    await logDelivery(base44, { event_type: emailResult.ok ? 'notification.stripe_restricted.email' : 'notification.delivery_failed', idempotency_key: emailKey, recipient_email: host.email, channel: 'email', provider: 'resend', provider_message_id: emailResult.message_id, provider_status: emailResult.ok ? 'sent' : 'failed', failure_reason: emailResult.error, source_event: 'stripe_account_restricted', source_entity_type: 'Host', source_entity_id: host.id, host_id: host.id });
    results.email = emailResult.ok ? 'sent' : `failed:${emailResult.error}`;
  } else { results.email = 'deduped'; }

  const smsKey = `stripe_restricted:${host.id}:sms:${today}`;
  if (host.phone && !await checkDedup(base44, smsKey)) {
    const smsResult = await sendSMS(host.phone, `uRide URGENT: Your Stripe payout account has been restricted. Payouts are paused. Log into Stripe now: https://dashboard.stripe.com`);
    await logDelivery(base44, { event_type: smsResult.ok ? 'notification.stripe_restricted.sms' : 'notification.delivery_failed', idempotency_key: smsKey, recipient_email: host.email, recipient_phone: host.phone, channel: 'sms', provider: 'twilio', provider_message_id: smsResult.sid, provider_status: smsResult.ok ? 'sent' : 'failed', failure_reason: smsResult.error, source_event: 'stripe_account_restricted', source_entity_type: 'Host', source_entity_id: host.id, host_id: host.id });
    results.sms = smsResult.ok ? 'sent' : `failed:${smsResult.error}`;
  } else { results.sms = host.phone ? 'deduped' : 'no_phone'; }

  // Admin alert — direct service role write (no user auth context in webhook flow)
  const adminAlertKey = `stripe_restricted:${host.id}:admin_alert:${today}`;
  if (!await checkDedup(base44, adminAlertKey)) {
    try {
      await base44.asServiceRole.entities.PaymentOperationalAlert.create({
        alert_type: 'stripe_account_restricted',
        severity: 'critical',
        status: 'new',
        billing_context: 'payout',
        host_id: host.id,
        related_entity_type: 'Host',
        related_entity_id: host.id,
        title: `Stripe Account Restricted — ${host.full_name}`,
        message: `Host ${host.email} Stripe account (${stripe_account_id}) has been restricted. Payouts are paused.`,
        recommended_action: 'Contact host and review Stripe dashboard. All pending payouts are blocked.',
        financial_impact_amount: 0,
        currency: 'usd',
        requires_admin_action: true,
        requires_host_action: true,
        requires_customer_action: false,
        source: 'stripe_webhook',
      });
      results.admin_alert = 'sent';
    } catch (e) {
      results.admin_alert = `failed:${e.message}`;
    }
    await logDelivery(base44, { event_type: 'notification.stripe_restricted.admin_alert', idempotency_key: adminAlertKey, recipient_email: 'admin', channel: 'admin_alert', provider: 'base44', provider_status: 'sent', source_event: 'stripe_account_restricted', source_entity_type: 'Host', source_entity_id: host.id, host_id: host.id });
  } else { results.admin_alert = 'deduped'; }

  return results;
}

// ── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event_type } = body;

    if (!event_type) return Response.json({ error: 'Missing event_type' }, { status: 400 });

    let result;
    switch (event_type) {
      case 'booking_approved':
        result = await handleBookingApproved(base44, body);
        break;
      case 'booking_rejected':
        result = await handleBookingRejected(base44, body);
        break;
      case 'chargeback_opened':
        result = await handleChargebackOpened(base44, body);
        break;
      case 'payout_held':
        result = await handlePayoutHeld(base44, body);
        break;
      case 'gps_offline_24h':
        result = await handleGPSOffline24h(base44, body);
        break;
      case 'gps_offline_72h':
        result = await handleGPSOffline72h(base44, body);
        break;
      case 'compliance_expired_host':
        result = await handleComplianceExpiredHost(base44, body);
        break;
      case 'compliance_hold_active_booking':
        result = await handleComplianceHoldActiveBooking(base44, body);
        break;
      case 'weekly_payment_receipt':
        result = await handleWeeklyPaymentReceipt(base44, body);
        break;
      case 'stripe_account_restricted':
        result = await handleStripeAccountRestricted(base44, body);
        break;
      default:
        return Response.json({ error: `Unknown event_type: ${event_type}` }, { status: 400 });
    }

    // ── PUSH NOTIFICATION (OneSignal) ──────────────────────────────────────
    const pushTemplate = getPushTemplate(event_type, body);
    if (pushTemplate) {
      const pushEmail = body.booking?.user_email || body.host?.email || '';
      const today = new Date().toISOString().slice(0, 10);
      const pushKey = `${event_type}:push:${pushEmail}:${today}`;
      if (pushEmail && !await checkDedup(base44, pushKey)) {
        const pushResult = await sendPush({ user_email: pushEmail, title: pushTemplate.title, body: pushTemplate.body, url: pushTemplate.url });
        await logDelivery(base44, {
          event_type: pushResult.ok ? `notification.${event_type}.push` : 'notification.delivery_failed',
          idempotency_key: pushKey,
          recipient_email: pushEmail,
          channel: 'push',
          provider: 'onesignal',
          provider_message_id: pushResult.notification_id,
          provider_status: pushResult.ok ? 'sent' : 'failed',
          failure_reason: pushResult.error,
          source_event: event_type,
          source_entity_type: body.booking ? 'BookingRequest' : body.host ? 'Host' : '',
          source_entity_id: body.booking?.id || body.host?.id || '',
          host_id: body.host?.id || '',
          booking_id: body.booking?.id || '',
          vehicle_id: body.vehicle?.id || body.booking?.vehicle_id || '',
          metadata: { recipients: pushResult.recipients },
        });
        result.push = pushResult.ok ? `sent (${pushResult.recipients} recipients)` : `failed:${pushResult.error}`;
      } else {
        result.push = pushEmail ? 'deduped' : 'no_email';
      }
    }

    return Response.json({ ok: true, event_type, result });
  } catch (error) {
    console.error('[sendCriticalNotification] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});