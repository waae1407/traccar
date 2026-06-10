/**
 * backfillManualPaymentFees
 *
 * Admin-only function to retroactively create HostReceivable records for
 * manual payment PaymentLog entries that are missing platform fee receivables.
 *
 * CLASSIFICATION RULES (v2 — 2026-06-10):
 *   EXCLUDE (Stripe/uRide — fee already captured):
 *     - stripe_payment_intent_id present
 *     - stripe_charge_id present
 *     - payment_method = 'stripe'
 *     - source_type = 'stripe_webhook' or 'scheduled_billing' or 'grace_retry'
 *
 *   INCLUDE (manual — fee owed):
 *     - payment_method IN [zelle, cash, cashapp, venmo, check, wire, other]
 *     - AND source_type IN [admin_manual, backfill, manual_import, unknown]
 *     - AND no Stripe identifiers present
 *
 *   FLAG FOR REVIEW (do not auto-create receivable):
 *     - payment_method = 'other' AND source_type = 'unknown' AND no clear manual proof
 *     → adds to review_warnings list, skips receivable creation
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PLAN_FEE_DEFAULTS = {
  marketplace_partner:  { platform_fee_rate: 0.08, requires_platform_fee: true },
  hybrid_growth:        { platform_fee_rate: 0.04, requires_platform_fee: true },
  fleetos_professional: { platform_fee_rate: 0.00, requires_platform_fee: false },
};

const MANUAL_PAYMENT_METHODS = ['zelle', 'cash', 'cashapp', 'venmo', 'check', 'wire', 'other'];
const STRIPE_SOURCE_TYPES = ['stripe_webhook', 'scheduled_billing', 'grace_retry'];

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

  const requiresFee = planDefaults.requires_platform_fee && effectiveFeeRate > 0;
  const platformFeeAmountDue = requiresFee ? Math.round(gross * effectiveFeeRate * 100) / 100 : 0;
  const hostNetAfterFee = Math.round((gross - platformFeeAmountDue) * 100) / 100;

  return {
    platform_fee_rate: effectiveFeeRate,
    platform_fee_amount_due: platformFeeAmountDue,
    host_net_after_fee: hostNetAfterFee,
    requires_platform_fee: requiresFee,
    fee_collection_status: platformFeeAmountDue > 0 ? 'due' : 'not_applicable',
    plan_mode: normalizedPlan,
  };
}

/**
 * Determines if a PaymentLog is a Stripe/uRide payment (fee already captured).
 * Returns { is_stripe: true/false, reason: string }
 */
function classifyPaymentLog(log) {
  const method = (log.payment_method || '').toLowerCase();
  const sourceType = (log.source_type || '').toLowerCase();

  // Hard Stripe signals — unambiguous
  if (log.stripe_payment_intent_id) return { is_stripe: true, reason: 'stripe_payment_intent_id present' };
  if (log.stripe_charge_id) return { is_stripe: true, reason: 'stripe_charge_id present' };
  if (method === 'stripe') return { is_stripe: true, reason: 'payment_method=stripe' };
  if (STRIPE_SOURCE_TYPES.includes(sourceType)) return { is_stripe: true, reason: `source_type=${sourceType}` };

  // Clear manual signals
  const isManualMethod = MANUAL_PAYMENT_METHODS.includes(method) && method !== 'other';
  const isManualSource = ['admin_manual', 'manual_import'].includes(sourceType);

  if (isManualMethod) return { is_stripe: false, reason: `manual method: ${method}` };
  if (isManualSource) return { is_stripe: false, reason: `manual source: ${sourceType}` };

  // Ambiguous: method=other + source=unknown/backfill — flag for review, do not auto-create
  return {
    is_stripe: false,
    is_ambiguous: true,
    reason: `Ambiguous: method=${method}, source=${sourceType} — requires manual classification`,
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
      payment_log_ids = [],
      // Set true to also create receivables for ambiguous payments (requires explicit opt-in)
      include_ambiguous = false,
    } = body;

    if (!booking_request_id) {
      return Response.json({ error: 'booking_request_id is required' }, { status: 400 });
    }

    const bookingArr = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
    const booking = bookingArr[0];
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });

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

    const allLogs = await base44.asServiceRole.entities.PaymentLog.filter({ booking_request_id });
    const existingReceivables = await base44.asServiceRole.entities.HostReceivable.filter({ booking_request_id });
    const existingPaymentLogIds = new Set(existingReceivables.filter(r => r.status !== 'waived').map(r => r.payment_log_id).filter(Boolean));
    const existingDedupeKeys = new Set(existingReceivables.filter(r => r.status !== 'waived').map(r => r.dedupe_key).filter(Boolean));

    // Filter to paid logs in scope
    const candidateLogs = allLogs.filter(p => {
      if (p.status !== 'paid') return false;
      if (payment_log_ids.length > 0 && !payment_log_ids.includes(p.id)) return false;
      return true;
    });

    const results = [];
    const review_warnings = [];
    let totalFeeDue = 0;
    let created = 0;
    let skipped = 0;
    let stripe_excluded = 0;
    let ambiguous_flagged = 0;

    for (const log of candidateLogs) {
      const classification = classifyPaymentLog(log);

      // Exclude confirmed Stripe payments
      if (classification.is_stripe) {
        results.push({
          payment_log_id: log.id,
          week_number: log.week_number,
          amount: log.amount,
          payment_method: log.payment_method,
          source_type: log.source_type,
          action: 'excluded_stripe',
          reason: classification.reason,
        });
        stripe_excluded++;
        continue;
      }

      // Flag ambiguous payments for review — skip unless include_ambiguous=true
      if (classification.is_ambiguous && !include_ambiguous) {
        review_warnings.push({
          payment_log_id: log.id,
          week_number: log.week_number,
          amount: log.amount,
          payment_method: log.payment_method,
          source_type: log.source_type,
          warning: classification.reason,
          action_required: 'Admin must classify payment source before fee receivable can be created. Set include_ambiguous=true to override.',
        });
        ambiguous_flagged++;
        continue;
      }

      const dedupeKey = `manual_fee:${booking_request_id}:${log.id}`;

      // Skip if non-waived receivable already exists
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
          source_type: log.source_type,
          action: 'would_create',
          fee_resolution: feeResolution,
          dedupe_key: dedupeKey,
          classification_reason: classification.reason,
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
          description: `Platform fee (${(feeResolution.platform_fee_rate * 100).toFixed(0)}%) on $${log.amount} ${log.payment_method} payment — Week ${log.week_number} — ${booking.vehicle_name || ''}`,
          created_by_admin: user.email,
          dedupe_key: dedupeKey,
          created_at: new Date().toISOString(),
          offset_from_future_payouts: true,
          wallet_effect: 'debit',
          wallet_debit_amount: feeResolution.platform_fee_amount_due,
          currency: 'usd',
          notes: `Backfill by ${user.email}. Plan=${feeResolution.plan_mode}, rate=${feeResolution.platform_fee_rate}, gross=$${log.amount}, fee=$${feeResolution.platform_fee_amount_due}. Classification: ${classification.reason}`,
        });

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
      total_logs_evaluated: candidateLogs.length,
      stripe_excluded,
      ambiguous_flagged,
      manual_logs_eligible: candidateLogs.length - stripe_excluded - ambiguous_flagged,
      total_fee_due: totalFeeDue,
      created,
      skipped,
      results,
      review_warnings: review_warnings.length > 0 ? review_warnings : undefined,
      note: dry_run
        ? 'DRY RUN — no records created. Set dry_run=false to apply.'
        : `Created ${created} HostReceivable record(s) totaling $${totalFeeDue.toFixed(2)}.`,
    });
  } catch (error) {
    console.error('[backfillManualPaymentFees]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});