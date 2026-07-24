/**
 * retryFailedNotifications — Scheduled retry engine for failed notification deliveries
 *
 * Retry schedule:
 *   Attempt 1: immediate (handled by sendCriticalNotification)
 *   Attempt 2: 5 minutes
 *   Attempt 3: 30 minutes
 *   Attempt 4: 2 hours
 *   Attempt 5: 24 hours
 *   After 5: dead-letter queue + admin alert
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_PHONE = Deno.env.get("TWILIO_PHONE_NUMBER");

const RETRY_DELAYS_MINUTES = [0, 5, 30, 120, 1440]; // attempt index maps to delay
const MAX_RETRIES = 5;

function toE164(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 10) return null;
  const normalized = digits.startsWith("1") && digits.length === 11 ? `+${digits}` : `+1${digits}`;
  return normalized.length >= 12 ? normalized : null;
}

async function retrySMS(to, body) {
  const phone = toE164(to);
  if (!phone) return { ok: false, error: "INVALID_PHONE" };
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE) return { ok: false, error: "TWILIO_NOT_CONFIGURED" };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ To: phone, From: TWILIO_PHONE, Body: body }),
  });
  const data = await res.json();
  return res.ok ? { ok: true, sid: data.sid } : { ok: false, error: data.message || "SMS_FAILED" };
}

async function retryEmail(to, subject, html) {
  if (!RESEND_API_KEY || !to) return { ok: false, error: "NO_CONFIG" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "uRide <noreply@uridehub.com>", to: [to], subject, html }),
  });
  const data = await res.json();
  return res.ok ? { ok: true, message_id: data.id } : { ok: false, error: data.message || "EMAIL_FAILED" };
}

function nextRetryAt(retryCount) {
  const nextIndex = retryCount; // retryCount is 0-based after first failure
  if (nextIndex >= RETRY_DELAYS_MINUTES.length) return null;
  const delayMs = RETRY_DELAYS_MINUTES[nextIndex] * 60 * 1000;
  return new Date(Date.now() + delayMs).toISOString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow scheduled (no user), admin-triggered, or external cron-secret calls
    const isCron = !!(Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET'));
    const isScheduled = req.headers.get('x-base44-scheduled-function') === 'true';
    const isAuthenticated = await base44.auth.isAuthenticated();
    if (isAuthenticated) {
      const user = await base44.auth.me();
      if (user?.role !== 'admin' && !isCron && !isScheduled) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    if (!isAuthenticated && !isCron && !isScheduled) {
      return Response.json({ error: 'Forbidden: cron-secret, scheduled, or admin required' }, { status: 403 });
    }

    const now = new Date();

    // Fetch pending failures that are due for retry
    const failures = await base44.asServiceRole.entities.NotificationDeliveryFailure.filter({
      resolved: false,
    }, '-first_failed_at', 100);

    const due = failures.filter(f => {
      if (f.retry_count >= MAX_RETRIES) return false;
      if (!f.next_retry_at) return true;
      return new Date(f.next_retry_at) <= now;
    });

    const results = { processed: 0, succeeded: 0, failed: 0, dead_lettered: 0 };

    for (const failure of due) {
      results.processed++;
      const newRetryCount = (failure.retry_count || 0) + 1;

      if (newRetryCount > MAX_RETRIES) {
        // Move to dead letter
        await base44.asServiceRole.entities.NotificationDeadLetter.create({
          source_event: failure.source_event || failure.event_type || 'unknown',
          source_entity_type: failure.source_entity_type || '',
          source_entity_id: failure.source_entity_id || '',
          recipient: failure.recipient,
          channel: failure.channel,
          provider: failure.provider,
          payload: failure.payload || {},
          failure_reason: failure.failure_reason,
          retry_count: newRetryCount,
          host_id: failure.host_id || '',
          booking_id: failure.booking_id || '',
        }).catch(() => {});

        // Create admin alert
        await base44.asServiceRole.entities.PaymentOperationalAlert.create({
          alert_type: 'notification_dead_letter',
          severity: 'warning',
          status: 'new',
          billing_context: 'system',
          title: `Notification Dead-Lettered — ${failure.channel}/${failure.provider}`,
          message: `After ${MAX_RETRIES} attempts, notification to ${failure.recipient} via ${failure.channel} failed permanently. Event: ${failure.source_event || failure.event_type}`,
          recommended_action: 'Review dead-letter queue at /admin/notification-center and manually resend or investigate provider issues.',
          requires_admin_action: true,
          source: 'notification_retry_engine',
        }).catch(() => {});

        await base44.asServiceRole.entities.NotificationDeliveryFailure.update(failure.id, {
          resolved: true,
          resolved_at: now.toISOString(),
          retry_count: newRetryCount,
        }).catch(() => {});

        results.dead_lettered++;
        continue;
      }

      // Attempt retry based on channel
      let retryResult = { ok: false, error: 'UNKNOWN_CHANNEL' };

      if (failure.channel === 'sms' && failure.payload?.body) {
        retryResult = await retrySMS(failure.recipient, failure.payload.body);
      } else if (failure.channel === 'email' && failure.payload?.subject && failure.payload?.html) {
        retryResult = await retryEmail(failure.recipient, failure.payload.subject, failure.payload.html);
      } else if (failure.channel === 'inapp' && failure.payload) {
        // Re-create in-app notification with standard fields
        try {
          await base44.asServiceRole.entities.Notification.create({
            recipient_email: failure.recipient,
            recipient_role: failure.payload.recipient_role || 'system',
            recipient_phone: failure.payload.recipient_phone || '',
            title: failure.payload.title || 'Notification',
            body: failure.payload.body || '',
            type: failure.payload.type || 'system',
            category: failure.payload.category || 'system',
            severity: failure.payload.severity || 'info',
            is_read: false,
            booking_request_id: failure.payload.booking_request_id || '',
            vehicle_id: failure.payload.vehicle_id || '',
            action_url: failure.payload.action_url || '/dashboard',
            source_function: 'retryFailedNotifications',
            metadata: { retry_attempt: failure.retry_count + 1, original_failure_id: failure.id },
          });
          retryResult = { ok: true };
        } catch (e) {
          retryResult = { ok: false, error: e.message };
        }
      }

      // Log cost for SMS retries
      if (failure.channel === 'sms' && retryResult.ok) {
        await base44.asServiceRole.entities.NotificationCost.create({
          twilio_sid: retryResult.sid || '',
          channel: 'sms',
          segment_count: 1,
          estimated_cost_usd: 0.0079,
          recipient: failure.recipient,
          event_type: failure.source_event || failure.event_type || 'retry',
          category: 'retry',
          host_id: failure.host_id || '',
          user_email: failure.recipient,
          sent_at: now.toISOString(),
        }).catch(() => {});
      }

      if (retryResult.ok) {
        await base44.asServiceRole.entities.NotificationDeliveryFailure.update(failure.id, {
          resolved: true,
          resolved_at: now.toISOString(),
          retry_count: newRetryCount,
          last_retry_at: now.toISOString(),
        }).catch(() => {});
        results.succeeded++;
      } else {
        const next = nextRetryAt(newRetryCount);
        await base44.asServiceRole.entities.NotificationDeliveryFailure.update(failure.id, {
          retry_count: newRetryCount,
          last_retry_at: now.toISOString(),
          next_retry_at: next,
          failure_reason: retryResult.error || failure.failure_reason,
        }).catch(() => {});
        results.failed++;
      }
    }

    return Response.json({ ok: true, ...results, checked_at: now.toISOString() });
  } catch (error) {
    console.error('[retryFailedNotifications]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});