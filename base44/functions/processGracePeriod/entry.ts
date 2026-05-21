import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

/**
 * Grace Period State Machine — runs daily via scheduled automation.
 *
 * Flow:
 *   payment_due (0-24h) → retry attempt 1 at 24h
 *   grace_period (24-72h) → retry attempt 2 at 48h, attempt 3 at 72h
 *   grace period expires OR max attempts → suspended + GPS kill
 *   payment recovered at any point → active + GPS restore
 *
 * Does NOT conflict with retryFailedPayments (which is guarded to skip payment_due/grace_period bookings).
 */

const GRACE_PERIOD_HOURS = parseInt(Deno.env.get("GRACE_PERIOD_HOURS") || "72");
const MAX_RETRY_ATTEMPTS = parseInt(Deno.env.get("MAX_RETRY_ATTEMPTS") || "3");
const RETRY_INTERVAL_HOURS = parseInt(Deno.env.get("RETRY_INTERVAL_HOURS") || "24");

async function logEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: 'grace_period_automation',
      actor_email: 'automation@uridehub.com',
      actor_role: 'automation',
      target_entity: 'BookingRequest',
      target_id: data.target_id || '',
      host_id: data.host_id || '',
      booking_id: data.booking_id || '',
      vehicle_id: data.vehicle_id || '',
      customer_id: data.customer_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: 'automation',
      user_email: data.customer_id || 'automation',
      event_title: data.summary || data.event_type,
      event_status: data.event_status || 'success',
    });
  } catch (e) {
    console.error('[AuditLog]', e.message);
  }
}

async function sendSMS(to, message) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!accountSid || !authToken || !from || !to) return;
  const body = new URLSearchParams({ To: to, From: from, Body: message });
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
}

async function moovetraxKillSwitch(deviceId, enable) {
  const partnerApiKey = Deno.env.get("MOOVETRAX_PARTNER_API_KEY") || "";
  const command = enable ? "kill" : "unkill";
  const params = new URLSearchParams({ key: deviceId, ...(partnerApiKey && { partner_api_key: partnerApiKey }) });
  const url = `https://www.moovetrax.com/api/${command}?${params.toString()}`;
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  console.log(`[MooveTrax] ${command} device ${deviceId}: ${text}`);
  return { ok: res.ok, response: text };
}

async function getVehicleDevice(base44, vehicleId) {
  if (!vehicleId) return null;
  const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicleId });
  return vehicles[0]?.moovetrax_device_id || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });
    const now = new Date();

    // Find all bookings in grace period states
    const allFailed = await base44.asServiceRole.entities.BookingRequest.filter({
      payment_status: "failed",
    });

    const gracePeriodBookings = allFailed.filter(b =>
      ["payment_due", "grace_period"].includes(b.booking_status) &&
      b.stripe_customer_id &&
      b.stripe_payment_method_id
    );

    console.log(`[GracePeriod] Processing ${gracePeriodBookings.length} bookings in grace period states`);

    const results = { suspended: 0, recovered: 0, retried: 0, skipped: 0, errors: 0 };
    const suspendedList = [];
    const recoveredList = [];

    for (const booking of gracePeriodBookings) {
      const graceEndsAt = booking.grace_period_ends_at ? new Date(booking.grace_period_ends_at) : null;
      const lastRetryAt = booking.last_retry_at ? new Date(booking.last_retry_at) : null;
      const attempts = booking.payment_failure_attempts || 0;

      // ── SUSPENSION CHECK ──────────────────────────────────────────
      const graceExpired = graceEndsAt && now > graceEndsAt;
      const maxAttemptsReached = attempts >= MAX_RETRY_ATTEMPTS;

      if (graceExpired || maxAttemptsReached) {
        console.log(`[GracePeriod] Suspending ${booking.id} — expired=${graceExpired}, attempts=${attempts}/${MAX_RETRY_ATTEMPTS}`);

        await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
          booking_status: "suspended",
          suspension_triggered_at: now.toISOString(),
          moovetrax_kill_active: true,
        });

        // GPS kill on suspension (first and only kill in the new flow)
        const deviceId = await getVehicleDevice(base44, booking.vehicle_id);
        if (deviceId) {
          await moovetraxKillSwitch(deviceId, true);
        }

        // Customer notifications
        await base44.asServiceRole.entities.Notification.create({
          user_email: booking.user_email,
          title: "🚨 Rental Suspended — Immediate Action Required",
          body: `Your rental for ${booking.vehicle_name} has been suspended after ${attempts} failed payment attempts. Your vehicle has been remotely disabled. Please contact support or update your payment method immediately.`,
          type: "payment",
          booking_request_id: booking.id,
        });

        if (booking.customer_phone) {
          await sendSMS(booking.customer_phone,
            `🚨 uRide URGENT: Your ${booking.vehicle_name} has been SUSPENDED after ${attempts} failed payments. Your vehicle is disabled. Open the app now to resolve.`
          );
        }

        await base44.asServiceRole.integrations.Core.SendEmail({
          to: booking.user_email,
          subject: `🚨 URGENT: Your ${booking.vehicle_name} Rental Has Been Suspended`,
          body: `Hi ${booking.customer_full_name || ""},\n\nYour rental for ${booking.vehicle_name} has been suspended after ${attempts} failed payment attempts.\n\n⛔ Your vehicle has been remotely disabled.\n\nTo restore access immediately:\n1. Open the uRide app\n2. Update your payment method\n3. Contact support if needed\n\nThe uRide Team`,
        });

        await logEvent(base44, {
          event_type: 'booking.suspended',
          target_id: booking.id,
          host_id: booking.host_id || '',
          booking_id: booking.id,
          vehicle_id: booking.vehicle_id || '',
          customer_id: booking.user_email || '',
          summary: `SUSPENDED: ${booking.vehicle_name} — ${attempts} payment failures — ${graceExpired ? 'grace period expired' : 'max attempts reached'}`,
          metadata: {
            attempts,
            max_attempts: MAX_RETRY_ATTEMPTS,
            grace_expired: graceExpired,
            grace_ends_at: booking.grace_period_ends_at,
            device_killed: !!deviceId,
          },
          event_status: 'warning',
        });

        suspendedList.push({ email: booking.user_email, vehicle: booking.vehicle_name });
        results.suspended++;
        continue;
      }

      // ── RETRY TIMING CHECK ────────────────────────────────────────
      const hoursSinceRetry = lastRetryAt
        ? (now.getTime() - lastRetryAt.getTime()) / (1000 * 60 * 60)
        : 999;

      if (hoursSinceRetry < RETRY_INTERVAL_HOURS) {
        console.log(`[GracePeriod] Booking ${booking.id} — next retry in ${(RETRY_INTERVAL_HOURS - hoursSinceRetry).toFixed(1)}h`);
        results.skipped++;
        continue;
      }

      // ── PAYMENT RETRY ─────────────────────────────────────────────
      try {
        const amount = booking.weekly_rate || 0;
        console.log(`[GracePeriod] Retry ${attempts + 1}/${MAX_RETRY_ATTEMPTS} for ${booking.id} — $${amount}`);

        const pi = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: "usd",
          customer: booking.stripe_customer_id,
          payment_method: booking.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: `uRide grace period retry ${attempts + 1}/${MAX_RETRY_ATTEMPTS} — ${booking.vehicle_name}`,
          metadata: { booking_request_id: booking.id, grace_period_retry: `${attempts + 1}` },
        });

        if (pi.status === "succeeded") {
          // ── PAYMENT RECOVERED ─────────────────────────────────────
          const nextDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          const nextBillingDate = nextDate.toISOString().split("T")[0];

          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            booking_status: "active",
            payment_status: "paid",
            payment_failure_attempts: 0,
            payment_failure_reason: null,
            moovetrax_kill_active: false,
            grace_period_started_at: null,
            grace_period_ends_at: null,
            last_retry_at: null,
            suspension_triggered_at: null,
            next_billing_date: nextBillingDate,
          });

          // Unkill if vehicle was killed during a previous retry
          if (booking.moovetrax_kill_active) {
            const deviceId = await getVehicleDevice(base44, booking.vehicle_id);
            if (deviceId) {
              await moovetraxKillSwitch(deviceId, false);
            }
          }

          await base44.asServiceRole.entities.Notification.create({
            user_email: booking.user_email,
            title: "✅ Payment Recovered — Rental Fully Restored",
            body: `Great news! Your payment of $${amount} for ${booking.vehicle_name} was processed. Your rental is fully active again. Next billing: ${nextBillingDate}.`,
            type: "payment",
            booking_request_id: booking.id,
          });

          if (booking.customer_phone) {
            await sendSMS(booking.customer_phone,
              `✅ uRide: Payment received for ${booking.vehicle_name}! Your rental is restored. Next billing: ${nextBillingDate}.`
            );
          }

          await logEvent(base44, {
            event_type: 'payment.succeeded',
            target_id: booking.id,
            host_id: booking.host_id || '',
            booking_id: booking.id,
            vehicle_id: booking.vehicle_id || '',
            customer_id: booking.user_email || '',
            summary: `RECOVERED: Payment on grace period retry ${attempts + 1} for ${booking.vehicle_name} — $${amount}`,
            metadata: { payment_intent_id: pi.id, amount, retry_attempt: attempts + 1, next_billing_date: nextBillingDate },
          });

          recoveredList.push({ email: booking.user_email, vehicle: booking.vehicle_name });
          results.recovered++;
        }
      } catch (retryErr) {
        // ── RETRY FAILED ──────────────────────────────────────────────
        const newAttempts = attempts + 1;
        const enterGracePeriod = newAttempts >= 2; // move to grace_period status after 2nd failure

        await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
          payment_failure_attempts: newAttempts,
          payment_failure_reason: retryErr.message,
          last_retry_at: now.toISOString(),
          booking_status: enterGracePeriod ? "grace_period" : "payment_due",
        });

        // Customer notification
        const retriesLeft = MAX_RETRY_ATTEMPTS - newAttempts;
        await base44.asServiceRole.entities.Notification.create({
          user_email: booking.user_email,
          title: `⚠️ Payment Retry ${newAttempts}/${MAX_RETRY_ATTEMPTS} Failed`,
          body: `Payment retry ${newAttempts}/${MAX_RETRY_ATTEMPTS} for ${booking.vehicle_name} failed. ${retriesLeft > 0 ? `${retriesLeft} retry attempt(s) remaining.` : "Final attempt failed — suspension imminent."} Update your payment method now to avoid suspension.`,
          type: "payment",
          booking_request_id: booking.id,
        });

        await logEvent(base44, {
          event_type: 'payment.failed',
          target_id: booking.id,
          host_id: booking.host_id || '',
          booking_id: booking.id,
          vehicle_id: booking.vehicle_id || '',
          customer_id: booking.user_email || '',
          summary: `Grace period retry ${newAttempts}/${MAX_RETRY_ATTEMPTS} FAILED for ${booking.vehicle_name} — ${retriesLeft} attempts left`,
          metadata: {
            attempt: newAttempts,
            max_attempts: MAX_RETRY_ATTEMPTS,
            retries_left: retriesLeft,
            error: retryErr.message,
            grace_ends_at: booking.grace_period_ends_at,
          },
          event_status: 'error',
        });

        console.error(`[GracePeriod] Retry ${newAttempts} failed for ${booking.id}:`, retryErr.message);
        results.retried++;
      }
    }

    // ── ADMIN SUMMARY ALERT ───────────────────────────────────────────
    if (results.suspended > 0 || results.recovered > 0) {
      const adminEmail = Deno.env.get("ADMIN_ALERT_EMAIL") || "admin@uridehub.com";
      let summaryBody = `Grace Period Automation — Daily Summary\n\n`;
      summaryBody += `📊 Total in grace period: ${gracePeriodBookings.length}\n`;
      summaryBody += `🚨 Suspended today: ${results.suspended}\n`;
      summaryBody += `✅ Recovered today: ${results.recovered}\n`;
      summaryBody += `🔄 Retried today: ${results.retried}\n\n`;

      if (suspendedList.length > 0) {
        summaryBody += `SUSPENDED ACCOUNTS:\n`;
        suspendedList.forEach(s => { summaryBody += `• ${s.email} — ${s.vehicle}\n`; });
        summaryBody += `\n`;
      }
      if (recoveredList.length > 0) {
        summaryBody += `RECOVERED ACCOUNTS:\n`;
        recoveredList.forEach(r => { summaryBody += `• ${r.email} — ${r.vehicle}\n`; });
      }
      summaryBody += `\nView full details: /admin/operational-alerts`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: adminEmail,
        subject: `[uRide] Grace Period Report — ${results.suspended} suspended, ${results.recovered} recovered`,
        body: summaryBody,
        from_name: "uRide Operations",
      });
    }

    console.log(`[GracePeriod] Complete — suspended:${results.suspended} recovered:${results.recovered} retried:${results.retried} skipped:${results.skipped}`);
    return Response.json({ ok: true, ...results, total_in_grace: gracePeriodBookings.length });
  } catch (error) {
    console.error("[GracePeriod] Fatal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});