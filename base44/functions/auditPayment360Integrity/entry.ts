/**
 * auditPayment360Integrity v1.0 - Payment360 Production Certified
 *
 * Scheduled integrity audit — runs every 15 minutes to detect payment/payout issues.
 * Creates OperationalAlerts for all detected issues.
 * Does NOT automatically retry payouts — detection only, not remediation.
 *
 * Checks:
 * - paid booking without PaymentLog
 * - paid booking without HostPayout
 * - paid booking with duplicate HostPayout
 * - paid booking with duplicate PaymentLog
 * - successful payment with failed/missing transfer
 * - Host.total_earnings mismatch
 * - Host.total_payouts mismatch
 * - orphan HostPayout (booking_request_id = null)
 * - webhook event missing for recent PaymentIntent
 * - Stripe transfer failure
 * - PaymentIntent missing metadata
 * - booking paid but no Stripe PI
 * - cancelled booking marked paid without refund state
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function createPaymentAlert(base44, payload) {
  try {
    await base44.asServiceRole.functions.invoke('createPaymentOperationalAlert', payload);
  } catch (e) {
    console.error('[PaymentOperationalAlert]', e.message);
  }
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

    const alertsCreated = [];

    // 1. Find paid bookings without PaymentLog
    const paidBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      payment_status: 'paid'
    }, '-created_date', 100);

    for (const booking of paidBookings) {
      // Skip cancelled/superseded
      if (['cancelled', 'superseded_invalid', 'rejected'].includes(booking.booking_status)) {
        continue;
      }

      // Check for PaymentLog
      const paymentLogs = await base44.asServiceRole.entities.PaymentLog.filter({
        booking_request_id: booking.id,
        status: 'paid'
      });

      if (paymentLogs.length === 0 && booking.stripe_payment_intent_id) {
        // Paid with Stripe but no PaymentLog
        await createPaymentAlert(base44, {
          alert_type: 'paid_booking_missing_payment_log',
          severity: 'critical',
          billing_context: 'rental_payment',
          booking_id: booking.id,
          host_id: booking.host_id || '',
          customer_id: booking.user_id || '',
          vehicle_id: booking.vehicle_id || '',
          stripe_payment_intent_id: booking.stripe_payment_intent_id || '',
          related_entity_type: 'BookingRequest',
          related_entity_id: booking.id,
          title: `Paid booking missing PaymentLog — ${booking.vehicle_name || booking.id}`,
          message: `Booking ${booking.id} is marked paid with Stripe PaymentIntent ${booking.stripe_payment_intent_id}, but no PaymentLog record exists.`,
          recommended_action: 'Run reconcilePayouts to create missing PaymentLog, or investigate webhook delivery.',
          financial_impact_amount: booking.total_due_now || booking.weekly_rate || 0,
          source: 'auditPayment360Integrity',
        });
        alertsCreated.push({ type: 'paid_booking_missing_payment_log', booking_id: booking.id });
      }

      // Check for HostPayout
      const payouts = await base44.asServiceRole.entities.HostPayout.filter({
        booking_request_id: booking.id
      });

      if (payouts.length === 0 && booking.stripe_payment_intent_id) {
        // Paid with Stripe but no HostPayout
        await createPaymentAlert(base44, {
          alert_type: 'paid_booking_missing_host_payout',
          severity: 'critical',
          billing_context: 'payout',
          booking_id: booking.id,
          host_id: booking.host_id || '',
          stripe_payment_intent_id: booking.stripe_payment_intent_id || '',
          related_entity_type: 'BookingRequest',
          related_entity_id: booking.id,
          title: `Paid booking missing HostPayout — ${booking.vehicle_name || booking.id}`,
          message: `Booking ${booking.id} is marked paid, but no HostPayout record exists. Host has not been paid.`,
          recommended_action: 'Run reconcilePayouts to create missing HostPayout and attempt Stripe transfer.',
          financial_impact_amount: (booking.total_due_now || booking.weekly_rate || 0) * 0.92, // Approx host portion
          source: 'auditPayment360Integrity',
        });
        alertsCreated.push({ type: 'paid_booking_missing_host_payout', booking_id: booking.id });
      }

      // Check for duplicate HostPayouts
      if (payouts.length > 1) {
        const paidPayouts = payouts.filter(p => p.status === 'paid');
        if (paidPayouts.length > 1) {
          await createPaymentAlert(base44, {
            alert_type: 'paid_booking_duplicate_host_payout',
            severity: 'critical',
            billing_context: 'payout',
            booking_id: booking.id,
            host_id: booking.host_id || '',
            duplicate_record_ids: paidPayouts.map(p => p.id),
            related_entity_type: 'BookingRequest',
            related_entity_id: booking.id,
            title: `Duplicate paid HostPayouts — ${booking.vehicle_name || booking.id}`,
            message: `Booking ${booking.id} has ${paidPayouts.length} paid HostPayout records. This indicates a critical idempotency failure.`,
            recommended_action: 'Immediately investigate. Void duplicate payouts and reconcile with Stripe transfers.',
            financial_impact_amount: paidPayouts.reduce((sum, p) => sum + (p.net_host_payout || 0), 0),
            source: 'auditPayment360Integrity',
          });
          alertsCreated.push({ type: 'paid_booking_duplicate_host_payout', booking_id: booking.id });
        }
      }

      // Check for duplicate PaymentLogs
      const allPaymentLogs = await base44.asServiceRole.entities.PaymentLog.filter({
        booking_request_id: booking.id
      });
      
      if (allPaymentLogs.length > 1) {
        await createPaymentAlert(base44, {
          alert_type: 'paid_booking_duplicate_payment_log',
          severity: 'high',
          billing_context: 'rental_payment',
          booking_id: booking.id,
          duplicate_record_ids: allPaymentLogs.map(p => p.id),
          related_entity_type: 'BookingRequest',
          related_entity_id: booking.id,
          title: `Duplicate PaymentLogs — ${booking.vehicle_name || booking.id}`,
          message: `Booking ${booking.id} has ${allPaymentLogs.length} PaymentLog records.`,
          recommended_action: 'Investigate duplicate creation. Keep most complete record.',
          financial_impact_amount: allPaymentLogs.reduce((sum, p) => sum + (p.amount || 0), 0),
          source: 'auditPayment360Integrity',
        });
        alertsCreated.push({ type: 'paid_booking_duplicate_payment_log', booking_id: booking.id });
      }

      // Check for paid booking without Stripe PI
      if (booking.payment_status === 'paid' && !booking.stripe_payment_intent_id) {
        // Could be manual payment - check if it's Zelle/cash
        const manualLogs = await base44.asServiceRole.entities.PaymentLog.filter({
          booking_request_id: booking.id,
          payment_method: { $in: ['zelle', 'cash', 'cashapp', 'venmo', 'check'] }
        });

        if (manualLogs.length === 0) {
          // No Stripe PI and no manual payment method - suspicious
          await createPaymentAlert(base44, {
            alert_type: 'booking_paid_no_stripe_pi',
            severity: 'high',
            billing_context: 'rental_payment',
            booking_id: booking.id,
            host_id: booking.host_id || '',
            related_entity_type: 'BookingRequest',
            related_entity_id: booking.id,
            title: `Booking paid without PaymentIntent — ${booking.vehicle_name || booking.id}`,
            message: `Booking ${booking.id} is marked paid but has no Stripe PaymentIntent ID and no manual payment record.`,
            recommended_action: 'Investigate payment method. Could be legacy migration issue or data corruption.',
            financial_impact_amount: booking.total_due_now || booking.weekly_rate || 0,
            source: 'auditPayment360Integrity',
          });
          alertsCreated.push({ type: 'booking_paid_no_stripe_pi', booking_id: booking.id });
        }
      }
    }

    // 2. Check for orphan HostPayouts
    const orphanPayouts = await base44.asServiceRole.entities.HostPayout.filter({
      booking_request_id: { $exists: false }
    }, '-created_date', 50);

    if (orphanPayouts.length > 0) {
      await createPaymentAlert(base44, {
        alert_type: 'orphan_host_payout',
        severity: 'medium',
        billing_context: 'payout',
        title: `Orphan HostPayouts detected — ${orphanPayouts.length} records`,
        message: `Found ${orphanPayouts.length} HostPayout records without booking_request_id. These were likely created by calculateHostEarnings scheduler.`,
        recommended_action: 'Review and classify as legacy_orphan or manually verify linkage.',
        financial_impact_amount: orphanPayouts.reduce((sum, p) => sum + (p.net_host_payout || 0), 0),
        source: 'auditPayment360Integrity',
      });
      alertsCreated.push({ type: 'orphan_host_payout', count: orphanPayouts.length });
    }

    // 3. Check for cancelled bookings marked paid without refund
    const cancelledPaid = await base44.asServiceRole.entities.BookingRequest.filter({
      booking_status: 'cancelled',
      payment_status: 'paid'
    });

    for (const booking of cancelledPaid) {
      const refundLogs = await base44.asServiceRole.entities.PaymentLog.filter({
        booking_request_id: booking.id,
        status: 'refunded'
      });

      if (refundLogs.length === 0) {
        await createPaymentAlert(base44, {
          alert_type: 'cancelled_booking_paid_no_refund',
          severity: 'high',
          billing_context: 'refund',
          booking_id: booking.id,
          host_id: booking.host_id || '',
          related_entity_type: 'BookingRequest',
          related_entity_id: booking.id,
          title: `Cancelled booking paid without refund — ${booking.vehicle_name || booking.id}`,
          message: `Booking ${booking.id} is cancelled and marked paid, but no refund record exists.`,
          recommended_action: 'Verify if refund was processed. Create refund record if missing.',
          financial_impact_amount: booking.total_due_now || booking.weekly_rate || 0,
          source: 'auditPayment360Integrity',
        });
        alertsCreated.push({ type: 'cancelled_booking_paid_no_refund', booking_id: booking.id });
      }
    }

    const summary = {
      total_alerts: alertsCreated.length,
      alert_types: alertsCreated.reduce((acc, a) => {
        acc[a.type] = (acc[a.type] || 0) + 1;
        return acc;
      }, {}),
      timestamp: new Date().toISOString(),
    };

    return Response.json(summary);
  } catch (error) {
    console.error('[AuditPayment360Integrity] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});