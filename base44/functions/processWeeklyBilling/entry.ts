import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });

async function logEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: data.actor_id || 'system',
      actor_email: data.actor_email || 'system',
      actor_role: data.actor_role || 'automation',
      target_entity: data.target_entity || '',
      target_id: data.target_id || '',
      host_id: data.host_id || '',
      booking_id: data.booking_id || '',
      vehicle_id: data.vehicle_id || '',
      customer_id: data.customer_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: data.source || 'automation',
      user_email: data.customer_id || 'system',
      event_title: data.summary || data.event_type,
      event_status: data.event_status || 'success',
      ...(data.dedupe_key ? { dedupe_key: data.dedupe_key } : {}),
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
  if (paymentIntentId) return 'scheduled_billing';
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

async function createFleetOSPaymentAlert(base44, booking, reason, source = 'processWeeklyBilling') {
  await createPaymentAlert(base44, {
    alert_type: 'fleetos_manual_payment_required',
    severity: 'critical',
    billing_context: 'fleetos_billing',
    booking_id: booking.id,
    host_id: booking.host_id || '',
    customer_id: booking.user_id || '',
    vehicle_id: booking.vehicle_id || '',
    renter_email: booking.user_email || '',
    related_entity_type: 'BookingRequest',
    related_entity_id: booking.id,
    title: 'FleetOS payment skipped',
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

async function authorizeScheduledBillingRun(base44, body) {
  const user = await base44.auth.me().catch(() => null);
  if (user) {
    if (user.role !== 'admin') {
      return { allowed: false, response: Response.json({ error: 'Forbidden: scheduled billing is admin-only' }, { status: 403 }) };
    }
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'admin.override',
      actor_id: user.id || user.email,
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'BackendFunction',
      target_id: 'processWeeklyBilling',
      summary: 'Admin manually ran weekly billing automation',
      metadata: { function_name: 'processWeeklyBilling', manual_admin_execution: true },
      source: 'admin_panel',
      event_status: 'warning',
    });
    return { allowed: true };
  }

  const args = body?.args || {};
  const automation = body?.automation || {};
  const isScheduler =
    automation.id === '6a0a6ae8df6d698b0450e63d' ||
    (args.automation_id === '6a0a6ae8df6d698b0450e63d' && args.scheduled_function === 'processWeeklyBilling');

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
    target_entity: 'BookingRequest',
    target_id: booking.id || '',
    host_id: booking.host_id || '',
    booking_id: booking.id || '',
    vehicle_id: booking.vehicle_id || '',
    customer_id: booking.user_email || '',
    summary: `Marketplace fee resolved: ${(feeRate * 100).toFixed(0)}% for ${operatorMode}`,
    metadata: { host_id: booking.host_id || '', booking_id: booking.id || '', operator_mode: operatorMode, booking_source: bookingSource, fee_rate_used: feeRate, fallback_used: fallbackUsed, reason },
    source: 'billing_readiness',
  });

  return { feeRate, operatorMode, bookingSource, fallbackUsed, reason };
}

// Starter commands are handled by processGracePeriod through sendTelematicsCommand.
// Send SMS via Twilio
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const authorization = await authorizeScheduledBillingRun(base44, body);
    if (!authorization.allowed) return authorization.response;

    // This function is called by a scheduled automation — verify admin or automation context
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch all active bookings with autopay enabled
    const activeBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      autopay_enabled: true,
    });

    // ── STATUS GUARD ──────────────────────────────────────────────────────────
    // WHITELIST: only process active/confirmed/approved bookings.
    // payment_due, grace_period, suspended are INTENTIONALLY excluded — those states
    // are owned by processGracePeriod. Charging them here would:
    //   • reset grace_period_started_at and lose retry context
    //   • cause duplicate Stripe charges during the grace window
    //   • send duplicate failure notifications to customers
    // This guard must never be relaxed without updating processGracePeriod coordination.
    const billingTargets = activeBookings.filter((b) => {
      if (!['approved', 'confirmed', 'active'].includes(b.booking_status)) return false;
      if (b.clean_return_status === 'approved_clean') return false; // rental ended
      if (!b.start_date) return false;
      if (!b.next_billing_date) return false;

      const nextBilling = new Date(b.next_billing_date);
      nextBilling.setHours(0, 0, 0, 0);
      return nextBilling.getTime() === today.getTime();
    });

    // ── DEFERRED BILLING LOG ──────────────────────────────────────────────────
    // Find bookings in payment-enforcement states whose next_billing_date is today.
    // They were skipped by the status guard above. Log once per day for ops visibility.
    const deferredTargets = activeBookings.filter((b) => {
      if (!['payment_due', 'suspended'].includes(b.booking_status)) return false;
      if (!b.next_billing_date) return false;
      const nextBilling = new Date(b.next_billing_date);
      nextBilling.setHours(0, 0, 0, 0);
      return nextBilling.getTime() === today.getTime();
    });

    if (deferredTargets.length > 0) {
      const todayStr = today.toISOString().split('T')[0];
      // Fetch recent events once — avoids per-booking query in the loop
      const recentEvents = await base44.asServiceRole.entities.ActivityEvent.list('-created_date', 50);
      for (const deferred of deferredTargets) {
        const dedupeKey = `payment.retry_deferred_${deferred.id}_${todayStr}`;
        const alreadyLogged = recentEvents.some(e =>
          e.dedupe_key === dedupeKey &&
          (Date.now() - new Date(e.created_date).getTime()) < 25 * 60 * 60 * 1000
        );
        if (!alreadyLogged) {
          await logEvent(base44, {
            event_type: 'payment.retry_deferred',
            target_id: deferred.id,
            host_id: deferred.host_id || '',
            booking_id: deferred.id,
            vehicle_id: deferred.vehicle_id || '',
            customer_id: deferred.user_email || '',
            summary: `Weekly billing deferred — ${deferred.vehicle_name} is in "${deferred.booking_status}" state, managed by processGracePeriod`,
            metadata: {
              booking_status: deferred.booking_status,
              payment_failure_attempts: deferred.payment_failure_attempts,
              payment_failure_started_at: deferred.payment_failure_started_at,
              starter_disable_scheduled_at: deferred.starter_disable_scheduled_at,
              next_billing_date: deferred.next_billing_date,
              managed_by: 'processGracePeriod',
            },
            event_status: 'warning',
            dedupe_key: dedupeKey,
          });
        }
        console.log(`[WeeklyBilling] DEFERRED ${deferred.id} (${deferred.booking_status}) — skipped, owned by processGracePeriod`);
      }
    }

    console.log(`[WeeklyBilling] Found ${billingTargets.length} to charge today, ${deferredTargets.length} deferred (payment enforcement)`);

    const results = [];

    for (const booking of billingTargets) {
      try {
        let resolvedHostId = booking.host_id || '';
        let resolvedHost = null;
        if (!resolvedHostId && booking.vehicle_id) {
          const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
          resolvedHostId = vehicles[0]?.host_id || '';
        }

        const weekNum = (booking.billing_week_number || 1) + 1;
        const referralCredit = booking.pending_referral_credit || 0;
        const baseAmount = Math.max(0, (booking.weekly_rate || 0) - referralCredit);

        // Gross up to cover Stripe fee (2.9% + $0.30) so host receives full weekly_rate
        // Formula: grossed = (base + 0.30) / (1 - 0.029)
        const grossedAmount = Math.round(((baseAmount + 0.30) / (1 - 0.029)) * 100) / 100;
        const stripeFee = Math.round((grossedAmount - baseAmount) * 100) / 100;
        const amount = grossedAmount;
        const amountCents = Math.round(amount * 100);

        console.log(`[WeeklyBilling] ${booking.id} base=$${baseAmount} stripeFee=$${stripeFee} total=$${amount}`);

        if (amountCents < 50) {
          console.warn(`[WeeklyBilling] Skipping ${booking.id} — amount too low`);
          continue;
        }

        const { commerce, plan } = await resolveCommerceAndPlan(base44, resolvedHostId);
        const isFleetOS = isFleetOSProfile(commerce, plan);
        const fleetOSHostStripeReady = commerce?.payment_processor === 'host_stripe' && commerce?.online_payments_enabled && commerce?.stripe_account_id;

        if (isFleetOS && (!fleetOSHostStripeReady || !booking.stripe_customer_id || !booking.stripe_payment_method_id)) {
          const reason = 'FleetOS weekly billing skipped: host Stripe or saved payment method is missing/incomplete. uRide Stripe was not touched.';
          await createFleetOSPaymentAlert(base44, { ...booking, host_id: resolvedHostId }, reason);
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            payment_status: 'due_soon',
            payment_failure_reason: reason,
          });
          results.push({ id: booking.id, status: 'fleetos_manual_payment_required' });
          continue;
        }

        const stripeOptions = isFleetOS ? { stripeAccount: commerce.stripe_account_id } : {};
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: "usd",
          customer: booking.stripe_customer_id,
          payment_method: booking.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: isFleetOS ? `Host Week ${weekNum} — ${booking.vehicle_name || ""}` : `uRide Week ${weekNum} — ${booking.vehicle_name || ""}`,
          metadata: { booking_request_id: booking.id, week_number: String(weekNum), billing_context: isFleetOS ? 'fleetos_host_direct_payment' : 'rental_marketplace_payment', payment_processor: isFleetOS ? 'host_stripe' : 'uride_stripe' },
        }, stripeOptions);

        if (paymentIntent.status === "succeeded") {
          // Calculate next billing date: anchor to current next_billing_date + 7
          const anchorDate = new Date(booking.next_billing_date + "T00:00:00");
          anchorDate.setDate(anchorDate.getDate() + 7);
          const nextBillingDate = anchorDate.toISOString().split("T")[0];

          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            payment_status: "paid",
            payment_failure_attempts: 0,
            billing_week_number: weekNum,
            next_billing_date: nextBillingDate,
            pending_referral_credit: 0,
            stripe_fee_amount: stripeFee,
            last_charged_gross: amount,
          });

          // ── HOST PAYOUT SPLIT (Stripe Connect) ──
          if (resolvedHostId && !isFleetOS) {
            const hosts = await base44.asServiceRole.entities.Host.filter({ id: resolvedHostId });
            const host = hosts[0];
            resolvedHost = host;
            if (host?.stripe_onboarding_complete && host?.stripe_account_id) {
              const { feeRate: commissionRate } = await resolveMarketplaceFee(base44, { ...booking, host_id: host.id });
              // Platform fee is on baseAmount (what the platform receives after Stripe takes its cut).
              // hostAmount = baseAmount - platformFee so Stripe fee is NOT sent to the host.
              // grossedAmount = baseAmount + stripeFee, and Stripe deducts stripeFee from the charge,
              // leaving baseAmount in the platform's balance to split correctly.
              const platformFee = Math.round(baseAmount * commissionRate * 100) / 100;
              const receivableOffset = await applyReceivableOffset(base44, host.id, Math.max(0, baseAmount - platformFee), new Date());
              const hostAmount = Math.round((baseAmount - platformFee - receivableOffset) * 100) / 100;
              const hostAmountCents = Math.round(hostAmount * 100);

              // Transfer to host's connected Stripe account
              const transfer = hostAmountCents > 0 ? await stripe.transfers.create({
                amount: hostAmountCents,
                currency: "usd",
                destination: host.stripe_account_id,
                description: `uRide Week ${weekNum} — ${booking.vehicle_name}`,
                metadata: { booking_id: booking.id, host_id: host.id, week: String(weekNum), payment_intent_id: paymentIntent.id },
              }) : { id: '' };

              // Update booking with payout info
              await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
                platform_fee_amount: platformFee,
                host_payout_amount: hostAmount,
                stripe_transfer_id: transfer.id,
              });

              // ── CREATE HostPayout RECORD ─────────────────────────────────────
              await base44.asServiceRole.entities.HostPayout.create({
                host_id: host.id,
                host_email: host.email,
                host_name: host.full_name,
                booking_request_id: booking.id,
                vehicle_name: booking.vehicle_name || "",
                period_start: booking.next_billing_date,
                period_end: nextBillingDate,
                gross_booking_amount: amount,
                stripe_fee_amount: stripeFee,
                stripe_effective_rate: parseFloat(((stripeFee / amount) * 100).toFixed(2)),
                uride_platform_fee_amount: platformFee,
                uride_platform_fee_rate: commissionRate,
                receivable_offset_amount: receivableOffset,
                net_host_payout: hostAmount,
                net_payout: hostAmount,
                stripe_payment_intent_id: paymentIntent.id,
                gross_collected: amount,
                platform_fee: platformFee,
                stripe_transfer_id: transfer.id,
                status: "paid",
                payout_date: new Date().toISOString().split('T')[0],
              });

              console.log(`[WeeklyBilling] ✓ Host transfer ${transfer.id} — $${hostAmount} to ${host.stripe_account_id}`);
            }
          }

          // If referral credit was applied, mark it on the referral record
          if (referralCredit > 0) {
            const referrals = await base44.asServiceRole.entities.Referral.filter({ referral_code: booking.referral_code });
            for (const ref of referrals) {
              const updates = {};
              if (ref.referee_email === booking.user_email && !ref.referee_credit_applied) {
                updates.referee_credit_applied = true;
                updates.referee_credit_applied_at = new Date().toISOString();
              }
              if (ref.referrer_email === booking.user_email && !ref.referrer_credit_applied) {
                updates.referrer_credit_applied = true;
                updates.referrer_credit_applied_at = new Date().toISOString();
              }
              if (Object.keys(updates).length > 0) {
                await base44.asServiceRole.entities.Referral.update(ref.id, updates);
                // Update referral code usage stats
                const codes = await base44.asServiceRole.entities.ReferralCode.filter({ user_email: booking.user_email });
                if (codes.length > 0) {
                  await base44.asServiceRole.entities.ReferralCode.update(codes[0].id, {
                    total_credits_used: (codes[0].total_credits_used || 0) + referralCredit,
                  });
                }
              }
            }
          }

          // ── PAYMENT LOG ──
          const paidAt = new Date().toISOString();
          const chargeData = paymentIntent.charges?.data?.[0];
          const receiptUrl = chargeData?.receipt_url || "";
          const sourceType = classifyPaymentSource({ paymentIntentId: paymentIntent.id });
          const dedupeKey = generatePaymentDedupeKey({ sourceType, bookingId: booking.id, weekNumber: weekNum, amount, paidAt, paymentIntentId: paymentIntent.id, paymentMethod: "stripe" });
          const paymentLog = await base44.asServiceRole.entities.PaymentLog.create({
            booking_request_id: booking.id,
            host_id: resolvedHostId,
            customer_email: booking.user_email,
            customer_name: booking.customer_full_name || "",
            vehicle_id: booking.vehicle_id,
            vehicle_name: booking.vehicle_name || "",
            week_number: weekNum,
            billing_period_start: booking.next_billing_date,
            billing_period_end: nextBillingDate,
            amount: amount,
            currency: paymentIntent.currency || "usd",
            payment_method: "stripe",
            source_type: sourceType,
            source_confidence: classifyPaymentConfidence({ paymentIntentId: paymentIntent.id }),
            legacy_flag: false,
            external_reconcilable: true,
            dedupe_key: dedupeKey,
            stripe_payment_intent_id: paymentIntent.id,
            stripe_charge_id: chargeData?.id || "",
            stripe_customer_id: paymentIntent.customer || booking.stripe_customer_id || "",
            stripe_payment_method_id: paymentIntent.payment_method || booking.stripe_payment_method_id || "",
            stripe_balance_transaction_id: typeof chargeData?.balance_transaction === "string" ? chargeData.balance_transaction : chargeData?.balance_transaction?.id || "",
            stripe_receipt_url: receiptUrl,
            receipt_url: receiptUrl,
            status: "paid",
            recorded_by: "autopay",
            paid_at: paidAt,
          });

          await logEvent(base44, {
            event_type: 'payment.logged',
            actor_id: 'autopay',
            actor_email: 'autopay@uridehub.com',
            actor_role: 'automation',
            target_entity: 'PaymentLog',
            target_id: paymentLog.id,
            host_id: resolvedHostId,
            booking_id: booking.id,
            vehicle_id: booking.vehicle_id || '',
            customer_id: booking.user_email || '',
            summary: `Hardened PaymentLog created for week ${weekNum} autopay`,
            metadata: { payment_log_id: paymentLog.id, dedupe_key: dedupeKey, source_type: sourceType },
            source: 'automation',
          });

          // Send weekly receipt via CENTRAL ROUTER
          await base44.asServiceRole.functions.invoke('routePlatformNotification', {
            event_type: 'weekly_payment_receipt',
            severity: 'info',
            category: 'payments',
            title: `Week ${weekNum} Payment Received — $${amount.toFixed(2)}`,
            message: `$${amount.toFixed(2)} for your ${booking.vehicle_name} rental (Week ${weekNum}) has been processed. Next charge: ${nextBillingDate}.`,
            booking_id: booking.id,
            customer_id: booking.user_id,
            action_url: '/my-bookings',
            metadata: { week_number: weekNum, amount, next_billing_date: nextBillingDate },
          }).catch(e => console.error('[WeeklyBilling] receipt notification failed:', e.message));

          // Send 24hr pre-charge warning for NEXT week
          await schedulePreChargeWarning(base44, booking, nextBillingDate, amount, weekNum + 1);

          results.push({ id: booking.id, status: "charged", week: weekNum });
          console.log(`[WeeklyBilling] ✓ Charged ${booking.id} Week ${weekNum} $${amount}`);
          await logEvent(base44, {
            event_type: 'payment.succeeded',
            actor_id: 'autopay',
            actor_email: 'autopay@uridehub.com',
            actor_role: 'automation',
            target_entity: 'BookingRequest',
            target_id: booking.id,
            host_id: resolvedHostId,
            booking_id: booking.id,
            vehicle_id: booking.vehicle_id || '',
            customer_id: booking.user_email || '',
            summary: `Autopay week ${weekNum} — $${amount} charged for ${booking.vehicle_name || booking.id}`,
            metadata: { week_number: weekNum, amount, payment_intent_id: paymentIntent.id },
            source: 'automation',
          });
        }
      } catch (err) {
        console.error(`[WeeklyBilling] Charge failed for ${booking.id}:`, err.message);
        // Trigger failed payment handler
        await handleFailedPayment(base44, booking, err.message, 1);
        results.push({ id: booking.id, status: "failed", error: err.message });
      }
    }

    return Response.json({ ok: true, processed: billingTargets.length, results });
  } catch (error) {
    console.error("[WeeklyBilling] Fatal error:", error.message);
    // M1 FIX: Create billing system failure alert even when outer catch fires
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.functions.invoke('createPaymentOperationalAlert', {
        alert_type: 'unknown_billing_context',
        severity: 'critical',
        billing_context: 'weekly_billing',
        title: 'Weekly billing system failure',
        message: `processWeeklyBilling encountered a fatal error: ${error.message}`,
        recommended_action: 'Review billing logs immediately. Some bookings due today may not have been charged.',
        financial_impact_amount: 0,
        currency: 'usd',
        requires_admin_action: true,
        source: 'processWeeklyBilling',
      });
    } catch (alertErr) {
      console.error('[WeeklyBilling] Failed to create billing failure alert:', alertErr.message);
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function schedulePreChargeWarning(base44, booking, nextBillingDate, amount, weekNum) {
  // Create a notification scheduled for 24hrs before — since we can't schedule future notifications,
  // we store the upcoming charge date and a separate daily function sends these warnings
  // For now, just log — the daily billing check function handles pre-warnings
  console.log(`[PreChargeWarning] Queued for ${booking.user_email} on ${nextBillingDate} Week ${weekNum} $${amount}`);
}

async function handleFailedPayment(base44, booking, reason, attemptNum) {
  const now = new Date();
  const recoveryWindowHours = parseInt(Deno.env.toObject().PAYMENT_RECOVERY_WINDOW_HOURS || '24', 10);
  const disableAt = new Date(now.getTime() + recoveryWindowHours * 60 * 60 * 1000);
  const warningMessage = `Your payment failed. Please update your payment method or contact support. Vehicle access may be restricted after ${recoveryWindowHours} hours if payment is not resolved.`;

  let hostEmail = '';
  if (booking.host_id) {
    const hosts = await base44.asServiceRole.entities.Host.filter({ id: booking.host_id });
    hostEmail = hosts[0]?.email || '';
  }

  await createPaymentAlert(base44, {
    alert_type: 'weekly_billing_failed',
    severity: 'critical',
    billing_context: 'weekly_billing',
    booking_id: booking.id,
    host_id: booking.host_id || '',
    customer_id: booking.user_id || '',
    vehicle_id: booking.vehicle_id || '',
    renter_email: booking.user_email || '',
    host_email: hostEmail,
    related_entity_type: 'BookingRequest',
    related_entity_id: booking.id,
    title: 'Weekly rental payment failed',
    message: `${warningMessage} Failure reason: ${reason}`,
    recommended_action: `Customer has ${recoveryWindowHours} hours to resolve payment before starter access is disabled by processGracePeriod.`,
    financial_impact_amount: booking.weekly_rate || 0,
    currency: 'usd',
    retry_attempts: attemptNum,
    escalation_deadline_at: disableAt.toISOString(),
    source: 'processWeeklyBilling'
  });

  await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
    payment_status: "failed",
    payment_failure_reason: reason,
    payment_failure_attempts: attemptNum,
    last_payment_failure_at: now.toISOString(),
    last_retry_at: now.toISOString(),
    booking_status: "payment_due",
    payment_failure_started_at: now.toISOString(),
    starter_disable_scheduled_at: disableAt.toISOString(),
    starter_disabled: false,
    moovetrax_kill_active: false,
    grace_period_started_at: null,
    grace_period_ends_at: null,
  });

  await base44.asServiceRole.entities.Notification.create({
    user_email: booking.user_email,
    title: "Payment failed — action required",
    body: warningMessage,
    type: "payment",
    booking_request_id: booking.id,
  });

  if (booking.customer_phone) {
    await sendSMS(booking.customer_phone, `uRide: ${warningMessage}`);
  }

  await base44.asServiceRole.integrations.Core.SendEmail({
    to: booking.user_email,
    subject: `Payment Failed — ${recoveryWindowHours} Hours to Resolve`,
    body: `Hi ${booking.customer_full_name || ""},\n\n${warningMessage}\n\nYour vehicle remains operational during this ${recoveryWindowHours}-hour recovery window. This policy uses starter interrupt only and does not shut down a running engine.\n\nPlease open the app and update your payment method immediately.\n\nThe uRide Team`,
  });

  await logEvent(base44, {
    event_type: 'payment.failed',
    actor_id: 'autopay',
    actor_email: 'autopay@uridehub.com',
    actor_role: 'automation',
    target_entity: 'BookingRequest',
    target_id: booking.id,
    host_id: booking.host_id || '',
    booking_id: booking.id,
    vehicle_id: booking.vehicle_id || '',
    customer_id: booking.user_email || '',
    summary: `Payment FAILED — ${recoveryWindowHours}-hour starter-interrupt recovery window started for ${booking.vehicle_name || booking.id}`,
    metadata: {
      reason,
      attempt_num: attemptNum,
      recovery_window_hours: recoveryWindowHours,
      payment_failure_started_at: now.toISOString(),
      starter_disable_scheduled_at: disableAt.toISOString(),
      starter_interrupt_only: true,
      no_engine_shutdown: true,
      authoritative_workflow: 'processGracePeriod'
    },
    source: 'automation',
    event_status: 'error',
  });
}