/**
 * routePlatformNotification — Central notification routing system
 *
 * All platform notifications flow through this function.
 * Determines recipients, creates in-app notifications, operational alerts,
 * Alert360 events (for telematics), and manages email/SMS fallback.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const APP_URL = "https://uridehub.com";

// Suppression windows in milliseconds
const SUPPRESSION_WINDOWS = {
  rental_overdue: 6 * 60 * 60 * 1000,
  pickup_inspection_incomplete: 3 * 60 * 60 * 1000,
  return_review_required: 3 * 60 * 60 * 1000,
  payment_failed: 12 * 60 * 60 * 1000,
  pricing_mismatch: 24 * 60 * 60 * 1000,
  telematics_parser_error: 10 * 60 * 1000,
  command_ack_failure: 10 * 60 * 1000,
  default: 60 * 60 * 1000,
};

async function checkDedup(base44, event_type, related_entity_id, recipient_email) {
  const existing = await base44.asServiceRole.entities.Notification.filter({ 
    event_type,
    related_entity_id: related_entity_id || '',
    recipient_email,
  }, '-created_date', 1).catch(() => []);
  
  if (existing.length === 0) return { exists: false };
  
  const notif = existing[0];
  const suppressionMs = SUPPRESSION_WINDOWS[event_type] || SUPPRESSION_WINDOWS.default;
  const lastSeen = notif.last_seen_at ? new Date(notif.last_seen_at).getTime() : new Date(notif.created_date).getTime();
  
  if (Date.now() < lastSeen + suppressionMs) {
    return { exists: true, notification: notif, suppressed: true };
  }
  
  return { exists: true, notification: notif, suppressed: false };
}

async function sendEmail(base44, to, subject, body) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY || !to || !subject || !body) return { ok: false, error: "MISSING_CONFIG" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "uRide <noreply@uridehub.com>", to: [to], subject, html: body }),
    });
    const data = await res.json();
    return res.ok ? { ok: true, id: data.id } : { ok: false, error: data.message || "Email failed" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendSMS(to, message) {
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_PHONE = Deno.env.get("TWILIO_PHONE_NUMBER");
  
  if (!to || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) return { ok: false, error: "TWILIO_NOT_CONFIGURED" };
  
  const phone = String(to).replace(/\D/g, "");
  const normalized = phone.startsWith("1") && phone.length === 11 ? `+${phone}` : `+1${phone}`;
  if (normalized.length < 12) return { ok: false, error: "INVALID_PHONE" };
  
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: { "Authorization": "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: normalized, From: TWILIO_PHONE, Body: message }),
    });
    const data = await res.json();
    return res.ok ? { ok: true, sid: data.sid } : { ok: false, error: data.message };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function sendPush(base44, user_email, title, body, url) {
  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const restKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
  if (!appId || !restKey || !user_email) return { ok: false, error: 'NOT_CONFIGURED' };
  
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
        url: url ? (url.startsWith('http') ? url : `${APP_URL}${url}`) : undefined,
      }),
    });
    const data = await res.json();
    return res.ok ? { ok: true, notification_id: data.id, recipients: data.recipients || 0 } : { ok: false, error: data.errors?.[0] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Notification standard ────────────────────────────────────────────────
// One skeleton for every outbound message: brand header, kicker, headline,
// the facts that matter, what to do next, and the fixed sign-off. Rendered as
// branded email, compressed SMS, and an in-app body from the same source.

const BRAND = {
  logo: 'https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/62095243e_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.png',
  headerBg: '#f42a74',
  headerText: '#000000',
  primary: '#f42a74',
  onPrimary: '#000000',
  pageBg: '#0d1017',
  cardBg: '#151923',
  border: '#262b36',
  body: '#f0f2f5',
  muted: '#768593',
};

const SIGN_OFF = 'Regards, uRide Support Team';

// Internal mechanics are meaningless to a renter and alarming in an inbox.
const JARGON = [
  [/\bvehicle starter access\b/gi, 'vehicle access'],
  [/\bheartbeat freshness gate\b/gi, 'vehicle check'],
  [/\bfreshness gate\b/gi, 'safety check'],
  [/\bstarter interrupt\b/gi, 'vehicle access hold'],
  [/\bstarter kill\b/gi, 'vehicle access hold'],
  [/\bstarter access\b/gi, 'vehicle access'],
  [/\bstarter\b/gi, 'vehicle access'],
  [/\btelematics device\b/gi, 'vehicle unit'],
  [/\bUDP session\b/gi, 'connection'],
  [/\bservice context\b/gi, 'request'],
];

function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (c) => map[c]);
}

// Admins get the raw technical copy; everyone else gets it in plain words.
function plainCopy(role, text) {
  let out = String(text ?? '');
  if (role !== 'admins') {
    for (const [pattern, replacement] of JARGON) {
      // Keep the reader's sentence capitalisation: a swap at the start of a
      // sentence must not leave the line beginning with a lower-case word.
      out = out.replace(pattern, (match) =>
        /^[A-Z]/.test(match) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement
      );
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

function referenceCode(bookingId) {
  if (!bookingId) return null;
  return 'UR-' + String(bookingId).replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase();
}

function kickerFor(severity, category) {
  if (severity === 'critical') return category === 'payments' ? 'PAYMENT ACTION NEEDED' : 'ACTION REQUIRED';
  if (severity === 'warning') return 'HEADS UP';
  return 'UPDATE';
}

const PAY_GUIDANCE = 'You can make this payment in the app: open My Bookings, choose this rental, and tap Pay Now.';

function factsFor(ctx) {
  const meta = ctx.metadata || {};
  const rows = [];
  if (meta.vehicle_name) rows.push(['Vehicle', meta.vehicle_name]);
  if (meta.amount != null && meta.amount !== '') rows.push(['Amount', '$' + Number(meta.amount).toFixed(2)]);
  const ref = referenceCode(ctx.booking_id);
  if (ref) rows.push(['Reference', ref]);
  const when = new Date(ctx.now).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  rows.push(['When', when + ' PT']);
  return rows;
}

function buildInAppBody(role, copy, ctx) {
  const text = plainCopy(role, copy.message);
  if (role !== 'customers' || ctx.category !== 'payments' || text.includes('Pay Now')) return text;
  return `${text} ${PAY_GUIDANCE}`;
}

function buildSmsText(role, copy, ctx) {
  const title = plainCopy(role, copy.title);
  const body = plainCopy(role, copy.message);
  const link = APP_URL + (ctx.action_url || '');
  let core = `${title}. ${body}`;
  if (role === 'customers' && ctx.category === 'payments' && !body.includes('Pay Now')) core += ` ${PAY_GUIDANCE}`;
  if (core.length > 150) core = core.slice(0, 147).trim() + '...';
  return `uRide: ${core} ${link} ${SIGN_OFF}`;
}

function buildEmailHtml(role, copy, ctx) {
  const kicker = kickerFor(ctx.severity, ctx.category);
  const headline = escapeHtml(plainCopy(role, copy.title));
  const message = escapeHtml(plainCopy(role, copy.message));
  const rowHtml = factsFor(ctx).map(([label, value]) =>
    '<tr>' +
    '<td style="padding:8px 0;font-family:Inter,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:' + BRAND.muted + ';">' + escapeHtml(label) + '</td>' +
    '<td align="right" style="padding:8px 0;font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:600;color:' + BRAND.body + ';">' + escapeHtml(value) + '</td>' +
    '</tr>'
  ).join('');

  const guidance = role === 'customers' && ctx.category === 'payments' ? PAY_GUIDANCE : '';
  const guidanceHtml = guidance
    ? '<p style="margin:24px 0 0;padding:14px 16px;background:#1d2430;border-left:3px solid ' + BRAND.primary + ';border-radius:10px;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.6;color:' + BRAND.body + ';">' + escapeHtml(guidance) + '</p>'
    : '';

  const url = APP_URL + (ctx.action_url || '');
  const ctaLabel = role === 'customers' && ctx.category === 'payments' ? 'Pay in the app' : 'Open uRide';
  const cta = '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 0;"><tr><td style="background:' + BRAND.primary + ';border-radius:16px;">' +
    '<a href="' + url + '" style="display:inline-block;padding:14px 26px;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;color:' + BRAND.onPrimary + ';text-decoration:none;">' + ctaLabel + '</a>' +
    '</td></tr></table>';

  const signOff = role === 'admins'
    ? ''
    : '<p style="margin:28px 0 0;font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.7;color:' + BRAND.muted + ';">Regards,<br><span style="color:' + BRAND.body + ';font-weight:600;">uRide Support Team</span></p>';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + headline + '</title></head>' +
    '<body style="margin:0;padding:0;background:' + BRAND.pageBg + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + BRAND.pageBg + ';"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">' +
    '<tr><td style="padding:0 0 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + BRAND.headerBg + ';border-radius:16px;"><tr><td style="padding:16px 24px;">' +
    '<img src="' + BRAND.logo + '" width="26" height="26" alt="uRide" style="vertical-align:middle;border-radius:50%;display:inline-block;">' +
    '<span style="font-family:Inter,Arial,sans-serif;font-size:18px;font-weight:800;letter-spacing:-0.02em;color:' + BRAND.headerText + ';vertical-align:middle;padding-left:10px;">uRide</span>' +
    '</td></tr></table></td></tr>' +
    '<tr><td style="background:' + BRAND.cardBg + ';border:1px solid ' + BRAND.border + ';border-radius:16px;padding:30px 26px;">' +
    '<p style="margin:0 0 12px;font-family:Inter,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:' + BRAND.primary + ';">' + kicker + '</p>' +
    '<h1 style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:22px;line-height:1.3;font-weight:700;color:' + BRAND.body + ';">' + headline + '</h1>' +
    '<p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;color:' + BRAND.body + ';">' + message + '</p>' +
    (rowHtml ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;border-top:1px solid ' + BRAND.border + ';border-bottom:1px solid ' + BRAND.border + ';">' + rowHtml + '</table>' : '') +
    guidanceHtml + cta + signOff +
    '</td></tr>' +
    '<tr><td style="padding:18px 8px 0;text-align:center;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.6;color:' + BRAND.muted + ';">' +
    'uRide &middot; <a href="' + APP_URL + '" style="color:' + BRAND.muted + ';text-decoration:underline;">uridehub.com</a>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const {
      event_type,
      severity = 'info',
      category = 'system',
      title,
      message,
      booking_id,
      vehicle_id,
      host_id,
      customer_id,
      company_id,
      payment_id,
      alert360_event_id,
      operational_alert_id,
      actor_user_id,
      source_function,
      action_url,
      metadata = {},
      title_by_role = {},
      message_by_role = {},
    } = body;

    if (!event_type || !title) {
      return Response.json({ error: 'event_type and title are required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const results = { inapp: [], operational_alert: null, alert360: null, email: [], sms: [], push: [] };

    // Optional per-audience copy. Role key is one of: customers | hosts | admins.
    // Each audience falls back to the default title/message when no override is given.
    const copyFor = (role) => ({
      title: title_by_role[role] || title,
      message: message_by_role[role] || message,
    });

    // ── Determine Recipients ──────────────────────────────────────────────
    const recipients = { customers: [], hosts: [], admins: [], support: [] };
    
    // Customer recipients
    if (customer_id) {
      const customers = await base44.asServiceRole.entities.User.filter({ id: customer_id }).catch(() => []);
      recipients.customers.push(...customers);
    }
    
    // Host recipients
    if (host_id) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ id: host_id }).catch(() => []);
      recipients.hosts.push(...hosts);
    }
    
    // Admin recipients
    if (severity === 'critical' || ['admin', 'support'].includes(category)) {
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }).catch(() => []);
      recipients.admins.push(...admins);
    }

    // ── Create In-App Notifications ───────────────────────────────────────
    for (const [role, users] of Object.entries(recipients)) {
      const copy = copyFor(role);
      const inAppBody = buildInAppBody(role, copy, { category });
      for (const user of users) {
        const dedup = await checkDedup(base44, event_type, booking_id || vehicle_id || alert360_event_id, user.email);
        
        if (dedup.exists && dedup.suppressed) {
          results.inapp.push({ role, email: user.email, status: 'deduped' });
          continue;
        }
        
        if (dedup.exists && !dedup.suppressed) {
          // Update existing notification
          await base44.asServiceRole.entities.Notification.update(dedup.notification.id, {
            occurrence_count: (dedup.notification.occurrence_count || 1) + 1,
            last_seen_at: now,
            body: inAppBody,
          }).catch(() => {});
          results.inapp.push({ role, email: user.email, status: 'updated' });
          continue;
        }
        
        // Create new notification
        await base44.asServiceRole.entities.Notification.create({
          recipient_user_id: user.id,
          recipient_role: role,
          recipient_email: user.email,
          recipient_phone: user.phone || '',
          title: copy.title,
          body: inAppBody,
          type: category === 'payments' ? 'payment' : (severity === 'critical' ? 'alert' : 'system'),
          category,
          severity,
          event_type,
          related_entity_type: alert360_event_id ? 'TelematicsSafetyEvent' : (booking_id ? 'BookingRequest' : ''),
          related_entity_id: booking_id || vehicle_id || alert360_event_id || '',
          booking_request_id: booking_id,
          booking_id,
          vehicle_id,
          host_id,
          customer_id,
          company_id,
          payment_id,
          alert360_event_id,
          operational_alert_id,
          action_url,
          delivery_status: 'sent',
          channels_attempted: ['inapp'],
          channels_successful: ['inapp'],
          source_function: source_function || 'routePlatformNotification',
          metadata,
          occurrence_count: 1,
          last_seen_at: now,
        }).catch(() => {});
        
        results.inapp.push({ role, email: user.email, status: 'created' });
      }
    }

    // ── Create OperationalAlert for Critical Admin Issues ─────────────────
    if (severity === 'critical' && recipients.admins.length > 0) {
      const dedupeKey = `${event_type}:${booking_id || vehicle_id || alert360_event_id}`;
      const existingAlerts = await base44.asServiceRole.entities.PaymentOperationalAlert.filter({
        alert_type: event_type,
        related_booking_id: booking_id,
        status: { $in: ['new', 'notified', 'in_progress'] },
      }, '-created_date', 1).catch(() => []);
      
      if (existingAlerts.length === 0) {
        await base44.asServiceRole.entities.PaymentOperationalAlert.create({
          alert_type: event_type,
          severity: 'critical',
          status: 'new',
          title: copyFor('admins').title,
          message: copyFor('admins').message,
          recommended_action: body.recommended_action || 'Review in admin dashboard',
          domain: category === 'telematics' ? 'telematics' : (category === 'payments' ? 'payments' : 'system'),
          action_url,
          related_booking_id: booking_id,
          related_customer_id: customer_id,
          related_alert360_event_id: alert360_event_id,
          payment_id,
          vehicle_id,
          host_id,
          financial_impact_amount: metadata.financial_impact_amount || 0,
          currency: 'usd',
          requires_admin_action: true,
          requires_host_action: !!host_id,
          requires_customer_action: !!customer_id,
          source: source_function || 'routePlatformNotification',
          metadata: { ...metadata, created_by: 'routePlatformNotification' },
          first_seen_at: now,
          dedupe_key: dedupeKey,
        }).catch(() => {});
        results.operational_alert = 'created';
      }
    }

    // ── Email/SMS Fallback for Critical Unresolved ────────────────────────
    if (severity === 'critical') {
      const emailCtx = { severity, category, metadata, now, action_url, booking_id };

      // Email — same branded skeleton for every audience
      for (const [role, users] of Object.entries(recipients)) {
        const copy = copyFor(role);
        for (const user of users) {
          if (user.email) {
            const subject = `[uRide] ${plainCopy(role, copy.title)}`;
            const emailResult = await sendEmail(base44, user.email, subject, buildEmailHtml(role, copy, emailCtx));
            results.email.push({ role: user.role || role, email: user.email, ...emailResult });
          }
        }
      }

      // SMS — same skeleton, compressed, sign-off intact
      for (const [role, users] of Object.entries(recipients)) {
        const copy = copyFor(role);
        for (const user of users) {
          if (user.phone) {
            const smsResult = await sendSMS(user.phone, buildSmsText(role, copy, emailCtx));
            results.sms.push({ role: user.role || role, phone: user.phone, ...smsResult });
          }
        }
      }
    }

    // ── Push Notifications ────────────────────────────────────────────────
    for (const [role, users] of Object.entries(recipients)) {
      const copy = copyFor(role);
      for (const user of users) {
        if (user.email) {
          const pushResult = await sendPush(base44, user.email, copy.title, copy.message, action_url);
          results.push.push({ role, email: user.email, ...pushResult });
        }
      }
    }

    return Response.json({ ok: true, results, timestamp: now });
  } catch (error) {
    console.error('[routePlatformNotification] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});