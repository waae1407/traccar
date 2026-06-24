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
  try {
    await base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body, from_name: "uRide" });
    return { ok: true };
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
    } = body;

    if (!event_type || !title) {
      return Response.json({ error: 'event_type and title are required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const results = { inapp: [], operational_alert: null, alert360: null, email: [], sms: [], push: [] };

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
            body: message,
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
          title,
          body: message,
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
          title,
          message,
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
      // Email fallback after 15 minutes (simplified: send immediately for critical)
      for (const user of [...recipients.admins, ...recipients.hosts]) {
        if (user.email) {
          const emailResult = await sendEmail(base44, user.email, `[uRide ${severity.toUpperCase()}] ${title}`, message);
          results.email.push({ role: user.role || 'admin', email: user.email, ...emailResult });
        }
      }
      
      // SMS for critical host/admin issues
      for (const user of [...recipients.admins, ...recipients.hosts]) {
        if (user.phone) {
          const smsResult = await sendSMS(user.phone, `uRide ${severity.toUpperCase()}: ${title}. ${APP_URL}${action_url || '/dashboard'}`);
          results.sms.push({ role: user.role || 'admin', phone: user.phone, ...smsResult });
        }
      }
    }

    // ── Push Notifications ────────────────────────────────────────────────
    for (const user of [...recipients.customers, ...recipients.hosts, ...recipients.admins]) {
      if (user.email) {
        const pushResult = await sendPush(base44, user.email, title, message, action_url);
        results.push.push({ email: user.email, ...pushResult });
      }
    }

    return Response.json({ ok: true, results, timestamp: now });
  } catch (error) {
    console.error('[routePlatformNotification] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});