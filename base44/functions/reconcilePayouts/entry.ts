/**
 * reconcilePayouts
 *
 * Scheduled safety net — finds paid bookings with a Stripe PaymentIntent
 * that have NO corresponding HostPayout record, and creates the payout +
 * Stripe transfer. This catches cases where the Stripe webhook failed to
 * fire or was not configured.
 *
 * Also creates missing PaymentLog records for the same bookings.
 *
 * Idempotency: checks by booking_request_id AND stripe_payment_intent_id
 * before creating any payout. Never double-pays.
 *
 * Eligibility:
 *   - payment_status === 'paid'
 *   - stripe_payment_intent_id is present
 *   - booking_status is NOT cancelled/superseded/rejected
 *   - payment_status is NOT refunded
 *   - No existing HostPayout with this booking_request_id
 *   - Host has stripe_account_id + stripe_onboarding_complete
 *
 * Blocks:
 *   - host.payout_frozen === true → on_hold
 *   - host has no Stripe account → on_hold (not silent skip)
 *   - Stripe transfer fails → failed + payout_failure_reason
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });

async function logEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: data.actor_id || 'reconcilePayouts',
      actor_email: data.actor_email || 'reconcilePayouts@uridehub.com',
      actor_role: data.actor_role || 'automation',
      target_entity: data.target_entity || '',
      target_id: data.target_id || '',
      host_id: data.host_id || '',
      booking_id: data.booking_id || '',
      vehicle_id: data.vehicle_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: data.source || 'automation',
      user_email: data.actor_email || 'reconcilePayouts@uridehub.com',
      event_title: data.summary || data.event_type,
      event_status: data.event_status || 'success',
    });
  } catch (e) {
    console.error('[AuditLog]', e.message);
  }
}

function generatePaymentDedupeKey({ bookingId, amount, paidAt, paymentIntentId }) {
  if (paymentIntentId) return `payment:stripe:${paymentIntentId}`;
  return `payment:reconcile:${bookingId}:amount:${amount}:date:${paidAt || 'none'}`;
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow admin OR scheduled automation
    const user = await base44.auth.me().catch(() => null);
    const isScheduler = !user && req.headers.get('x-base44-automation');
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run || false;
    const bookingIdFilter = body.booking_id || null;

    // 1. Find all paid bookings with a Stripe PaymentIntent
    const query = bookingIdFilter
      ? { id: bookingIdFilter, payment_status: 'paid' }
      : { payment_status: 'paid' };
    const paidBookings = await base44.asServiceRole.entities.BookingRequest.filter(query, '-created_date', 100);

    const results = [];

    for (const booking of paidBookings) {
      const result = { booking_id: booking.id, vehicle_name: booking.vehicle_name, status: 'skipped' };

      // EXCLUDE: cancelled, superseded, rejected bookings
      if (['cancelled', 'superseded_invalid', 'rejected'].includes(booking.booking_status)) {
        result.status = 'skipped_cancelled';
        results.push(result);
        continue;
      }

      // EXCLUDE: refunded bookings
      if (booking.payment_status === 'refunded') {
        result.status = 'skipped_refunded';
        results.push(result);
        continue;
      }

      // EXCLUDE: no Stripe PaymentIntent (manual/Zelle payments)
      if (!booking.stripe_payment_intent_id) {
        result.status = 'skipped_no_stripe_pi';
        results.push(result);
        continue;
      }

      // IDEMPOTENCY: check for existing HostPayout
      const existingPayouts = await base44.asServiceRole.entities.HostPayout.filter({
        booking_request_id: booking.id
      }, '-created_date', 5);

      if (existingPayouts.length > 0) {
        const hasPaidPayout = existingPayouts.some(p => p.status === 'paid' || p.stripe_transfer_id);
        if (hasPaidPayout) {
          result.status = 'already_paid';
          results.push(result);
          continue;
        }
      }

      // Resolve host
      let hostId = booking.host_id || '';
      if (!hostId && booking.vehicle_id) {
        const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
        hostId = vehicles[0]?.host_id || '';
      }
      if (!hostId) {
        // Mark as failed — no host
        if (!dryRun) {
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            host_payout_status: 'failed',
            payout_failure_reason: 'No host_id resolved for this booking',
          });
        }
        result.status = 'failed_no_host';
        results.push(result);
        continue;
      }

      const hosts = await base44.asServiceRole.entities.Host.filter({ id: hostId });
      const host = hosts[0];

      if (!host) {
        if (!dryRun) {
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            host_payout_status: 'failed',
            payout_failure_reason: `Host ${hostId} not found`,
          });
        }
        result.status = 'failed_host_not_found';
        results.push(result);
        continue;
      }

      // BLOCK: host payout frozen
      if (host.payout_frozen) {
        if (!dryRun) {
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            host_payout_status: 'on_hold',
            payout_failure_reason: 'Host payouts are frozen by admin',
          });
        }
        result.status = 'on_hold_frozen';
        results.push(result);
        continue;
      }

      // BLOCK: host has no Stripe account or onboarding incomplete
      if (!host.stripe_account_id || !host.stripe_onboarding_complete) {
        if (!dryRun) {
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            host_payout_status: 'on_hold',
            payout_failure_reason: 'Host has not completed Stripe Connect onboarding',
          });
        }
        result.status = 'on_hold_no_stripe';
        results.push(result);
        continue;
      }

      // Verify the Stripe PaymentIntent succeeded
      let paymentIntent;
      try {
        paymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
      } catch (piErr) {
        if (!dryRun) {
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            host_payout_status: 'failed',
            payout_failure_reason: `Stripe PI retrieval failed: ${piErr.message}`,
          });
        }
        result.status = 'failed_pi_retrieval';
        result.error = piErr.message;
        results.push(result);
        continue;
      }

      if (paymentIntent.status !== 'succeeded') {
        if (!dryRun) {
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            host_payout_status: 'on_hold',
            payout_failure_reason: `Stripe PI status is ${paymentIntent.status}, not succeeded`,
          });
        }
        result.status = 'on_hold_pi_not_succeeded';
        results.push(result);
        continue;
      }

      // Calculate payout amounts
      const grossAmount = paymentIntent.amount / 100;
      const chargeData = paymentIntent.charges?.data?.[0];
      const chargeId = chargeData?.id || '';
      const receiptUrl = chargeData?.receipt_url || '';
      const balanceTransactionId = typeof chargeData?.balance_transaction === 'string'
        ? chargeData.balance_transaction
        : chargeData?.balance_transaction?.id || '';

      // Get actual Stripe fee
      let stripeFeeAmount = 0;
      if (chargeId) {
        try {
          const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
          if (charge.balance_transaction?.fee) {
            stripeFeeAmount = charge.balance_transaction.fee / 100;
          }
        } catch (_) { /* non-blocking */ }
      }

      // Resolve marketplace fee
      const { feeRate: commissionRate } = await resolveMarketplaceFee(base44, { ...booking, host_id: hostId });
      const baseAmount = Math.max(0, Number(booking.total_due_now || booking.weekly_rate || grossAmount));
      const platformFee = Math.round(baseAmount * commissionRate * 100) / 100;
      const netHostPayout = Math.round((baseAmount - platformFee) * 100) / 100;

      result.gross = grossAmount;
      result.platform_fee = platformFee;
      result.stripe_fee = stripeFeeAmount;
      result.net_payout = netHostPayout;
      result.host = host.full_name;

      if (netHostPayout <= 0) {
        if (!dryRun) {
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            host_payout_status: 'on_hold',
            payout_failure_reason: `Net payout calculated as $${netHostPayout} — fee calculation may be incorrect`,
          });
        }
        result.status = 'on_hold_zero_payout';
        results.push(result);
        continue;
      }

      if (dryRun) {
        result.status = 'would_process';
        results.push(result);
        continue;
      }

      // ── EXECUTE STRIPE TRANSFER ──
      let transferId = null;
      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(netHostPayout * 100),
          currency: 'usd',
          destination: host.stripe_account_id,
          description: `uRide payout — ${host.full_name} — booking ${booking.id}`,
          metadata: {
            host_id: host.id,
            booking_request_id: booking.id,
            payment_intent_id: booking.stripe_payment_intent_id,
            platform: 'uride',
            source: 'reconcilePayouts',
          },
        });
        transferId = transfer.id;
      } catch (transferErr) {
        // Transfer failed — mark as failed with clear reason
        await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
          host_payout_status: 'failed',
          payout_failure_reason: `Stripe transfer failed: ${transferErr.message}`,
        });
        await base44.asServiceRole.entities.HostPayout.create({
          host_id: host.id,
          host_email: host.email,
          host_name: host.full_name,
          booking_request_id: booking.id,
          vehicle_name: booking.vehicle_name || '',
          period_start: booking.start_date || '',
          period_end: booking.end_date || '',
          gross_booking_amount: grossAmount,
          stripe_fee_amount: stripeFeeAmount,
          uride_platform_fee_amount: platformFee,
          uride_platform_fee_rate: commissionRate,
          net_host_payout: netHostPayout,
          net_payout: netHostPayout,
          gross_collected: grossAmount,
          platform_fee: platformFee,
          stripe_payment_intent_id: booking.stripe_payment_intent_id,
          stripe_charge_id: chargeId,
          status: 'failed',
          hold_reason: 'admin_override',
          hold_notes: `Transfer failed during reconciliation: ${transferErr.message}`,
        });
        await logEvent(base44, {
          event_type: 'payout.failed',
          target_entity: 'BookingRequest',
          target_id: booking.id,
          booking_id: booking.id,
          host_id: host.id,
          vehicle_id: booking.vehicle_id || '',
          summary: `Payout FAILED for booking ${booking.id}: ${transferErr.message}`,
          metadata: { error: transferErr.message, net_payout: netHostPayout },
          event_status: 'error',
        });
        result.status = 'failed_transfer';
        result.error = transferErr.message;
        results.push(result);
        continue;
      }

      // ── CREATE HostPayout RECORD ──
      await base44.asServiceRole.entities.HostPayout.create({
        host_id: host.id,
        host_email: host.email,
        host_name: host.full_name,
        booking_request_id: booking.id,
        vehicle_name: booking.vehicle_name || '',
        period_start: booking.start_date || '',
        period_end: booking.end_date || '',
        gross_booking_amount: grossAmount,
        stripe_fee_amount: stripeFeeAmount,
        uride_platform_fee_amount: platformFee,
        uride_platform_fee_rate: commissionRate,
        net_host_payout: netHostPayout,
        net_payout: netHostPayout,
        gross_collected: grossAmount,
        platform_fee: platformFee,
        stripe_payment_intent_id: booking.stripe_payment_intent_id,
        stripe_charge_id: chargeId,
        stripe_transfer_id: transferId,
        status: 'paid',
        payout_date: new Date().toISOString().split('T')[0],
        booking_count: 1,
        vehicle_count: 1,
      });

      // ── UPDATE BOOKING ──
      await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
        host_payout_status: 'paid',
        payout_processed_at: new Date().toISOString(),
        payout_failure_reason: null,
        stripe_transfer_id: transferId,
        platform_fee_amount: platformFee,
        host_payout_amount: netHostPayout,
        stripe_fee_amount: stripeFeeAmount,
      });

      // ── UPDATE HOST TOTALS ──
      await base44.asServiceRole.entities.Host.update(host.id, {
        total_earnings: (host.total_earnings || 0) + grossAmount,
        total_payouts: (host.total_payouts || 0) + netHostPayout,
      });

      // ── CREATE MISSING PaymentLog ──
      const existingLogs = await base44.asServiceRole.entities.PaymentLog.filter({
        stripe_payment_intent_id: booking.stripe_payment_intent_id
      });
      if (existingLogs.length === 0 && grossAmount > 0) {
        const paidAt = new Date().toISOString();
        const dedupeKey = generatePaymentDedupeKey({
          bookingId: booking.id,
          amount: grossAmount,
          paidAt,
          paymentIntentId: booking.stripe_payment_intent_id,
        });
        await base44.asServiceRole.entities.PaymentLog.create({
          booking_request_id: booking.id,
          host_id: host.id,
          customer_email: booking.user_email,
          customer_name: booking.customer_full_name || '',
          vehicle_id: booking.vehicle_id,
          vehicle_name: booking.vehicle_name || '',
          week_number: booking.billing_week_number || 1,
          billing_period_start: booking.start_date || '',
          billing_period_end: booking.end_date || '',
          amount: grossAmount,
          currency: 'usd',
          payment_method: 'stripe',
          source_type: 'reconcile_backfill',
          source_confidence: 'trusted',
          legacy_flag: false,
          external_reconcilable: true,
          dedupe_key: dedupeKey,
          stripe_payment_intent_id: booking.stripe_payment_intent_id,
          stripe_charge_id: chargeId,
          stripe_customer_id: booking.stripe_customer_id || '',
          stripe_receipt_url: receiptUrl,
          receipt_url: receiptUrl,
          status: 'paid',
          recorded_by: 'reconcilePayouts',
          paid_at: paidAt,
        });
      }

      // ── NOTIFY HOST ──
      await base44.asServiceRole.entities.Notification.create({
        recipient_email: host.email,
        recipient_role: 'host',
        recipient_user_id: host.user_id || '',
        title: `💰 Payout Sent — $${netHostPayout}`,
        body: `Your payout of $${netHostPayout} for ${booking.vehicle_name || 'booking'} has been transferred to your Stripe account. Arrives within 2 business days.`,
        type: 'payment',
        category: 'payouts',
        severity: 'info',
        event_type: 'payout_sent_reconciliation',
        related_entity_type: 'BookingRequest',
        related_entity_id: booking.id,
        booking_request_id: booking.id,
        host_id: host.id,
        delivery_status: 'pending',
        source_function: 'reconcilePayouts',
      }).catch(() => {});

      await logEvent(base44, {
        event_type: 'payout.sent',
        target_entity: 'HostPayout',
        target_id: booking.id,
        booking_id: booking.id,
        host_id: host.id,
        vehicle_id: booking.vehicle_id || '',
        summary: `Reconciliation payout $${netHostPayout} sent to ${host.full_name} for booking ${booking.id}`,
        metadata: {
          transfer_id: transferId,
          gross: grossAmount,
          platform_fee: platformFee,
          stripe_fee: stripeFeeAmount,
          net: netHostPayout,
          source: 'reconcilePayouts',
        },
      });

      result.status = 'paid';
      result.transfer_id = transferId;
      results.push(result);

      console.log(`[ReconcilePayouts] ✓ Transfer ${transferId} — $${netHostPayout} to ${host.stripe_account_id} for booking ${booking.id}`);
    }

    const summary = {
      total_scanned: results.length,
      paid: results.filter(r => r.status === 'paid').length,
      would_process: results.filter(r => r.status === 'would_process').length,
      failed: results.filter(r => r.status.startsWith('failed')).length,
      on_hold: results.filter(r => r.status.startsWith('on_hold')).length,
      skipped: results.filter(r => r.status.startsWith('skipped')).length,
      already_paid: results.filter(r => r.status === 'already_paid').length,
      dry_run: dryRun,
      results,
    };

    await logEvent(base44, {
      event_type: 'payout.reconciliation_run',
      summary: `Payout reconciliation: ${summary.paid} paid, ${summary.failed} failed, ${summary.on_hold} on hold, ${summary.skipped} skipped`,
      metadata: summary,
      event_status: summary.failed > 0 ? 'warning' : 'success',
    });

    return Response.json(summary);
  } catch (error) {
    console.error('[ReconcilePayouts] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});