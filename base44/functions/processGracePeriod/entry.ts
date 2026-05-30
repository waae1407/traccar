import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

/**
 * Payment Enforcement State Machine — authoritative payment-based starter control workflow.
 *
 * Official policy:
 *   payment failure → immediate warning + 2-hour recovery window
 *   during 2 hours → retries allowed, vehicle remains operational
 *   after 2 hours unpaid → starter interrupt only, no engine shutdown
 *   successful payment → starter restored immediately
 */

const RECOVERY_WINDOW_HOURS = 2;
const RETRY_INTERVAL_MINUTES = parseInt(Deno.env.get("PAYMENT_RECOVERY_RETRY_INTERVAL_MINUTES") || "30");
const STARTER_WARNING_MESSAGE = "Your rental payment could not be processed. Please update your payment method. Vehicle restart access will be disabled in 2 hours if payment is not successfully collected.";

async function logEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: data.actor_id || 'payment_enforcement_automation',
      actor_email: data.actor_email || 'automation@uridehub.com',
      actor_role: data.actor_role || 'automation',
      target_entity: data.target_entity || 'BookingRequest',
      target_id: data.target_id || '',
      host_id: data.host_id || '',
      booking_id: data.booking_id || '',
      vehicle_id: data.vehicle_id || '',
      customer_id: data.customer_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: data.source || 'payment_enforcement',
      user_email: data.customer_id || 'automation',
      event_title: data.summary || data.event_type,
      event_status: data.event_status || 'success',
    });
  } catch (e) {
    console.error('[AuditLog]', e.message);
  }
}

function generatePaymentDedupeKey({ sourceType = 'unknown', bookingId = '', weekNumber = '', amount = '', paidAt = '', paymentIntentId = '', externalReference = '', paymentMethod = '' }) {
  if (paymentIntentId) return `payment:stripe:${paymentIntentId}`;
  const paidDate = paidAt ? String(paidAt).slice(0, 10) : 'no-date';
  return `payment:${sourceType}:${bookingId}:week:${weekNumber}:amount:${amount}:date:${paidDate}:method:${paymentMethod || 'other'}:ref:${externalReference || 'none'}`;
}

function classifyPaymentSource({ sourceType, paymentIntentId } = {}) {
  if (sourceType) return sourceType;
  if (paymentIntentId) return 'payment_enforcement_retry';
  return 'unknown';
}

function classifyPaymentConfidence({ paymentIntentId } = {}) {
  return paymentIntentId ? 'trusted' : 'unresolved';
}

async function createPaymentAlert(base44, payload) {
  try {
    await base44.asServiceRole.functions.invoke('createPaymentOperationalAlert', payload);
  } catch (e) {
    console.error('[PaymentOperationalAlert]', e.message);
  }
}

async function authorizeScheduledGracePeriodRun(base44, body) {
  const user = await base44.auth.me().catch(() => null);
  if (user) {
    if (user.role !== 'admin') {
      return { allowed: false, response: Response.json({ error: 'Forbidden: payment enforcement is admin-only' }, { status: 403 }) };
    }
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'admin.override',
      actor_id: user.id || user.email,
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'BackendFunction',
      target_id: 'processGracePeriod',
      summary: 'Admin manually ran payment enforcement automation',
      metadata: { function_name: 'processGracePeriod', manual_admin_execution: true },
      source: 'admin_panel',
      event_status: 'warning',
    });
    return { allowed: true };
  }

  const args = body?.args || {};
  const automation = body?.automation || {};
  const isScheduler =
    automation.id === '6a0e4b345b472f10284fbced' ||
    (args.automation_id === '6a0e4b345b472f10284fbced' && args.scheduled_function === 'processGracePeriod');

  if (!isScheduler) {
    return { allowed: false, response: Response.json({ error: 'Unauthorized scheduled function caller' }, { status: 401 }) };
  }

  return { allowed: true };
}

async function resolveMarketplaceFee(base44, booking = {}) {
  const bookingSource = booking.booking_source || 'marketplace';
  let operatorMode = 'marketplace_partner';
  let fallbackUsed = true;
  let reason = 'Default marketplace fallback rate.';

  if (booking.host_id) {
    const plans = await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id: booking.host_id });
    const plan = plans[0];
    if (plan) {
      operatorMode = plan.active_mode && plan.active_mode !== 'none' ? plan.active_mode : (plan.selected_mode || plan.recommended_mode || operatorMode);
      fallbackUsed = false;
      reason = 'Resolved from OperatorPlanConfiguration.';
    }
  }

  let feeRate = 0;
  if (bookingSource === 'marketplace') {
    feeRate = operatorMode === 'hybrid_growth' ? 0.04 : operatorMode === 'fleetos_professional' ? 0 : 0.08;
  } else {
    feeRate = 0;
    reason = fallbackUsed ? 'Non-marketplace booking source uses no marketplace fee fallback.' : 'Non-marketplace booking source uses no marketplace fee.';
  }

  await logEvent(base44, {
    event_type: 'billing.fee_rate_calculated',
    target_id: booking.id || '',
    host_id: booking.host_id || '',
    booking_id: booking.id || '',
    vehicle_id: booking.vehicle_id || '',
    customer_id: booking.user_email || '',
    summary: `Marketplace fee resolved: ${(feeRate * 100).toFixed(0)}% for ${operatorMode}`,
    metadata: { host_id: booking.host_id || '', booking_id: booking.id || '', operator_mode: operatorMode, booking_source: bookingSource, fee_rate_used: feeRate, fallback_used: fallbackUsed, reason },
  });

  return { feeRate, operatorMode, bookingSource, fallbackUsed, reason };
}

async function sendSMS(to, message) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!accountSid || !authToken || !from || !to) return false;
  const body = new URLSearchParams({ To: to, From: from, Body: message });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  return res.ok;
}

async function sendEmail(base44, to, subject, body) {
  if (!to) return false;
  await base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body, from_name: "uRide Operations" });
  return true;
}

async function starterInterrupt(deviceId, disable) {
  const partnerApiKey = Deno.env.get("MOOVETRAX_PARTNER_API_KEY") || "";
  const command = disable ? "kill" : "unkill";
  const params = new URLSearchParams({ key: deviceId, ...(partnerApiKey && { partner_api_key: partnerApiKey }) });
  const url = `https://www.moovetrax.com/api/${command}?${params.toString()}`;
  console.log(`[MooveTrax] ${command.toUpperCase()} starter access only for device: ${deviceId}`);
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  console.log(`[MooveTrax] ${command} response: ${text}`);
  return { ok: res.ok, response: text };
}

async function getVehicleDevice(base44, vehicleId) {
  if (!vehicleId) return null;
  const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicleId });
  return vehicles[0]?.moovetrax_device_id || null;
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function minutesSince(date, now) {
  return (now.getTime() - date.getTime()) / (1000 * 60);
}

async function restoreAfterPayment(base44, booking, paymentIntent, grossedAmount, stripeFee, baseAmount, retryAttempt, now) {
  const nextDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextBillingDate = nextDate.toISOString().split("T")[0];
  const deviceId = await getVehicleDevice(base44, booking.vehicle_id);

  if ((booking.starter_disabled || booking.moovetrax_kill_active) && deviceId) {
    await starterInterrupt(deviceId, false);
  }

  await createPaymentAlert(base44, {
    alert_type: 'payment_recovered',
    severity: 'info',
    billing_context: 'weekly_billing',
    booking_id: booking.id,
    host_id: booking.host_id || '',
    customer_id: booking.user_id || '',
    vehicle_id: booking.vehicle_id || '',
    renter_email: booking.user_email || '',
    stripe_payment_intent_id: paymentIntent.id,
    related_entity_type: 'BookingRequest',
    related_entity_id: booking.id,
    title: 'Payment recovered',
    message: `Payment recovered for ${booking.vehicle_name || booking.id}. Starter access restored if it had been disabled.`,
    recommended_action: 'Confirm booking and payment records are healthy.',
    financial_impact_amount: grossedAmount,
    currency: paymentIntent.currency || 'usd',
    retry_attempts: retryAttempt,
    source: 'processGracePeriod'
  });

  await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
    booking_status: "active",
    payment_status: "paid",
    payment_failure_attempts: 0,
    payment_failure_reason: null,
    last_payment_failure_at: null,
    last_retry_at: null,
    payment_failure_started_at: null,
    starter_disable_scheduled_at: null,
    starter_disabled: false,
    moovetrax_kill_active: false,
    grace_period_started_at: null,
    grace_period_ends_at: null,
    suspension_triggered_at: null,
    suspended_at: null,
    next_billing_date: nextBillingDate,
  });

  await base44.asServiceRole.entities.Notification.create({
    user_email: booking.user_email,
    title: "Payment received — starter access restored",
    body: `Your payment for ${booking.vehicle_name} was processed successfully. Your rental is active and starter access has been restored. Next billing: ${nextBillingDate}.`,
    type: "payment",
    booking_request_id: booking.id,
  });

  if (booking.customer_phone) {
    await sendSMS(booking.customer_phone, `uRide: Payment received for ${booking.vehicle_name}. Your rental is active and starter access has been restored.`);
  }

  await sendEmail(
    base44,
    booking.user_email,
    `Payment Received — ${booking.vehicle_name || 'Your Rental'} Restored`,
    `Hi ${booking.customer_full_name || ""},\n\nYour rental payment has been processed successfully. Your booking is active and starter access has been restored.\n\nNext billing: ${nextBillingDate}\n\nThe uRide Team`
  );

  await logEvent(base44, {
    event_type: 'payment.succeeded',
    target_id: booking.id,
    host_id: booking.host_id || '',
    booking_id: booking.id,
    vehicle_id: booking.vehicle_id || '',
    customer_id: booking.user_email || '',
    summary: `Payment recovered for ${booking.vehicle_name || booking.id}; starter restored if disabled`,
    metadata: { payment_intent_id: paymentIntent.id, amount: baseAmount, retry_attempt: retryAttempt, next_billing_date: nextBillingDate, starter_restored: !!deviceId },
  });

  const paymentPaidAt = now.toISOString();
  const paymentWeekNumber = (booking.billing_week_number || 1) + 1;
  const sourceType = classifyPaymentSource({ paymentIntentId: paymentIntent.id });
  const paymentDedupeKey = generatePaymentDedupeKey({
    sourceType,
    bookingId: booking.id,
    weekNumber: paymentWeekNumber,
    amount: grossedAmount,
    paidAt: paymentPaidAt,
    paymentIntentId: paymentIntent.id,
    paymentMethod: 'stripe'
  });

  const paymentLog = await base44.asServiceRole.entities.PaymentLog.create({
    booking_request_id: booking.id,
    host_id: booking.host_id || '',
    customer_email: booking.user_email,
    customer_name: booking.customer_full_name || '',
    vehicle_id: booking.vehicle_id,
    vehicle_name: booking.vehicle_name || '',
    week_number: paymentWeekNumber,
    billing_period_start: now.toISOString().slice(0, 10),
    billing_period_end: nextBillingDate,
    amount: grossedAmount,
    currency: paymentIntent.currency || 'usd',
    payment_method: 'stripe',
    source_type: sourceType,
    source_confidence: classifyPaymentConfidence({ paymentIntentId: paymentIntent.id }),
    legacy_flag: false,
    external_reconcilable: true,
    dedupe_key: paymentDedupeKey,
    stripe_payment_intent_id: paymentIntent.id,
    stripe_charge_id: paymentIntent.charges?.data?.[0]?.id || '',
    stripe_customer_id: paymentIntent.customer || booking.stripe_customer_id || '',
    stripe_payment_method_id: paymentIntent.payment_method || booking.stripe_payment_method_id || '',
    stripe_balance_transaction_id: typeof paymentIntent.charges?.data?.[0]?.balance_transaction === 'string' ? paymentIntent.charges.data[0].balance_transaction : paymentIntent.charges?.data?.[0]?.balance_transaction?.id || '',
    stripe_receipt_url: paymentIntent.charges?.data?.[0]?.receipt_url || '',
    receipt_url: paymentIntent.charges?.data?.[0]?.receipt_url || '',
    status: 'paid',
    recorded_by: 'payment_enforcement_automation',
    paid_at: paymentPaidAt,
  });

  await logEvent(base44, {
    event_type: 'payment.logged',
    target_id: paymentLog.id,
    host_id: booking.host_id || '',
    booking_id: booking.id,
    vehicle_id: booking.vehicle_id || '',
    customer_id: booking.user_email || '',
    summary: `PaymentLog created for payment enforcement recovery week ${paymentWeekNumber}`,
    metadata: { payment_log_id: paymentLog.id, dedupe_key: paymentDedupeKey, source_type: sourceType },
  });

  if (booking.host_id) {
    const recHosts = await base44.asServiceRole.entities.Host.filter({ id: booking.host_id });
    const recHost = recHosts[0];
    if (recHost?.stripe_onboarding_complete && recHost?.stripe_account_id) {
      const { feeRate: commissionRate } = await resolveMarketplaceFee(base44, { ...booking, host_id: recHost.id });
      const platformFee = Math.round(baseAmount * commissionRate * 100) / 100;
      const hostAmount = Math.round((baseAmount - platformFee) * 100) / 100;
      const recTransfer = await new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" }).transfers.create({
        amount: Math.round(hostAmount * 100),
        currency: "usd",
        destination: recHost.stripe_account_id,
        description: `uRide payment recovery — ${booking.vehicle_name}`,
        metadata: { booking_id: booking.id, host_id: recHost.id },
      });
      await base44.asServiceRole.entities.HostPayout.create({
        host_id: recHost.id,
        host_email: recHost.email,
        host_name: recHost.full_name,
        booking_request_id: booking.id,
        vehicle_name: booking.vehicle_name || "",
        gross_booking_amount: grossedAmount,
        stripe_fee_amount: stripeFee,
        uride_platform_fee_amount: platformFee,
        uride_platform_fee_rate: commissionRate,
        net_host_payout: hostAmount,
        net_payout: hostAmount,
        stripe_transfer_id: recTransfer.id,
        status: "paid",
        payout_date: now.toISOString().split('T')[0],
      });
      console.log(`[PaymentEnforcement] ✓ Host transfer ${recTransfer.id} — $${hostAmount} to ${recHost.stripe_account_id}`);
    }
  }
}

async function disableStarterAfterWindow(base44, booking, now) {
  const deviceId = await getVehicleDevice(base44, booking.vehicle_id);
  if (deviceId && !(booking.starter_disabled || booking.moovetrax_kill_active)) {
    await starterInterrupt(deviceId, true);
  }

  await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
    booking_status: "suspended",
    suspension_triggered_at: now.toISOString(),
    suspended_at: now.toISOString(),
    starter_disabled: true,
    moovetrax_kill_active: true,
  });

  await createPaymentAlert(base44, {
    alert_type: 'weekly_billing_failed',
    severity: 'critical',
    billing_context: 'weekly_billing',
    booking_id: booking.id,
    host_id: booking.host_id || '',
    customer_id: booking.user_id || '',
    vehicle_id: booking.vehicle_id || '',
    renter_email: booking.user_email || '',
    related_entity_type: 'BookingRequest',
    related_entity_id: booking.id,
    title: 'Starter access disabled after unpaid recovery window',
    message: `Payment remains failed after the 2-hour recovery window for ${booking.vehicle_name || booking.id}. Starter interrupt was sent only; no engine shutdown command was issued.`,
    recommended_action: 'Monitor payment recovery. Restore starter immediately after successful payment or approved admin override.',
    financial_impact_amount: booking.weekly_rate || 0,
    currency: 'usd',
    retry_attempts: booking.payment_failure_attempts || 0,
    source: 'processGracePeriod'
  });

  await base44.asServiceRole.entities.Notification.create({
    user_email: booking.user_email,
    title: "Starter access disabled — payment required",
    body: `Your payment for ${booking.vehicle_name} remains unresolved after 2 hours. Vehicle restart access has been disabled. This does not shut down a running engine. Please update your payment method to restore access.`,
    type: "payment",
    booking_request_id: booking.id,
  });

  if (booking.customer_phone) {
    await sendSMS(booking.customer_phone, `uRide: Payment is still unresolved after 2 hours. Starter access for ${booking.vehicle_name} has been disabled. This does not shut down a running engine. Pay now to restore.`);
  }

  await sendEmail(
    base44,
    booking.user_email,
    `Starter Access Disabled — Payment Required`,
    `Hi ${booking.customer_full_name || ""},\n\nYour rental payment is still unresolved after the 2-hour recovery window. Vehicle restart access for ${booking.vehicle_name || 'your rental'} has been disabled.\n\nThis is a starter interrupt only and does not shut down a running engine.\n\nPlease update your payment method to restore starter access.\n\nThe uRide Team`
  );

  await logEvent(base44, {
    event_type: 'payment.starter_disabled',
    target_id: booking.id,
    host_id: booking.host_id || '',
    booking_id: booking.id,
    vehicle_id: booking.vehicle_id || '',
    customer_id: booking.user_email || '',
    summary: `Starter access disabled after 2-hour failed-payment recovery window for ${booking.vehicle_name || booking.id}`,
    metadata: {
      starter_disable_only: true,
      no_engine_shutdown: true,
      scheduled_at: booking.starter_disable_scheduled_at,
      device_command_sent: !!deviceId,
      authoritative_workflow: 'processGracePeriod'
    },
    event_status: 'warning',
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const authorization = await authorizeScheduledGracePeriodRun(base44, body);
    if (!authorization.allowed) return authorization.response;
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });
    const now = new Date();

    const failedBookings = await base44.asServiceRole.entities.BookingRequest.filter({ payment_status: "failed" });
    const enforcementBookings = failedBookings.filter(b =>
      ["payment_due", "suspended"].includes(b.booking_status) &&
      b.stripe_customer_id &&
      b.stripe_payment_method_id
    );

    console.log(`[PaymentEnforcement] Processing ${enforcementBookings.length} failed-payment bookings`);

    const results = { disabled: 0, recovered: 0, retried: 0, skipped: 0, initialized: 0, errors: 0 };

    for (const booking of enforcementBookings) {
      let failureStartedAt = booking.payment_failure_started_at ? new Date(booking.payment_failure_started_at) : null;
      let disableScheduledAt = booking.starter_disable_scheduled_at ? new Date(booking.starter_disable_scheduled_at) : null;

      if (!failureStartedAt || !disableScheduledAt) {
        failureStartedAt = booking.last_payment_failure_at ? new Date(booking.last_payment_failure_at) : now;
        disableScheduledAt = addHours(failureStartedAt, RECOVERY_WINDOW_HOURS);
        await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
          payment_failure_started_at: failureStartedAt.toISOString(),
          starter_disable_scheduled_at: disableScheduledAt.toISOString(),
          starter_disabled: !!booking.starter_disabled,
          grace_period_started_at: null,
          grace_period_ends_at: null,
        });
        results.initialized++;
      }

      const isPastDisableTime = now >= disableScheduledAt;

      if (booking.booking_status === "payment_due" && isPastDisableTime && !(booking.starter_disabled || booking.moovetrax_kill_active)) {
        await disableStarterAfterWindow(base44, booking, now);
        results.disabled++;
        continue;
      }

      const lastRetryAt = booking.last_retry_at ? new Date(booking.last_retry_at) : null;
      if (lastRetryAt && minutesSince(lastRetryAt, now) < RETRY_INTERVAL_MINUTES) {
        console.log(`[PaymentEnforcement] Booking ${booking.id} — retry not due yet`);
        results.skipped++;
        continue;
      }

      try {
        const retryAttempt = (booking.payment_failure_attempts || 0) + 1;
        const baseAmount = booking.weekly_rate || 0;
        const grossedAmount = Math.round(((baseAmount + 0.30) / (1 - 0.029)) * 100) / 100;
        const stripeFee = Math.round((grossedAmount - baseAmount) * 100) / 100;

        console.log(`[PaymentEnforcement] Retry ${retryAttempt} for ${booking.id} — base=$${baseAmount} gross=$${grossedAmount}`);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(grossedAmount * 100),
          currency: "usd",
          customer: booking.stripe_customer_id,
          payment_method: booking.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: `uRide payment recovery retry ${retryAttempt} — ${booking.vehicle_name}`,
          metadata: { booking_request_id: booking.id, payment_recovery_retry: `${retryAttempt}`, billing_context: 'rental_marketplace_payment' },
        });

        if (paymentIntent.status === "succeeded") {
          await restoreAfterPayment(base44, booking, paymentIntent, grossedAmount, stripeFee, baseAmount, retryAttempt, now);
          results.recovered++;
        }
      } catch (retryErr) {
        const newAttempts = (booking.payment_failure_attempts || 0) + 1;
        await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
          payment_failure_attempts: newAttempts,
          payment_failure_reason: retryErr.message,
          last_retry_at: now.toISOString(),
          booking_status: booking.booking_status === "suspended" ? "suspended" : "payment_due",
          starter_disabled: !!booking.starter_disabled,
          moovetrax_kill_active: !!booking.moovetrax_kill_active,
        });

        await createPaymentAlert(base44, {
          alert_type: 'payment_retry_scheduled',
          severity: now >= disableScheduledAt ? 'critical' : 'warning',
          billing_context: 'weekly_billing',
          booking_id: booking.id,
          host_id: booking.host_id || '',
          customer_id: booking.user_id || '',
          vehicle_id: booking.vehicle_id || '',
          renter_email: booking.user_email || '',
          related_entity_type: 'BookingRequest',
          related_entity_id: booking.id,
          title: 'Payment recovery retry failed',
          message: `Payment recovery retry ${newAttempts} failed for ${booking.vehicle_name || booking.id}: ${retryErr.message}`,
          recommended_action: 'Customer still has until the scheduled starter-disable time to resolve payment unless the window has already expired.',
          financial_impact_amount: booking.weekly_rate || 0,
          currency: 'usd',
          retry_attempts: newAttempts,
          last_retry_result: retryErr.message,
          next_retry_at: new Date(now.getTime() + RETRY_INTERVAL_MINUTES * 60 * 1000).toISOString(),
          source: 'processGracePeriod'
        });

        await logEvent(base44, {
          event_type: 'payment.retry_failed',
          target_id: booking.id,
          host_id: booking.host_id || '',
          booking_id: booking.id,
          vehicle_id: booking.vehicle_id || '',
          customer_id: booking.user_email || '',
          summary: `Payment recovery retry ${newAttempts} failed for ${booking.vehicle_name || booking.id}`,
          metadata: {
            attempt: newAttempts,
            error: retryErr.message,
            starter_disable_scheduled_at: disableScheduledAt.toISOString(),
            starter_disabled: !!booking.starter_disabled,
          },
          event_status: 'error',
        });

        results.retried++;
      }
    }

    console.log(`[PaymentEnforcement] Complete — disabled:${results.disabled} recovered:${results.recovered} retried:${results.retried} skipped:${results.skipped}`);
    return Response.json({ ok: true, ...results, total_failed_payment_bookings: enforcementBookings.length, policy: '2-hour starter-disable recovery window' });
  } catch (error) {
    console.error("[PaymentEnforcement] Fatal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});