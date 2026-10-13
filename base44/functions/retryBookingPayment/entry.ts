import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

/**
 * retryBookingPayment — customer-initiated payment retry for a failed weekly billing.
 *
 * Called from the "Pay Now" card on the My Vehicle screen. Charges the saved
 * payment method on file and, on success, restores the booking to active,
 * creates a PaymentLog, issues the host payout, and restores starter access.
 *
 * Authorization: the calling user must own the booking. Only bookings with
 * payment_status="failed" and booking_status in ["payment_due","suspended"]
 * are eligible — this cannot be used to charge ahead for future weeks.
 */

function computeWeekNumberFromBillingDate(startDate, billingDate) {
  if (!startDate || !billingDate) return 1;
  const start = new Date(startDate + "T00:00:00");
  const billing = new Date(billingDate + "T00:00:00");
  const diffDays = Math.round((billing.getTime() - start.getTime()) / 86400000);
  return Math.floor(diffDays / 7) + 1;
}

async function logEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: data.actor_id || 'customer_self_service',
      actor_email: data.actor_email || '',
      actor_role: data.actor_role || 'customer',
      target_entity: data.target_entity || 'BookingRequest',
      target_id: data.target_id || '',
      host_id: data.host_id || '',
      booking_id: data.booking_id || '',
      vehicle_id: data.vehicle_id || '',
      customer_id: data.customer_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: data.source || 'customer_self_service',
      user_email: data.customer_id || '',
      event_title: data.summary || data.event_type,
      event_status: data.event_status || 'success',
    });
  } catch (e) {
    console.error('[retryBookingPayment] logEvent failed:', e.message);
  }
}

async function resolveTelematicsDevice(base44, vehicleId) {
  if (!vehicleId) return null;
  const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ vehicle_id: vehicleId });
  return devices.find(d => d.lifecycle_status !== 'retired' && d.production_commands_enabled === true) || devices[0] || null;
}

async function restoreStarter(base44, booking) {
  const device = await resolveTelematicsDevice(base44, booking.vehicle_id);
  if (!device) return { ok: false, error: 'no_device' };
  const response = await base44.asServiceRole.functions.invoke('sendTelematicsCommand', {
    telematics_device_id: device.id,
    unique_id: device.unique_id,
    vehicle_id: booking.vehicle_id,
    booking_id: booking.id,
    command_type: 'restore_starter',
    service_context: 'payment_enforcement',
    source: 'retryBookingPayment',
    reason: 'Payment recovered via customer self-service Pay Now.',
    confirm_starter_command: true,
  });
  const data = response.data || {};
  if (data.error || response.status >= 400) return { ok: false, error: data.error || 'command_failed' };
  return { ok: true };
}

async function resolveMarketplaceFee(base44, booking) {
  const bookingSource = booking.booking_source || 'marketplace';
  let operatorMode = 'marketplace_partner';
  if (booking.host_id) {
    const plans = await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id: booking.host_id });
    const plan = plans[0];
    if (plan) {
      operatorMode = plan.active_mode && plan.active_mode !== 'none' ? plan.active_mode : (plan.selected_mode || plan.recommended_mode || operatorMode);
    }
  }
  let feeRate = 0;
  if (bookingSource === 'marketplace') {
    feeRate = operatorMode === 'hybrid_growth' ? 0.05 : operatorMode === 'fleetos_professional' ? 0 : 0.08;
  }
  return { feeRate, operatorMode };
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
    });
    totalOffset += offset;
    remainingOffset -= offset;
  }
  return Math.round(totalOffset * 100) / 100;
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });
    const now = new Date();

    // ── 1. Authenticate the caller ──
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

    // ── 2. Parse and validate input ──
    const body = await req.json().catch(() => ({}));
    const bookingId = body?.booking_id;
    if (!bookingId) return Response.json({ error: "booking_id is required" }, { status: 400 });

    // ── 3. Load the booking and verify ownership ──
    let booking = null;
    try {
      const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: bookingId });
      booking = bookings[0];
    } catch (lookupErr) {
      return Response.json({ error: "Booking not found" }, { status: 404 });
    }
    if (!booking) return Response.json({ error: "Booking not found" }, { status: 404 });
    if (booking.user_id !== user.id && booking.user_email !== user.email) {
      return Response.json({ error: "You are not authorized to retry payment for this booking" }, { status: 403 });
    }

    // ── 4. Verify the booking is in a failed-payment state ──
    if (!["payment_due", "suspended"].includes(booking.booking_status)) {
      return Response.json({ error: "This booking does not have a failed payment to retry" }, { status: 400 });
    }
    if (booking.payment_status !== "failed") {
      return Response.json({ error: "This booking does not have a failed payment to retry" }, { status: 400 });
    }
    if (!booking.stripe_customer_id || !booking.stripe_payment_method_id) {
      return Response.json({ error: "No saved payment method on file. Please update your payment method." }, { status: 400 });
    }

    // ── 5. Charge the saved payment method ──
    const baseAmount = booking.weekly_rate || 0;
    if (baseAmount <= 0) return Response.json({ error: "Billing amount is zero — nothing to charge" }, { status: 400 });
    const grossedAmount = Math.round(((baseAmount + 0.30) / (1 - 0.029)) * 100) / 100;
    const stripeFee = Math.round((grossedAmount - baseAmount) * 100) / 100;

    const { commerce, plan } = await resolveCommerceAndPlan(base44, booking.host_id || '');
    const isFleetOS = isFleetOSProfile(commerce, plan);
    const fleetOSHostStripeReady = commerce?.payment_processor === 'host_stripe' && commerce?.online_payments_enabled && commerce?.stripe_account_id;

    if (isFleetOS && !fleetOSHostStripeReady) {
      return Response.json({ error: "Host payment processor is not configured. Please contact support." }, { status: 400 });
    }

    const paymentIntentParams = {
      amount: Math.round(grossedAmount * 100),
      currency: "usd",
      customer: booking.stripe_customer_id,
      payment_method: booking.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      description: isFleetOS ? `Host payment retry — ${booking.vehicle_name}` : `uRide payment retry — ${booking.vehicle_name}`,
      metadata: {
        booking_request_id: booking.id,
        payment_retry: 'customer_initiated',
        billing_context: isFleetOS ? 'fleetos_host_direct_payment' : 'rental_marketplace_payment',
        payment_processor: isFleetOS ? 'host_stripe' : 'uride_stripe',
      },
    };

    let paymentIntent;
    try {
      paymentIntent = isFleetOS
        ? await stripe.paymentIntents.create(paymentIntentParams, { stripeAccount: commerce.stripe_account_id })
        : await stripe.paymentIntents.create(paymentIntentParams);
    } catch (chargeErr) {
      const newAttempts = (booking.payment_failure_attempts || 0) + 1;
      await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
        payment_failure_attempts: newAttempts,
        payment_failure_reason: chargeErr.message,
        last_retry_at: now.toISOString(),
      });

      await logEvent(base44, {
        event_type: 'payment.failed',
        target_id: booking.id,
        host_id: booking.host_id || '',
        booking_id: booking.id,
        vehicle_id: booking.vehicle_id || '',
        customer_id: booking.user_email || '',
        actor_email: user.email,
        actor_role: 'customer',
        summary: `Customer Pay Now retry failed for ${booking.vehicle_name || booking.id}: ${chargeErr.message}`,
        metadata: { error: chargeErr.message, attempt: newAttempts, source: 'customer_self_service' },
        event_status: 'error',
      });

      return Response.json({
        success: false,
        error: chargeErr.message || "Payment was declined. Please try again or update your payment method.",
      });
    }

    if (paymentIntent.status !== "succeeded") {
      return Response.json({
        success: false,
        error: `Payment status is ${paymentIntent.status}. Please try again or contact support.`,
      });
    }

    // ── 6. Charge succeeded — restore the booking ──
    const paymentWeekNumber = computeWeekNumberFromBillingDate(booking.start_date, booking.next_billing_date);
    const anchorStart = new Date(booking.start_date + "T00:00:00");
    anchorStart.setDate(anchorStart.getDate() + paymentWeekNumber * 7);
    const nextBillingDate = anchorStart.toISOString().split("T")[0];

    const nextBillingDateObj = new Date(nextBillingDate + "T00:00:00");
    const todayObj = new Date(now.toISOString().split("T")[0] + "T00:00:00");
    const allPastDueCleared = nextBillingDateObj.getTime() > todayObj.getTime();

    let starterRestored = false;
    if (allPastDueCleared && (booking.starter_disabled || booking.moovetrax_kill_active)) {
      const restoreResult = await restoreStarter(base44, booking);
      starterRestored = restoreResult.ok;
    }

    const bookingUpdate = {
      payment_status: "paid",
      payment_failure_attempts: 0,
      payment_failure_reason: null,
      last_payment_failure_at: null,
      last_retry_at: now.toISOString(),
      next_billing_date: nextBillingDate,
      billing_week_number: paymentWeekNumber,
    };

    if (allPastDueCleared) {
      bookingUpdate.booking_status = "active";
      bookingUpdate.rental_lifecycle_phase = "active";
      bookingUpdate.payment_failure_started_at = null;
      bookingUpdate.starter_disable_scheduled_at = null;
      bookingUpdate.grace_period_started_at = null;
      bookingUpdate.grace_period_ends_at = null;
      bookingUpdate.suspension_triggered_at = null;
      bookingUpdate.suspended_at = null;
      if (starterRestored) {
        bookingUpdate.starter_disabled = false;
        bookingUpdate.moovetrax_kill_active = false;
      }
    } else {
      bookingUpdate.booking_status = "suspended";
      bookingUpdate.payment_status = "failed";
      bookingUpdate.starter_disabled = true;
      bookingUpdate.moovetrax_kill_active = true;
    }

    await base44.asServiceRole.entities.BookingRequest.update(booking.id, bookingUpdate);

    // Create PaymentLog
    const paymentPaidAt = now.toISOString();
    const dedupeKey = paymentIntent.id ? `payment:stripe:${paymentIntent.id}` : `payment:customer_retry:${booking.id}:week:${paymentWeekNumber}:amount:${grossedAmount}:date:${paymentPaidAt.slice(0, 10)}:method:stripe:ref:none`;

    await base44.asServiceRole.entities.PaymentLog.create({
      booking_request_id: booking.id,
      host_id: booking.host_id || '',
      customer_email: booking.user_email,
      customer_name: booking.customer_full_name || '',
      vehicle_id: booking.vehicle_id,
      vehicle_name: booking.vehicle_name || '',
      week_number: paymentWeekNumber,
      billing_period_start: booking.next_billing_date || now.toISOString().slice(0, 10),
      billing_period_end: nextBillingDate,
      amount: grossedAmount,
      currency: paymentIntent.currency || 'usd',
      payment_method: 'stripe',
      source_type: 'grace_retry',
      source_confidence: 'trusted',
      legacy_flag: false,
      external_reconcilable: true,
      dedupe_key: dedupeKey,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_charge_id: paymentIntent.charges?.data?.[0]?.id || '',
      stripe_customer_id: paymentIntent.customer || booking.stripe_customer_id || '',
      stripe_payment_method_id: paymentIntent.payment_method || booking.stripe_payment_method_id || '',
      stripe_balance_transaction_id: typeof paymentIntent.charges?.data?.[0]?.balance_transaction === 'string' ? paymentIntent.charges.data[0].balance_transaction : paymentIntent.charges?.data?.[0]?.balance_transaction?.id || '',
      stripe_receipt_url: paymentIntent.charges?.data?.[0]?.receipt_url || '',
      receipt_url: paymentIntent.charges?.data?.[0]?.receipt_url || '',
      status: 'paid',
      recorded_by: 'customer_self_service',
      paid_at: paymentPaidAt,
    });

    // Create host payout (skip for FleetOS — host charges directly)
    if (booking.host_id && !isFleetOS) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ id: booking.host_id });
      const host = hosts[0];
      if (host?.stripe_onboarding_complete && host?.stripe_account_id) {
        const { feeRate: commissionRate } = await resolveMarketplaceFee(base44, booking);
        const platformFee = Math.round(baseAmount * commissionRate * 100) / 100;
        const receivableOffset = await applyReceivableOffset(base44, host.id, Math.max(0, baseAmount - platformFee), now);
        const hostAmount = Math.round((baseAmount - platformFee - receivableOffset) * 100) / 100;
        const transfer = hostAmount > 0 ? await stripe.transfers.create({
          amount: Math.round(hostAmount * 100),
          currency: "usd",
          destination: host.stripe_account_id,
          description: `uRide payment retry (customer Pay Now) — ${booking.vehicle_name}`,
          metadata: { booking_id: booking.id, host_id: host.id, payment_intent_id: paymentIntent.id },
        }) : { id: '' };
        await base44.asServiceRole.entities.HostPayout.create({
          host_id: host.id,
          host_email: host.email,
          host_name: host.full_name,
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
          stripe_transfer_id: transfer.id,
          status: "paid",
          payout_date: now.toISOString().split('T')[0],
        });
      }
    }

    // ── 6b. Create payment_recovered alert to auto-resolve prior failure alerts ──
    // This triggers the centralized auto-resolution in createPaymentOperationalAlert,
    // which resolves all open failure alerts (weekly_billing_failed, rental_payment_failed,
    // payment_retry_scheduled, etc.) for this booking — clearing them from the UI.
    if (allPastDueCleared) {
      await base44.asServiceRole.functions.invoke('createPaymentOperationalAlert', {
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
        title: 'Payment recovered — customer Pay Now',
        message: `Payment of $${grossedAmount.toFixed(2)} recovered via customer self-service Pay Now for ${booking.vehicle_name || booking.id} (Week ${paymentWeekNumber}).${starterRestored ? ' Starter access restored.' : ' Starter restore pending.'}`,
        recommended_action: 'Confirm booking and payment records are healthy.',
        financial_impact_amount: grossedAmount,
        currency: paymentIntent.currency || 'usd',
        source: 'retryBookingPayment',
      }).catch(e => console.error('[retryBookingPayment] payment_recovered alert failed:', e.message));
    }

    // ── 7. Notify customer + host ──
    const customerMessage = allPastDueCleared
      ? `Your payment of $${grossedAmount.toFixed(2)} for ${booking.vehicle_name} was processed successfully. Your rental is active${starterRestored ? ' and starter access has been restored' : ''}. Next billing: ${nextBillingDate}.`
      : `Your payment of $${grossedAmount.toFixed(2)} for ${booking.vehicle_name} (Week ${paymentWeekNumber}) was received, but past-due weeks remain. Your vehicle stays suspended until all are caught up. Next billing: ${nextBillingDate}.`;

    await base44.asServiceRole.functions.invoke('routePlatformNotification', {
      event_type: allPastDueCleared ? 'payment_recovered' : 'partial_payment_received',
      severity: allPastDueCleared ? 'info' : 'warning',
      category: 'payments',
      title: allPastDueCleared ? "Payment received — rental active" : "Payment received — past-due weeks remain",
      message: customerMessage,
      booking_id: booking.id,
      customer_id: booking.user_id,
      action_url: '/my-vehicle',
      metadata: { next_billing_date: nextBillingDate, starter_restored: starterRestored, source: 'customer_self_service' },
    }).catch(e => console.error('[retryBookingPayment] customer notification failed:', e.message));

    if (booking.host_id) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ id: booking.host_id }).catch(() => []);
      const host = hosts[0];
      if (host?.email) {
        const hostTitle = allPastDueCleared
          ? `Payment Recovered — ${booking.customer_full_name || booking.user_email || 'Customer'}`
          : `Partial Payment — ${booking.customer_full_name || booking.user_email || 'Customer'}`;
        const hostMessage = allPastDueCleared
          ? `${booking.customer_full_name || booking.user_email || 'Customer'}'s payment of $${grossedAmount.toFixed(2)} for ${booking.vehicle_name} (Week ${paymentWeekNumber}) was recovered via customer self-service Pay Now. ${starterRestored ? 'Vehicle starter access has been restored.' : 'Starter restore is pending.'} Next billing: ${nextBillingDate}.`
          : `${booking.customer_full_name || booking.user_email || 'Customer'} paid Week ${paymentWeekNumber} ($${grossedAmount.toFixed(2)}) for ${booking.vehicle_name} via Pay Now, but past-due weeks remain. Vehicle stays suspended until all are caught up. Next billing: ${nextBillingDate}.`;

        await base44.asServiceRole.functions.invoke('routePlatformNotification', {
          event_type: allPastDueCleared ? 'host_payment_recovered' : 'host_partial_payment',
          severity: allPastDueCleared ? 'info' : 'warning',
          category: 'payments',
          title: hostTitle,
          message: hostMessage,
          booking_id: booking.id,
          host_id: host.id,
          vehicle_id: booking.vehicle_id || '',
          action_url: '/host/payouts',
          metadata: { outcome: allPastDueCleared ? 'recovered' : 'partial', week_number: paymentWeekNumber, amount: grossedAmount, source: 'customer_self_service' },
          source_function: 'retryBookingPayment',
        }).catch(e => console.error('[retryBookingPayment] host notification failed:', e.message));

        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: host.email,
            subject: hostTitle,
            body: hostMessage,
            from_name: 'uRide Billing',
          });
        } catch (e) {
          console.error('[retryBookingPayment] host email failed:', e.message);
        }
      }
    }

    await logEvent(base44, {
      event_type: 'payment.succeeded',
      target_id: booking.id,
      host_id: booking.host_id || '',
      booking_id: booking.id,
      vehicle_id: booking.vehicle_id || '',
      customer_id: booking.user_email || '',
      actor_email: user.email,
      actor_role: 'customer',
      summary: `Payment recovered via customer Pay Now for ${booking.vehicle_name || booking.id} — Week ${paymentWeekNumber}`,
      metadata: {
        payment_intent_id: paymentIntent.id,
        amount: grossedAmount,
        week_number: paymentWeekNumber,
        next_billing_date: nextBillingDate,
        starter_restored: starterRestored,
        all_past_due_cleared: allPastDueCleared,
        source: 'customer_self_service',
      },
    });

    return Response.json({
      success: true,
      payment_intent_id: paymentIntent.id,
      amount: grossedAmount,
      week_number: paymentWeekNumber,
      next_billing_date: nextBillingDate,
      all_past_due_cleared: allPastDueCleared,
      starter_restored: starterRestored,
      booking_status: allPastDueCleared ? "active" : "suspended",
    });
  } catch (error) {
    console.error('[retryBookingPayment] Unexpected error:', error);
    return Response.json({ error: error.message || "An unexpected error occurred" }, { status: 500 });
  }
});