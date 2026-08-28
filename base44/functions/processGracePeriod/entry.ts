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

function getRecoveryWindowHours() {
  const raw = Deno.env.toObject().PAYMENT_RECOVERY_WINDOW_HOURS;
  const parsed = parseInt(raw || '24', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn('[PaymentEnforcement] PAYMENT_RECOVERY_WINDOW_HOURS invalid; defaulting to 24 hours');
    return 24;
  }
  return parsed;
}

function getRetryIntervalMinutes() {
  const rawValue = Deno.env.toObject().PAYMENT_RECOVERY_RETRY_INTERVAL_MINUTES;
  if (!rawValue) {
    console.warn('[PaymentEnforcement] PAYMENT_RECOVERY_RETRY_INTERVAL_MINUTES missing; defaulting to 480 minutes (8 hours)');
    return 480;
  }
  const parsed = parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn('[PaymentEnforcement] PAYMENT_RECOVERY_RETRY_INTERVAL_MINUTES invalid; defaulting to 480 minutes (8 hours)');
    return 480;
  }
  return parsed;
}

const RECOVERY_WINDOW_HOURS = getRecoveryWindowHours();
const RETRY_INTERVAL_MINUTES = getRetryIntervalMinutes();
const STARTER_WARNING_MESSAGE = `Your payment failed. Please update your payment method or contact support. Vehicle access may be restricted after ${RECOVERY_WINDOW_HOURS} hours if payment is not resolved.`;

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

async function resolveCommerceAndPlan(base44, hostId) {
  if (!hostId) return { commerce: null, plan: null };
  const [profiles, plans] = await Promise.all([
    base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id: hostId }, '-updated_date', 1),
    base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id: hostId }, '-updated_date', 1),
  ]);
  return { commerce: profiles?.[0] || null, plan: plans?.[0] || null };
}

function isFleetOSProfile(commerce, plan) {
  return commerce?.plan_type === 'fleetos_professional' || plan?.active_mode === 'fleetos_professional' || plan?.selected_mode === 'fleetos_professional';
}

async function createFleetOSPaymentAlert(base44, booking, reason, source = 'processGracePeriod') {
  await createPaymentAlert(base44, {
    alert_type: 'fleetos_manual_payment_required',
    severity: 'critical',
    billing_context: 'fleetos_payment_recovery',
    booking_id: booking.id,
    host_id: booking.host_id || '',
    customer_id: booking.user_id || '',
    vehicle_id: booking.vehicle_id || '',
    renter_email: booking.user_email || '',
    related_entity_type: 'BookingRequest',
    related_entity_id: booking.id,
    title: 'FleetOS payment recovery skipped',
    message: reason,
    recommended_action: 'Collect payment through host-owned payment process or connect host Stripe. uRide Stripe was not used.',
    financial_impact_amount: booking.weekly_rate || 0,
    currency: 'usd',
    source
  });
}

async function applyReceivableOffset(base44, hostId, amount, now) {
  const receivables = await base44.asServiceRole.entities.HostReceivable.filter({ host_id: hostId });
  let remainingOffset = Math.max(0, amount);
  let totalOffset = 0;
  for (const rec of receivables.filter((r) => ['open', 'partially_recovered'].includes(r.status) && r.offset_from_future_payouts !== false && (r.remaining_amount || 0) > 0)) {
    if (remainingOffset <= 0) break;
    const offset = Math.min(remainingOffset, rec.remaining_amount || 0);
    const newRemaining = Math.round(((rec.remaining_amount || 0) - offset) * 100) / 100;
    const recovered = Math.round(((rec.recovered_amount || 0) + offset) * 100) / 100;
    await base44.asServiceRole.entities.HostReceivable.update(rec.id, {
      remaining_amount: newRemaining,
      recovered_amount: recovered,
      status: newRemaining <= 0 ? 'recovered' : 'partially_recovered',
      last_recovery_at: now.toISOString(),
      audit_log: [...(rec.audit_log || []), { action: 'future_payout_offset', amount: offset, changed_at: now.toISOString(), note: 'Automatically offset from host payout.' }]
    });
    totalOffset += offset;
    remainingOffset -= offset;
  }
  return Math.round(totalOffset * 100) / 100;
}

async function authorizeScheduledGracePeriodRun(base44, body, req) {
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

  // External cron (GitHub Actions) — shared secret header
  const isCronBilling = !!(Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET'));
  if (isCronBilling) return { allowed: true };

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
    feeRate = operatorMode === 'hybrid_growth' ? 0.05 : operatorMode === 'fleetos_professional' ? 0 : 0.08;
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

async function starterInterrupt(base44, booking, disable) {
  const commandType = disable ? 'disable_starter' : 'restore_starter';
  const response = await base44.asServiceRole.functions.invoke('sendTelematicsCommand', {
    vehicle_id: booking.vehicle_id,
    booking_id: booking.id,
    command_type: commandType,
    service_context: 'payment_enforcement',
    source: 'processGracePeriod',
    reason: disable ? 'Payment enforcement: failed payment recovery window expired.' : 'Payment enforcement: payment recovered, restoring starter access.',
    confirm_starter_command: true
  });
  return { ok: true, response: response.data };
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

function hasStructuredClosureControl(booking) {
  const closedStatuses = ['cancelled', 'completed', 'closed', 'superseded', 'stale', 'duplicate', 'replaced', 'manually_closed'];
  const closureReasons = ['superseded', 'stale_booking', 'duplicate_booking', 'replaced_booking', 'manually_closed', 'auto_cancelled'];
  return booking.is_superseded === true ||
    !!booking.superseded_by_booking_id ||
    closedStatuses.includes(String(booking.booking_status || '').trim()) ||
    closureReasons.includes(String(booking.closure_reason || '').trim()) ||
    booking.clean_return_status === 'approved_clean' ||
    ['complete', 'completed', 'closed'].includes(String(booking.return_status || '').trim());
}

function isLongExpiredRental(booking, now) {
  if (!booking.end_date) return false;
  const endDate = new Date(`${booking.end_date}T23:59:59.999Z`);
  const daysExpired = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysExpired > 14;
}

function isEligibleForPaymentRecovery(booking, now) {
  if (!["payment_due", "suspended"].includes(booking.booking_status)) return false;
  if (booking.payment_status !== "failed") return false;
  if (hasStructuredClosureControl(booking)) return false;
  if (isLongExpiredRental(booking, now)) return false;
  if (!booking.vehicle_id || !booking.user_id) return false;
  if (!booking.stripe_customer_id || !booking.stripe_payment_method_id) return false;
  const disableScheduledAt = booking.starter_disable_scheduled_at ? new Date(booking.starter_disable_scheduled_at) : null;
  if (booking.booking_status === "suspended" && disableScheduledAt) {
    const daysPastWindow = (now.getTime() - disableScheduledAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysPastWindow > 14) return false;
  }
  return true;
}

function friendlyPaymentRetryMessage(booking, retryAttempt, errorMessage) {
  if (/No such PaymentMethod/i.test(String(errorMessage || ''))) {
    return `Payment recovery retry ${retryAttempt} failed for ${booking.vehicle_name || booking.id}: Payment method unavailable. This may be an old or disconnected payment method. Review booking before retrying.`;
  }
  return `Payment recovery retry ${retryAttempt} failed for ${booking.vehicle_name || booking.id}: ${errorMessage}`;
}

async function restoreAfterPayment(base44, booking, paymentIntent, grossedAmount, stripeFee, baseAmount, retryAttempt, now, skipPayout = false) {
  const nextDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextBillingDate = nextDate.toISOString().split("T")[0];
  const deviceId = await getVehicleDevice(base44, booking.vehicle_id);

  if ((booking.starter_disabled || booking.moovetrax_kill_active) && deviceId) {
    await starterInterrupt(base44, booking, false);
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
    rental_lifecycle_phase: "active",
    payment_failure_attempts: 0,
    payment_failure_reason: null,
    last_payment_failure_at: null,
    last_retry_at: null,
    payment_failure_started_at: null,
    starter_disable_scheduled_at: null,
    starter_disabled: false,
    moovetrax_kill_active: false,
    starter_disable_pending: false,
    final_reminder_sent: false,
    grace_period_started_at: null,
    grace_period_ends_at: null,
    suspension_triggered_at: null,
    suspended_at: null,
    next_billing_date: nextBillingDate,
  });

  // DELEGATE TO CENTRAL ROUTER for payment recovery notification
  await base44.asServiceRole.functions.invoke('routePlatformNotification', {
    event_type: 'payment_recovered',
    severity: 'info',
    category: 'payments',
    title: "Payment received — starter access restored",
    message: `Your payment for ${booking.vehicle_name} was processed successfully. Your rental is active and starter access has been restored. Next billing: ${nextBillingDate}.`,
    booking_id: booking.id,
    customer_id: booking.user_id,
    action_url: '/my-bookings',
    metadata: { next_billing_date: nextBillingDate, starter_restored: true },
  }).catch(e => console.error('[GracePeriod] recovery notification failed:', e.message));

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

  if (booking.host_id && !skipPayout) {
    const recHosts = await base44.asServiceRole.entities.Host.filter({ id: booking.host_id });
    const recHost = recHosts[0];
    if (recHost?.stripe_onboarding_complete && recHost?.stripe_account_id) {
      const { feeRate: commissionRate } = await resolveMarketplaceFee(base44, { ...booking, host_id: recHost.id });
      const platformFee = Math.round(baseAmount * commissionRate * 100) / 100;
      const receivableOffset = await applyReceivableOffset(base44, recHost.id, Math.max(0, baseAmount - platformFee), now);
      const hostAmount = Math.round((baseAmount - platformFee - receivableOffset) * 100) / 100;
      const recTransfer = hostAmount > 0 ? await new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" }).transfers.create({
        amount: Math.round(hostAmount * 100),
        currency: "usd",
        destination: recHost.stripe_account_id,
        description: `uRide payment recovery — ${booking.vehicle_name}`,
        metadata: { booking_id: booking.id, host_id: recHost.id, payment_intent_id: paymentIntent.id },
      }) : { id: '' };
      await base44.asServiceRole.entities.HostPayout.create({
        host_id: recHost.id,
        host_email: recHost.email,
        host_name: recHost.full_name,
        booking_request_id: booking.id,
        vehicle_name: booking.vehicle_name || "",
        period_start: now.toISOString().slice(0, 10),
        period_end: nextBillingDate,
        gross_booking_amount: grossedAmount,
        stripe_fee_amount: stripeFee,
        uride_platform_fee_amount: platformFee,
        uride_platform_fee_rate: commissionRate,
        receivable_offset_amount: receivableOffset,
        net_host_payout: hostAmount,
        net_payout: hostAmount,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_transfer_id: recTransfer.id,
        status: "paid",
        payout_date: now.toISOString().split('T')[0],
      });
      console.log(`[PaymentEnforcement] ✓ Host transfer ${recTransfer.id} — $${hostAmount} to ${recHost.stripe_account_id}`);
    }
  }
}

async function checkVehicleSafeForStarterDisable(base44, vehicleId) {
  if (!vehicleId) return { safe: true, reason: 'no_vehicle_id' };
  const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ vehicle_id: vehicleId });
  const device = devices[0];
  if (!device) return { safe: true, reason: 'no_device', has_device: false };

  const ignition = device.ignition_status || device.last_ignition_status;
  const speed = device.speed || device.last_speed || 0;
  const motion = device.motion_status || device.last_motion_status || '';
  const online = device.online_status;

  // If we can confirm ignition is OFF or vehicle is parked/stopped at speed 0 — safe to disable
  if (ignition === 'off' || ignition === 'OFF' || ignition === false) {
    return { safe: true, reason: 'ignition_off', has_device: true };
  }
  if (Number(speed) === 0 && ['stopped', 'parked', 'idle'].includes(String(motion).toLowerCase())) {
    return { safe: true, reason: 'speed_zero_parked', has_device: true };
  }
  // If device is offline and we have no recent telemetry — treat as safe (starter interrupt only)
  if (online === 'offline') {
    return { safe: true, reason: 'device_offline_no_active_trip', has_device: true };
  }
  // Vehicle appears to be running or moving — do NOT disable
  if (ignition === 'on' || ignition === 'ON' || ignition === true || Number(speed) > 0) {
    return { safe: false, reason: 'vehicle_appears_running', has_device: true, ignition, speed, motion };
  }
  // Unknown state — treat as safe (starter interrupt only, not engine kill)
  return { safe: true, reason: 'state_unknown_treat_as_safe', has_device: true };
}

async function disableStarterAfterWindow(base44, booking, now) {
  const deviceId = await getVehicleDevice(base44, booking.vehicle_id);

  // No device — do NOT set hardware flags, just suspend and log
  if (!deviceId) {
    await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
      booking_status: 'suspended',
      suspension_triggered_at: now.toISOString(),
      suspended_at: now.toISOString(),
      starter_disabled: false,
      moovetrax_kill_active: false,
    });

    await logEvent(base44, {
      event_type: 'payment.no_device_starter_disable_not_sent',
      target_id: booking.id,
      host_id: booking.host_id || '',
      booking_id: booking.id,
      vehicle_id: booking.vehicle_id || '',
      customer_id: booking.user_email || '',
      summary: `no_telematics_device_starter_disable_not_sent — booking ${booking.id} suspended (financial status only)`,
      metadata: { booking_status: 'suspended', device_command_sent: false, no_device: true },
      event_status: 'warning',
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
      title: `Grace period expired — no telematics device`,
      message: `Payment remains unpaid after ${RECOVERY_WINDOW_HOURS}-hour grace period for ${booking.vehicle_name || booking.id}. No telematics device found — account suspended, no hardware command sent.`,
      recommended_action: 'Account is suspended financially. No starter disable was sent (no device). Contact customer to resolve payment.',
      financial_impact_amount: booking.weekly_rate || 0,
      currency: 'usd',
      retry_attempts: booking.payment_failure_attempts || 0,
      source: 'processGracePeriod'
    });

    await notifyGraceExpired(base44, booking, false, false);
    return;
  }

  // Check if vehicle is safe to disable
  const safetyCheck = await checkVehicleSafeForStarterDisable(base44, booking.vehicle_id);

  if (!safetyCheck.safe) {
    // Vehicle appears running/moving — set pending flag, do NOT send command
    await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
      booking_status: 'suspended',
      suspension_triggered_at: now.toISOString(),
      suspended_at: now.toISOString(),
      starter_disable_pending: true,
      starter_disabled: false,
      moovetrax_kill_active: false,
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
      title: 'Starter disable PENDING — vehicle may be in motion',
      message: `Grace period expired for ${booking.vehicle_name || booking.id} but vehicle telemetry suggests it may be running (ignition=${safetyCheck.ignition}, speed=${safetyCheck.speed}). Starter disable deferred — will retry when parked.`,
      recommended_action: 'Monitor telematics. Starter-interrupt command will be sent automatically when vehicle is confirmed parked/ignition off. Manually verify if needed.',
      financial_impact_amount: booking.weekly_rate || 0,
      currency: 'usd',
      source: 'processGracePeriod'
    });

    await logEvent(base44, {
      event_type: 'payment.starter_disable_pending_vehicle_running',
      target_id: booking.id,
      host_id: booking.host_id || '',
      booking_id: booking.id,
      vehicle_id: booking.vehicle_id || '',
      customer_id: booking.user_email || '',
      summary: `Starter disable deferred — vehicle appears running for ${booking.vehicle_name || booking.id}. starter_disable_pending=true`,
      metadata: { safety_check: safetyCheck, starter_interrupt_only: true, no_engine_shutdown: true },
      event_status: 'warning',
    });

    await notifyGraceExpired(base44, booking, true, true);
    return;
  }

  // Safe to send starter interrupt
  await starterInterrupt(base44, booking, true);

  await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
    booking_status: 'suspended',
    suspension_triggered_at: now.toISOString(),
    suspended_at: now.toISOString(),
    starter_disabled: true,
    moovetrax_kill_active: true,
    starter_disable_pending: false,
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
    title: `Starter interrupt sent after ${RECOVERY_WINDOW_HOURS}h grace period`,
    message: `Payment remains unpaid after ${RECOVERY_WINDOW_HOURS}-hour grace period for ${booking.vehicle_name || booking.id}. Starter interrupt command sent (vehicle confirmed parked). No engine shutdown command was issued.`,
    recommended_action: 'Restore starter immediately after successful payment or admin override.',
    financial_impact_amount: booking.weekly_rate || 0,
    currency: 'usd',
    retry_attempts: booking.payment_failure_attempts || 0,
    source: 'processGracePeriod'
  });

  await logEvent(base44, {
    event_type: 'payment.starter_disabled',
    target_id: booking.id,
    host_id: booking.host_id || '',
    booking_id: booking.id,
    vehicle_id: booking.vehicle_id || '',
    customer_id: booking.user_email || '',
    summary: `Starter interrupt sent after ${RECOVERY_WINDOW_HOURS}h grace for ${booking.vehicle_name || booking.id}`,
    metadata: {
      starter_interrupt_only: true,
      no_engine_shutdown: true,
      safety_check: safetyCheck,
      scheduled_at: booking.starter_disable_scheduled_at,
      device_command_sent: true,
      authoritative_workflow: 'processGracePeriod'
    },
    event_status: 'warning',
  });

  await notifyGraceExpired(base44, booking, true, false);
}

async function notifyGraceExpired(base44, booking, hasDevice, isPending) {
  const title = isPending ? '⚠️ Account Suspended — Vehicle Access Pending Restriction' : hasDevice ? '🔒 Account Suspended — Vehicle Access Restricted' : '🔒 Account Suspended — Payment Required';
  const body = isPending
    ? `Your payment for ${booking.vehicle_name} remains unresolved. Your account is suspended. Vehicle access will be restricted as soon as the vehicle is parked.`
    : hasDevice
      ? `Your payment for ${booking.vehicle_name} remains unresolved after ${RECOVERY_WINDOW_HOURS} hours. Vehicle starter access has been interrupted (starter-interrupt only, no engine shutdown).`
      : `Your payment for ${booking.vehicle_name} remains unresolved after ${RECOVERY_WINDOW_HOURS} hours. Your account has been suspended.`;

  // DELEGATE TO CENTRAL ROUTER
  await base44.asServiceRole.functions.invoke('routePlatformNotification', {
    event_type: 'grace_period_expired',
    severity: 'critical',
    category: 'payments',
    title,
    message: body,
    booking_id: booking.id,
    customer_id: booking.user_id,
    host_id: booking.host_id,
    action_url: '/my-bookings',
    metadata: { recovery_window_hours: RECOVERY_WINDOW_HOURS, has_device: hasDevice, pending_restriction: isPending, starter_interrupt_only: true },
  }).catch(e => console.error('[GracePeriod] grace expired notification failed:', e.message));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const authorization = await authorizeScheduledGracePeriodRun(base44, body, req);
    if (!authorization.allowed) return authorization.response;
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });
    const now = new Date();

    const failedBookings = await base44.asServiceRole.entities.BookingRequest.filter({ payment_status: "failed" });
    const enforcementBookings = failedBookings.filter(b => isEligibleForPaymentRecovery(b, now));

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

      // Grace expired — escalate to suspended
      if (booking.booking_status === "payment_due" && isPastDisableTime) {
        await disableStarterAfterWindow(base44, booking, now);
        results.disabled++;
        continue;
      }

      // Retry starter disable for pending-disable bookings (vehicle was running when grace expired)
      if (booking.booking_status === "suspended" && booking.starter_disable_pending && !booking.starter_disabled) {
        const safetyCheck = await checkVehicleSafeForStarterDisable(base44, booking.vehicle_id);
        const deviceId = await getVehicleDevice(base44, booking.vehicle_id);
        if (safetyCheck.safe && deviceId) {
          await starterInterrupt(base44, booking, true);
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            starter_disabled: true,
            moovetrax_kill_active: true,
            starter_disable_pending: false,
          });
          await logEvent(base44, {
            event_type: 'payment.starter_disabled',
            target_id: booking.id,
            host_id: booking.host_id || '',
            booking_id: booking.id,
            vehicle_id: booking.vehicle_id || '',
            customer_id: booking.user_email || '',
            summary: `Deferred starter interrupt now sent — vehicle confirmed parked for ${booking.vehicle_name || booking.id}`,
            metadata: { safety_check: safetyCheck, deferred_send: true, starter_interrupt_only: true },
            event_status: 'warning',
          });
        }
        // Continue to allow retry attempt even after pending-disable check
      }

      // Hour-8 and Hour-16 final reminders based on hours elapsed since failure
      const failureHoursElapsed = failureStartedAt ? (now.getTime() - failureStartedAt.getTime()) / (60 * 60 * 1000) : 0;
      const hoursUntilDisable = disableScheduledAt ? (disableScheduledAt.getTime() - now.getTime()) / (60 * 60 * 1000) : RECOVERY_WINDOW_HOURS;
      // Send final reminder when 8 or fewer hours remain (≈ Hour-16 for 24h window)
      const shouldSendFinalReminder = hoursUntilDisable > 0 && hoursUntilDisable <= 8 && !booking.final_reminder_sent;
      if (shouldSendFinalReminder) {
        const hoursRemaining = Math.max(1, Math.round(hoursUntilDisable));
        await base44.asServiceRole.entities.Notification.create({
          user_email: booking.user_email,
          title: `⚠️ Final Reminder — Payment due in ${hoursRemaining} hour(s)`,
          body: `Your payment for ${booking.vehicle_name} is still overdue. Vehicle access may be restricted in approximately ${hoursRemaining} hour(s) if payment is not resolved.`,
          type: 'payment',
          booking_request_id: booking.id,
        });
        if (booking.customer_phone) {
          await sendSMS(booking.customer_phone, `uRide FINAL REMINDER: Your payment for ${booking.vehicle_name} is overdue. Access may be restricted in ~${hoursRemaining} hour(s). Pay now to avoid restriction.`);
        }
        await base44.asServiceRole.entities.BookingRequest.update(booking.id, { final_reminder_sent: true });
        await logEvent(base44, {
          event_type: 'payment.final_reminder_sent',
          target_id: booking.id,
          host_id: booking.host_id || '',
          booking_id: booking.id,
          vehicle_id: booking.vehicle_id || '',
          customer_id: booking.user_email || '',
          summary: `Final payment reminder sent — ~${hoursRemaining}h remaining for ${booking.vehicle_name || booking.id}`,
          metadata: { hours_remaining: hoursRemaining, recovery_window_hours: RECOVERY_WINDOW_HOURS },
          event_status: 'warning',
        });
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

        const { commerce, plan } = await resolveCommerceAndPlan(base44, booking.host_id || '');
        const isFleetOS = isFleetOSProfile(commerce, plan);
        const fleetOSHostStripeReady = commerce?.payment_processor === 'host_stripe' && commerce?.online_payments_enabled && commerce?.stripe_account_id;

        if (isFleetOS && !fleetOSHostStripeReady) {
          const reason = 'FleetOS payment recovery skipped: host Stripe is missing, disabled, or incomplete. uRide Stripe was not touched.';
          await createFleetOSPaymentAlert(base44, booking, reason);
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            booking_status: 'payment_due',
            payment_status: 'failed',
            payment_failure_reason: reason,
            last_retry_at: now.toISOString(),
          });
          results.skipped++;
          continue;
        }

        const stripeOptions = isFleetOS ? { stripeAccount: commerce.stripe_account_id } : {};
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(grossedAmount * 100),
          currency: "usd",
          customer: booking.stripe_customer_id,
          payment_method: booking.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: isFleetOS ? `Host payment recovery retry ${retryAttempt} — ${booking.vehicle_name}` : `uRide payment recovery retry ${retryAttempt} — ${booking.vehicle_name}`,
          metadata: { booking_request_id: booking.id, payment_recovery_retry: `${retryAttempt}`, billing_context: isFleetOS ? 'fleetos_host_direct_payment' : 'rental_marketplace_payment', payment_processor: isFleetOS ? 'host_stripe' : 'uride_stripe' },
        }, stripeOptions);

        if (paymentIntent.status === "succeeded") {
          await restoreAfterPayment(base44, booking, paymentIntent, grossedAmount, stripeFee, baseAmount, retryAttempt, now, isFleetOS);
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

        const alertMessage = friendlyPaymentRetryMessage(booking, newAttempts, retryErr.message);
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
          message: alertMessage,
          recommended_action: /No such PaymentMethod/i.test(String(retryErr.message || '')) ? 'Review booking status and payment method before retrying. Do not assume active renter fault until the booking is confirmed active.' : 'Customer still has until the scheduled starter-disable time to resolve payment unless the window has already expired.',
          financial_impact_amount: booking.weekly_rate || 0,
          currency: 'usd',
          retry_attempts: newAttempts,
          last_retry_result: alertMessage,
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