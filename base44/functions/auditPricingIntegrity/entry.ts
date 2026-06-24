import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PRICING_CANONICAL_VERSION = '2.0.0';

function validateCanonicalPrice(booking, chargedAmount, chargeContext) {
  chargeContext = chargeContext || 'total';
  if (!booking || !booking.start_date || !booking.end_date || !booking.weekly_rate) return { valid: true, canonical_amount: 0, charged_amount: Number(chargedAmount) || 0, overcharge_amount: 0, pricing_canonical_version: PRICING_CANONICAL_VERSION, issues: ['insufficient_data'] };
  var days = Math.max(1, Math.ceil((new Date(booking.end_date + 'T12:00:00') - new Date(booking.start_date + 'T12:00:00')) / 86400000));
  var wRate = Number(booking.weekly_rate) || 0, mRate = Number(booking.monthly_rate) || 0, dRate = Number(booking.daily_rate) || 0, charged = Number(chargedAmount) || 0;
  var canonical = 0;
  if (days >= 28 && booking.allow_monthly_booking && mRate) canonical = Math.ceil(days / 30) * mRate;
  else if (days >= 7 && booking.allow_weekly_booking !== false && wRate) canonical = Math.ceil(days / 7) * wRate;
  else if (booking.allow_daily_booking && dRate) canonical = days * dRate;
  else if (wRate) { canonical = wRate; }
  canonical = Math.round(canonical * 100) / 100;
  var issues = [], overcharge = 0;
  if (charged > 0) {
    if (chargeContext === 'per_week') {
      if (wRate > 0 && charged > wRate + 1) { overcharge = Math.round((charged - wRate) * 100) / 100; issues.push('OVERCHARGE: Weekly billing $' + charged + ' exceeds weekly rate $' + wRate + ' by $' + overcharge); }
      if (days > 1 && wRate > 0 && Math.abs(charged / days - wRate) < 0.01) { overcharge = Math.round((charged - canonical) * 100) / 100; issues.push('CRITICAL: Weekly rate ($' + wRate + ') used as daily rate for ' + days + ' days'); }
    } else if (chargeContext === 'admin_charge') {
      if (wRate > 0 && days > 1 && Math.abs(charged / days - wRate) < 0.01) { overcharge = Math.round((charged - canonical) * 100) / 100; issues.push('CRITICAL: Weekly rate ($' + wRate + ') used as daily rate for ' + days + ' days'); }
      if (days < 7 && wRate > 0 && charged > wRate + 1 && Math.abs(charged - wRate * days) < 1) { overcharge = Math.round((charged - wRate) * 100) / 100; issues.push('OVERCHARGE: $' + charged + ' for ' + days + ' days exceeds weekly rate $' + wRate); }
    } else {
      if (wRate && days > 1 && Math.abs(charged / days - wRate) < 0.01) { overcharge = Math.round((charged - canonical) * 100) / 100; issues.push('CRITICAL: Weekly rate ($' + wRate + ') used as daily rate for ' + days + ' days'); }
      if (days < 7 && wRate && charged > wRate + 1) { overcharge = Math.max(overcharge, Math.round((charged - wRate) * 100) / 100); issues.push('OVERCHARGE: $' + charged + ' for ' + days + ' days exceeds weekly rate $' + wRate); }
      if (days < 28 && mRate && charged > mRate + 1) { overcharge = Math.max(overcharge, Math.round((charged - mRate) * 100) / 100); issues.push('OVERCHARGE: $' + charged + ' exceeds monthly rate $' + mRate); }
      if (canonical > 0 && charged > canonical + 1) { overcharge = Math.max(overcharge, Math.round((charged - canonical) * 100) / 100); issues.push('MISMATCH: Charged $' + charged + ' vs canonical $' + canonical); }
    }
  }
  return { valid: issues.length === 0, canonical_amount: canonical, charged_amount: charged, overcharge_amount: overcharge, rental_days: days, pricing_canonical_version: PRICING_CANONICAL_VERSION, issues: issues };
}

/**
 * auditPricingIntegrity
 *
 * Scans ALL money paths for pricing violations:
 *   - active bookings (approved, confirmed, active, payment_due, grace_period, suspended)
 *   - paid bookings (payment_status = paid)
 *   - completed bookings (booking_status = completed, return_pending_host_review, etc.)
 *   - payment records (PaymentLog)
 *   - payout records (HostPayout)
 *
 * For each violation, creates a PricingAdjustment record and an operational alert.
 * Does NOT modify any booking totals — only flags for manual review.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const results = {
      bookings_checked: 0,
      bookings_violations: 0,
      payment_logs_checked: 0,
      payment_logs_violations: 0,
      payouts_checked: 0,
      payouts_violations: 0,
      pricing_adjustments_created: 0,
      violations: [],
    };

    // ── 1. SCAN ALL BOOKING STATUSES ──────────────────────────────────────
    const allStatuses = [
      'active', 'approved', 'confirmed', 'payment_due', 'grace_period', 'suspended',
      'return_pending_host_review', 'under_review', 'pending_payment',
      'completed', 'cancelled', 'rejected'
    ];
    const allBookings = [];
    for (const status of allStatuses) {
      const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ booking_status: status }, '-updated_date', 500);
      allBookings.push(...bookings);
    }

    for (const booking of allBookings) {
      results.bookings_checked++;
      if (!booking.weekly_rate || !booking.start_date || !booking.end_date) continue;

      const chargedAmount = booking.total_due_now || booking.first_payment_amount || 0;
      if (!chargedAmount) continue;

      const pricingResult = validateCanonicalPrice(booking, chargedAmount, 'total');
      if (!pricingResult.valid && pricingResult.overcharge_amount > 0) {
        results.bookings_violations++;
        results.violations.push({
          type: 'booking',
          booking_id: booking.id,
          vehicle_name: booking.vehicle_name,
          user_email: booking.user_email,
          charged_amount: pricingResult.charged_amount,
          canonical_amount: pricingResult.canonical_amount,
          overcharge_amount: pricingResult.overcharge_amount,
          issues: pricingResult.issues,
        });

        // Create PricingAdjustment record (idempotent — check for existing)
        const existing = await base44.asServiceRole.entities.PricingAdjustment.filter({
          booking_request_id: booking.id,
          adjustment_type: 'overcharge_refund',
          detected_by: 'auditPricingIntegrity',
        });
        if (existing.length === 0) {
          await base44.asServiceRole.entities.PricingAdjustment.create({
            booking_request_id: booking.id,
            vehicle_id: booking.vehicle_id || '',
            host_id: booking.host_id || '',
            user_email: booking.user_email || '',
            vehicle_name: booking.vehicle_name || '',
            adjustment_type: 'overcharge_refund',
            original_amount: pricingResult.charged_amount,
            corrected_amount: pricingResult.canonical_amount,
            overcharge_amount: pricingResult.overcharge_amount,
            reason: pricingResult.issues.join('; '),
            stripe_payment_intent_id: booking.stripe_payment_intent_id || '',
            manual_refund_required: true,
            refund_status: booking.payment_status === 'paid' ? 'pending' : 'not_required',
            payout_correction_required: booking.payment_status === 'paid',
            audit_note: `Detected by auditPricingIntegrity scan — booking status: ${booking.booking_status}, payment_status: ${booking.payment_status}. Booking total NOT modified — manual review required.`,
            detected_by: 'auditPricingIntegrity',
            pricing_canonical_version: PRICING_CANONICAL_VERSION,
            detected_at: now,
          }).catch(e => console.error('[Audit] PricingAdjustment create failed:', e.message));
          results.pricing_adjustments_created++;
        }

        // Create operational alert
        await base44.asServiceRole.functions.invoke('createPaymentOperationalAlert', {
          alert_type: 'unknown_billing_context',
          severity: 'critical',
          billing_context: 'rental_payment',
          booking_id: booking.id,
          host_id: booking.host_id || '',
          customer_id: booking.user_id || '',
          renter_email: booking.user_email || '',
          vehicle_id: booking.vehicle_id || '',
          related_entity_type: 'BookingRequest',
          related_entity_id: booking.id,
          title: `Pricing Overcharge Detected: ${booking.vehicle_name || booking.id}`,
          message: pricingResult.issues.join('; '),
          recommended_action: `Review booking ${booking.id} and issue refund if customer was overcharged. Corrected amount: $${pricingResult.canonical_amount}. Booking total NOT modified — manual review required.`,
          financial_impact_amount: pricingResult.overcharge_amount,
          currency: 'usd',
          source: 'auditPricingIntegrity',
        }).catch(() => {});
      }
    }

    // ── 2. SCAN PAYMENT LOGS ──────────────────────────────────────────────
    const paymentLogs = await base44.asServiceRole.entities.PaymentLog.list('-created_date', 500);
    for (const pLog of paymentLogs) {
      results.payment_logs_checked++;
      if (!pLog.booking_request_id || !pLog.amount) continue;

      // Fetch the booking for this payment log
      const plBookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: pLog.booking_request_id });
      const plBooking = plBookings[0];
      if (!plBooking?.start_date || !plBooking?.end_date || !plBooking?.weekly_rate) continue;

      // Skip non-rental payment logs (tolls, fees, etc.)
      if (pLog.source_type === 'admin_manual' && pLog.notes && /toll|key fee/i.test(pLog.notes)) continue;

      const plResult = validateCanonicalPrice(plBooking, pLog.amount, pLog.week_number > 0 ? 'per_week' : 'total');
      if (!plResult.valid && plResult.overcharge_amount > 0) {
        results.payment_logs_violations++;
        results.violations.push({
          type: 'payment_log',
          payment_log_id: pLog.id,
          booking_id: pLog.booking_request_id,
          charged_amount: plResult.charged_amount,
          canonical_amount: plResult.canonical_amount,
          overcharge_amount: plResult.overcharge_amount,
          issues: plResult.issues,
        });

        // Create PricingAdjustment with Stripe charge ID
        const existingPL = await base44.asServiceRole.entities.PricingAdjustment.filter({
          booking_request_id: pLog.booking_request_id,
          stripe_charge_id: pLog.stripe_charge_id || '',
          detected_by: 'auditPricingIntegrity',
        });
        if (existingPL.length === 0) {
          await base44.asServiceRole.entities.PricingAdjustment.create({
            booking_request_id: pLog.booking_request_id,
            vehicle_id: plBooking.vehicle_id || '',
            host_id: plBooking.host_id || '',
            user_email: plBooking.user_email || '',
            vehicle_name: plBooking.vehicle_name || pLog.vehicle_name || '',
            adjustment_type: 'overcharge_refund',
            original_amount: plResult.charged_amount,
            corrected_amount: plResult.canonical_amount,
            overcharge_amount: plResult.overcharge_amount,
            reason: plResult.issues.join('; '),
            stripe_charge_id: pLog.stripe_charge_id || '',
            stripe_payment_intent_id: pLog.stripe_payment_intent_id || '',
            manual_refund_required: true,
            refund_status: 'pending',
            audit_note: `Detected by auditPricingIntegrity payment log scan — week ${pLog.week_number}, payment_log ${pLog.id}. Stripe refund may be required.`,
            detected_by: 'auditPricingIntegrity',
            pricing_canonical_version: PRICING_CANONICAL_VERSION,
            detected_at: now,
          }).catch(e => console.error('[Audit] PaymentLog PricingAdjustment create failed:', e.message));
          results.pricing_adjustments_created++;
        }
      }
    }

    // ── 3. SCAN PAYOUT RECORDS ────────────────────────────────────────────
    const payouts = await base44.asServiceRole.entities.HostPayout.list('-updated_date', 500);
    for (const payout of payouts) {
      results.payouts_checked++;
      if (!payout.booking_request_id || !payout.gross_booking_amount) continue;

      const poBookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: payout.booking_request_id });
      const poBooking = poBookings[0];
      if (!poBooking?.start_date || !poBooking?.end_date || !poBooking?.weekly_rate) continue;

      const poResult = validateCanonicalPrice(poBooking, payout.gross_booking_amount, 'total');
      if (!poResult.valid && poResult.overcharge_amount > 0) {
        results.payouts_violations++;
        results.violations.push({
          type: 'payout',
          payout_id: payout.id,
          booking_id: payout.booking_request_id,
          gross_amount: payout.gross_booking_amount,
          canonical_amount: poResult.canonical_amount,
          overcharge_amount: poResult.overcharge_amount,
          issues: poResult.issues,
        });

        // Create PricingAdjustment with payout correction fields
        const existingPO = await base44.asServiceRole.entities.PricingAdjustment.filter({
          booking_request_id: payout.booking_request_id,
          adjustment_type: 'payout_correction',
          detected_by: 'auditPricingIntegrity',
        });
        if (existingPO.length === 0) {
          const feeRate = payout.uride_platform_fee_rate || 0.08;
          await base44.asServiceRole.entities.PricingAdjustment.create({
            booking_request_id: payout.booking_request_id,
            vehicle_id: poBooking.vehicle_id || '',
            host_id: payout.host_id,
            user_email: poBooking.user_email || '',
            vehicle_name: poBooking.vehicle_name || payout.vehicle_name || '',
            adjustment_type: 'payout_correction',
            original_amount: poResult.charged_amount,
            corrected_amount: poResult.canonical_amount,
            overcharge_amount: poResult.overcharge_amount,
            reason: poResult.issues.join('; '),
            stripe_payment_intent_id: payout.stripe_payment_intent_id || '',
            payout_correction_required: true,
            original_platform_fee: payout.uride_platform_fee_amount || 0,
            corrected_platform_fee: Math.round(poResult.canonical_amount * feeRate * 100) / 100,
            original_host_payout: payout.net_host_payout || payout.net_payout || 0,
            corrected_host_payout: Math.round((poResult.canonical_amount - (payout.uride_platform_fee_amount || 0)) * 100) / 100,
            manual_refund_required: true,
            refund_status: 'pending',
            audit_note: `Detected by auditPricingIntegrity payout scan — payout ${payout.id}, status ${payout.status}. Payout correction required if host was overpaid.`,
            detected_by: 'auditPricingIntegrity',
            pricing_canonical_version: PRICING_CANONICAL_VERSION,
            detected_at: now,
          }).catch(e => console.error('[Audit] Payout PricingAdjustment create failed:', e.message));
          results.pricing_adjustments_created++;
        }
      }
    }

    // ── 4. SEND SUMMARY NOTIFICATION ──────────────────────────────────────
    if (results.bookings_violations > 0 || results.payment_logs_violations > 0 || results.payouts_violations > 0) {
      await base44.asServiceRole.functions.invoke('sendCriticalNotification', {
        title: `Pricing Integrity Audit — ${results.bookings_violations + results.payment_logs_violations + results.payouts_violations} Violations Found`,
        body: `Audit scanned ${results.bookings_checked} bookings, ${results.payment_logs_checked} payment logs, ${results.payouts_checked} payouts.\n\nViolations:\n- Bookings: ${results.bookings_violations}\n- Payment logs: ${results.payment_logs_violations}\n- Payouts: ${results.payouts_violations}\n\n${results.pricing_adjustments_created} PricingAdjustment records created for manual review.\n\nNo booking totals were modified.`,
        category: 'payments',
        severity: 'critical',
        action_url: '/admin/payment-alerts',
      }).catch(() => {});
    }

    console.log(`[Pricing Audit] Bookings: ${results.bookings_checked} checked, ${results.bookings_violations} violations | PaymentLogs: ${results.payment_logs_checked} checked, ${results.payment_logs_violations} violations | Payouts: ${results.payouts_checked} checked, ${results.payouts_violations} violations | ${results.pricing_adjustments_created} adjustments created`);

    return Response.json({
      ...results,
      audit_complete: true,
      audited_at: now,
    });
  } catch (error) {
    console.error('[auditPricingIntegrity] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});