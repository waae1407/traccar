/**
 * backfillManualPaymentFees
 *
 * Admin-only function to retroactively create HostReceivable records for
 * manual payment PaymentLog entries that are missing platform fee receivables.
 *
 * Specifically designed for Ahmed Adam booking backfill:
 * Booking ID: 69f804f44d48ee9b0a84866f
 * Weeks 3-6 manual Zelle payments
 *
 * Also supports general backfill mode for any booking or host.
 *
 * Uses the canonical resolvePlatformFee service — same logic as adminPaymentAction.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Inline canonical fee resolver (mirrors lib/platformFeeResolver.js)
const PLAN_FEE_DEFAULTS = {
  marketplace_partner:  { platform_fee_rate: 0.08, requires_platform_fee: true },
  hybrid_growth:        { platform_fee_rate: 0.04, requires_platform_fee: true },
  fleetos_professional: { platform_fee_rate: 0.00, requires_platform_fee: false },
};
const MANUAL_PAYMENT_METHODS = ['zelle', 'cash', 'cashapp', 'venmo', 'check', 'other'];

function resolvePlatformFee({ planMode, grossAmount, paymentMethod = 'stripe', operatorPlan = null, commerceProfile = null }) {
  const gross = Number(grossAmount) || 0;
  let normalizedPlan = planMode;
  if (!normalizedPlan || normalizedPlan === 'none' || !PLAN_FEE_DEFAULTS[normalizedPlan]) {
    normalizedPlan = operatorPlan?.active_mode || operatorPlan?.selected_mode;
  }
  if (!normalizedPlan || normalizedPlan === 'none' || !PLAN_FEE_DEFAULTS[normalizedPlan]) {
    normalizedPlan = commerceProfile?.plan_type;
  }
  if (!normalizedPlan || !PLAN_FEE_DEFAULTS[normalizedPlan]) normalizedPlan = 'marketplace_partner';

  const planDefaults = PLAN_FEE_DEFAULTS[normalizedPlan];
  let effectiveFeeRate = planDefaults.platform_fee_rate;
  if (operatorPlan?.marketplace_fee_rate != null && operatorPlan.marketplace_fee_rate >= 0) {
    effectiveFeeRate = operatorPlan.marketplace_fee_rate;
  } else if (commerceProfile?.commission_rate != null && commerceProfile.commission_rate >= 0) {
    effectiveFeeRate = commerceProfile.commission_rate;
  }

  const isManual = MANUAL_PAYMENT_METHODS.includes((paymentMethod || '').toLowerCase());
  const requiresFee = planDefaults.requires_platform_fee && effectiveFeeRate > 0;
  const platformFeeAmountDue = requiresFee ? Math.round(gross * effectiveFeeRate * 100) / 100 : 0;
  const hostNetAfterFee = Math.round((gross - platformFeeAmountDue) * 100) / 100;

  return {
    platform_fee_rate: effectiveFeeRate,
    platform_fee_amount_due: platformFeeAmountDue,
    host_net_after_fee: hostNetAfterFee,
    requires_platform_fee: requiresFee,
    fee_collection_status: platformFeeAmountDue > 0 ? 'due' : 'not_applicable',
    manual_collection_requires_platform_fee: isManual && requiresFee,
    is_manual_payment: isManual,
    plan_mode: normalizedPlan,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const {
      booking_request_id,
      dry_run = true,
      // Optional: force specific payment log IDs (otherwise auto-detects manual logs)
      payment_log_ids = [],
    } = body;

    if (!booking_request_id) {
      return Response.json({ error: 'booking_request_id is required' }, { status: 400 });
    }

    // Load booking
    const bookingArr = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
    const booking = bookingArr[0];
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });

    // Load host plan + commerce profile
    const [hostPlanArr, commerceProfileArr] = await Promise.all([
      booking.host_id
        ? base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id: booking.host_id }, '-updated_date', 1)
        : Promise.resolve([]),
      booking.host_id
        ? base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id: booking.host_id }, '-updated_date', 1)
        : Promise.resolve([]),
    ]);
    const hostPlan = hostPlanArr[0] || null;
    const commerceProfile = commerceProfileArr[0] || null;

    // Load all PaymentLogs for this booking
    const allLogs = await base44.asServiceRole.entities.PaymentLog.filter({ booking_request_id });

    // Load existing receivables for this booking (for dedup check)
    const existingReceivables = await base44.asServiceRole.entities.HostReceivable.filter({ booking_request_id });
    const existingPaymentLogIds = new Set(existingReceivables.map(r => r.payment_log_id).filter(Boolean));
    const existingDedupeKeys = new Set(existingReceivables.map(r => r.dedupe_key).filter(Boolean));

    // Filter to manual payment logs only, skip Stripe (Week 1 etc)
    const manualLogs = allLogs.filter(p => {
      if (payment_log_ids.length > 0 && !payment_log_ids.includes(p.id)) return false;
      return p.status === 'paid' && MANUAL_PAYMENT_METHODS.includes((p.payment_method || '').toLowerCase());
    });

    const results = [];
    let totalFeeDue = 0;
    let created = 0;
    let skipped = 0;

    for (const log of manualLogs) {
      const dedupeKey = `manual_fee:${booking_request_id}:${log.id}`;

      // Skip if receivable already exists for this payment log
      if (existingPaymentLogIds.has(log.id) || existingDedupeKeys.has(dedupeKey)) {
        results.push({
          payment_log_id: log.id,
          week_number: log.week_number,
          amount: log.amount,
          payment_method: log.payment_method,
          action: 'skipped',
          reason: 'HostReceivable already exists for this payment log',
        });
        skipped++;
        continue;
      }

      const feeResolution = resolvePlatformFee({
        planMode: hostPlan?.active_mode || hostPlan?.selected_mode,
        grossAmount: log.amount,
        paymentMethod: log.payment_method,
        operatorPlan: hostPlan,
        commerceProfile,
      });

      if (feeResolution.platform_fee_amount_due <= 0) {
        results.push({
          payment_log_id: log.id,
          week_number: log.week_number,
          amount: log.amount,
          payment_method: log.payment_method,
          action: 'skipped',
          reason: `No fee due — plan: ${feeResolution.plan_mode}, rate: ${feeResolution.platform_fee_rate}`,
          fee_resolution: feeResolution,
        });
        skipped++;
        continue;
      }

      totalFeeDue += feeResolution.platform_fee_amount_due;

      if (dry_run) {
        results.push({
          payment_log_id: log.id,
          week_number: log.week_number,
          amount: log.amount,
          payment_method: log.payment_method,
          action: 'would_create',
          fee_resolution: feeResolution,
          dedupe_key: dedupeKey,
        });
      } else {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);

        const receivable = await base44.asServiceRole.entities.HostReceivable.create({
          host_id: booking.host_id || '',
          booking_request_id,
          vehicle_id: booking.vehicle_id || '',
          customer_email: booking.user_email || '',
          payment_log_id: log.id,
          receivable_type: 'manual_payment_fee',
          source_payment_type: 'manual_payment',
          payment_method: log.payment_method,
          gross_collected_amount: log.amount,
          platform_fee_rate: feeResolution.platform_fee_rate,
          platform_fee_amount_due: feeResolution.platform_fee_amount_due,
          host_net_after_fee: feeResolution.host_net_after_fee,
          plan_mode: feeResolution.plan_mode,
          original_amount: feeResolution.platform_fee_amount_due,
          remaining_amount: feeResolution.platform_fee_amount_due,
          recovered_amount: 0,
          status: 'open',
          due_date: dueDate.toISOString().slice(0, 10),
          description: `Backfill: Platform fee (${(feeResolution.platform_fee_rate * 100).toFixed(0)}%) on $${log.amount} ${log.payment_method} payment — Week ${log.week_number} — ${booking.vehicle_name || ''}`,
          created_by_admin: user.email,
          dedupe_key: dedupeKey,
          created_at: new Date().toISOString(),
          offset_from_future_payouts: true,
          currency: 'usd',
          notes: `Backfill by ${user.email} for booking ${booking_request_id}. Canonical fee resolver: plan=${feeResolution.plan_mode}, rate=${feeResolution.platform_fee_rate}, gross=$${log.amount}, fee_due=$${feeResolution.platform_fee_amount_due}`,
        });

        // Also update the PaymentLog to stamp fee fields if missing
        if (!log.platform_fee_rate) {
          await base44.asServiceRole.entities.PaymentLog.update(log.id, {
            platform_fee_rate: feeResolution.platform_fee_rate,
            platform_fee_amount_due: feeResolution.platform_fee_amount_due,
            host_net_after_platform_fee: feeResolution.host_net_after_fee,
            platform_fee_collection_status: 'due',
            manual_collection_requires_platform_fee: true,
            plan_mode_at_payment: feeResolution.plan_mode,
          }).catch(e => console.warn('[backfill] PaymentLog update failed:', e.message));
        }

        results.push({
          payment_log_id: log.id,
          week_number: log.week_number,
          amount: log.amount,
          payment_method: log.payment_method,
          action: 'created',
          receivable_id: receivable.id,
          fee_resolution: feeResolution,
          dedupe_key: dedupeKey,
        });
        created++;
      }
    }

    return Response.json({
      ok: true,
      dry_run,
      booking_request_id,
      host_id: booking.host_id,
      customer_email: booking.user_email,
      vehicle_name: booking.vehicle_name,
      plan_mode: hostPlan?.active_mode || hostPlan?.selected_mode || 'marketplace_partner (default)',
      manual_logs_found: manualLogs.length,
      stripe_logs_excluded: allLogs.filter(p => p.payment_method === 'stripe').length,
      total_fee_due: totalFeeDue,
      created,
      skipped,
      results,
      note: dry_run
        ? 'DRY RUN — no records created. Set dry_run=false to apply.'
        : `Created ${created} HostReceivable record(s) totaling $${totalFeeDue.toFixed(2)} in platform fees due.`,
    });
  } catch (error) {
    console.error('[backfillManualPaymentFees]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});