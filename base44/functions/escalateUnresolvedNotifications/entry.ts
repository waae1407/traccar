/**
 * escalateUnresolvedNotifications — Critical notification escalation automation
 *
 * Runs every 5 minutes to check for unresolved critical notifications:
 *   - 15 minutes unread → email fallback
 *   - 30 minutes unread → SMS fallback (critical only)
 *   - 60 minutes unread → admin operations escalation + OperationalAlert
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ESCALATION_THRESHOLDS = {
  email_fallback_minutes: 15,
  sms_fallback_minutes: 30,
  admin_escalation_minutes: 60,
};

async function authorizeEscalationRun(base44, body) {
  const user = await base44.auth.me().catch(() => null);
  if (user) {
    if (user.role !== 'admin') {
      return { allowed: false, response: Response.json({ error: 'Forbidden: escalation is admin-only' }, { status: 403 }) };
    }
    return { allowed: true };
  }

  const automation = body?.automation || {};
  const isScheduler = automation.id === 'escalation_scheduler' || automation.name?.includes('Notification Escalation');

  if (!isScheduler) {
    return { allowed: false, response: Response.json({ error: 'Unauthorized scheduled function caller' }, { status: 401 }) };
  }

  return { allowed: true };
}

async function sendEmail(base44, to, subject, body) {
  try {
    await base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body, from_name: "uRide Operations" });
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const authorization = await authorizeEscalationRun(base44, body);
    if (!authorization.allowed) return authorization.response;

    const now = new Date();
    const results = {
      email_fallbacks: 0,
      sms_fallbacks: 0,
      admin_escalations: 0,
      total_checked: 0,
    };

    // Fetch critical/unread notifications from last 2 hours
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const criticalNotifications = await base44.asServiceRole.entities.Notification.filter({
      severity: 'critical',
      is_read: false,
      created_date: { $gte: twoHoursAgo },
    }, '-created_date', 200);

    for (const notif of criticalNotifications) {
      results.total_checked++;
      const createdDate = new Date(notif.created_date);
      const ageMinutes = (now.getTime() - createdDate.getTime()) / (1000 * 60);
      const lastSeenDate = notif.last_seen_at ? new Date(notif.last_seen_at) : createdDate;
      const unreadMinutes = (now.getTime() - lastSeenDate.getTime()) / (1000 * 60);

      // Track escalation state in metadata
      const escalationState = notif.metadata?.escalation_state || { email_sent: false, sms_sent: false, admin_escalated: false };

      // 15 minutes: Email fallback
      if (unreadMinutes >= ESCALATION_THRESHOLDS.email_fallback_minutes && !escalationState.email_sent) {
        const emailResult = await sendEmail(
          base44,
          notif.recipient_email,
          `[uRide URGENT] ${notif.title}`,
          `Hi,\n\nThis is an urgent notification that requires your attention:\n\n${notif.body}\n\nPlease log in to view details: https://uridehub.com${notif.action_url || '/dashboard'}`
        );

        if (emailResult.ok) {
          await base44.asServiceRole.entities.Notification.update(notif.id, {
            metadata: { ...notif.metadata, escalation_state: { ...escalationState, email_sent: true, email_sent_at: now.toISOString() } },
            channels_attempted: [...(notif.channels_attempted || []), 'email'],
            channels_successful: emailResult.ok ? [...(notif.channels_successful || []), 'email'] : (notif.channels_successful || []),
          });

          await base44.asServiceRole.entities.NotificationDeliveryLog.create({
            notification_id: notif.id,
            event_type: notif.event_type || 'escalation_email_fallback',
            recipient_role: notif.recipient_role,
            recipient_user_id: notif.recipient_user_id,
            recipient_email: notif.recipient_email,
            channel: 'email',
            attempted_at: now.toISOString(),
            success: true,
            source_function: 'escalateUnresolvedNotifications',
            booking_id: notif.booking_request_id,
            vehicle_id: notif.vehicle_id,
            host_id: notif.host_id,
            metadata: { escalation_level: '15min_email_fallback', unread_minutes: Math.round(unreadMinutes) },
          }).catch(() => {});

          results.email_fallbacks++;
        }
      }

      // 30 minutes: SMS fallback (critical only)
      if (unreadMinutes >= ESCALATION_THRESHOLDS.sms_fallback_minutes && !escalationState.sms_sent && notif.recipient_phone) {
        const smsResult = await sendSMS(
          notif.recipient_phone,
          `uRide URGENT (${Math.round(unreadMinutes)}min): ${notif.title}. Action required: https://uridehub.com${notif.action_url || '/dashboard'}`
        );

        if (smsResult.ok) {
          await base44.asServiceRole.entities.Notification.update(notif.id, {
            metadata: { ...notif.metadata, escalation_state: { ...escalationState, sms_sent: true, sms_sent_at: now.toISOString() } },
            channels_attempted: [...(notif.channels_attempted || []), 'sms'],
            channels_successful: smsResult.ok ? [...(notif.channels_successful || []), 'sms'] : (notif.channels_successful || []),
          });

          await base44.asServiceRole.entities.NotificationDeliveryLog.create({
            notification_id: notif.id,
            event_type: notif.event_type || 'escalation_sms_fallback',
            recipient_role: notif.recipient_role,
            recipient_user_id: notif.recipient_user_id,
            recipient_email: notif.recipient_email,
            recipient_phone: notif.recipient_phone,
            channel: 'sms',
            attempted_at: now.toISOString(),
            success: true,
            provider_message_id: smsResult.sid,
            source_function: 'escalateUnresolvedNotifications',
            booking_id: notif.booking_request_id,
            vehicle_id: notif.vehicle_id,
            host_id: notif.host_id,
            metadata: { escalation_level: '30min_sms_fallback', unread_minutes: Math.round(unreadMinutes) },
          }).catch(() => {});

          results.sms_fallbacks++;
        }
      }

      // 60 minutes: Admin operations escalation
      if (unreadMinutes >= ESCALATION_THRESHOLDS.admin_escalation_minutes && !escalationState.admin_escalated) {
        // Create OperationalAlert for admin team
        await base44.asServiceRole.entities.PaymentOperationalAlert.create({
          alert_type: 'notification_escalation_critical',
          severity: 'critical',
          status: 'new',
          title: `CRITICAL Notification Unresolved ${Math.round(unreadMinutes)}min — ${notif.title}`,
          message: `Notification created at ${notif.created_date} for ${notif.recipient_role} (${notif.recipient_email}) remains unread after ${Math.round(unreadMinutes)} minutes. Email/SMS fallbacks ${escalationState.email_sent ? 'sent' : 'not sent'} / ${escalationState.sms_sent ? 'sent' : 'not sent'}.`,
          recommended_action: `Manually contact ${notif.recipient_role} immediately. Review notification delivery logs. Check for systemic delivery issues.`,
          domain: 'communications',
          action_url: `/admin/notification-center?filter=unresolved_critical`,
          related_entity_type: 'Notification',
          related_entity_id: notif.id,
          booking_id: notif.booking_request_id,
          vehicle_id: notif.vehicle_id,
          host_id: notif.host_id,
          customer_id: notif.customer_id,
          financial_impact_amount: 0,
          currency: 'usd',
          requires_admin_action: true,
          requires_host_action: notif.recipient_role === 'host',
          requires_customer_action: notif.recipient_role === 'customer',
          source: 'escalateUnresolvedNotifications',
          metadata: {
            original_notification_id: notif.id,
            original_event_type: notif.event_type,
            escalation_level: '60min_admin_escalation',
            unread_minutes: Math.round(unreadMinutes),
            email_fallback_sent: escalationState.email_sent,
            sms_fallback_sent: escalationState.sms_sent,
          },
          first_seen_at: now.toISOString(),
          dedupe_key: `notification_escalation:${notif.id}:${Math.floor(unreadMinutes / 60)}h`,
        }).catch(() => {});

        // Notify all admins via central router
        await base44.asServiceRole.functions.invoke('routePlatformNotification', {
          event_type: 'notification_escalation_critical',
          severity: 'critical',
          category: 'system',
          title: `🚨 CRITICAL: Unresolved Notification ${Math.round(unreadMinutes)}min`,
          message: `${notif.title} — ${notif.recipient_role} unreachable. Original: ${notif.created_date}. Fallbacks: email=${escalationState.email_sent ? '✓' : '✗'}, sms=${escalationState.sms_sent ? '✓' : '✗'}`,
          action_url: `/admin/notification-center?filter=unresolved_critical`,
          metadata: { original_notification_id: notif.id, escalation_level: '60min_admin_escalation' },
          notify_admin: true,
        }).catch(() => {});

        await base44.asServiceRole.entities.Notification.update(notif.id, {
          metadata: { ...notif.metadata, escalation_state: { ...escalationState, admin_escalated: true, admin_escalated_at: now.toISOString() } },
          operational_alert_id: notif.operational_alert_id || `escalation_${notif.id}`,
        });

        results.admin_escalations++;
      }
    }

    console.log(`[NotificationEscalation] Checked ${results.total_checked} critical notifications — email:${results.email_fallbacks} sms:${results.sms_fallbacks} admin:${results.admin_escalations}`);

    return Response.json({ ok: true, ...results, thresholds: ESCALATION_THRESHOLDS, timestamp: now.toISOString() });
  } catch (error) {
    console.error('[escalateUnresolvedNotifications] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});