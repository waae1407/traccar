import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { date_from, date_to, host_id: filterHostId } = body;

    const [paymentLogs, payouts, bookings, subscriptions, disputes, receivables, alerts] = await Promise.all([
      base44.asServiceRole.entities.PaymentLog.list('-paid_at', 5000),
      base44.asServiceRole.entities.HostPayout.list('-created_date', 5000),
      base44.asServiceRole.entities.BookingRequest.list('-updated_date', 5000),
      base44.asServiceRole.entities.HostPlatformSubscription.list('-updated_date', 500),
      base44.asServiceRole.entities.Dispute.list('-created_date', 500),
      base44.asServiceRole.entities.HostReceivable.list('-created_date', 500),
      base44.asServiceRole.entities.PaymentOperationalAlert.list('-created_date', 500),
    ]);

    function inRange(dateStr) {
      if (!dateStr) return true;
      if (date_from && dateStr < date_from) return false;
      if (date_to && dateStr > date_to + 'T23:59:59') return false;
      return true;
    }

    const scopedLogs = paymentLogs.filter(p => (!filterHostId || p.host_id === filterHostId) && inRange(p.paid_at || p.created_date));
    const scopedPayouts = payouts.filter(p => (!filterHostId || p.host_id === filterHostId) && inRange(p.payout_date || p.created_date));
    const scopedBookings = bookings.filter(b => !filterHostId || b.host_id === filterHostId);
    const scopedSubscriptions = filterHostId ? subscriptions.filter(s => s.host_id === filterHostId) : subscriptions;

    const paidLogs = scopedLogs.filter(p => p.status === 'paid');
    const failedLogs = scopedLogs.filter(p => p.status === 'failed');

    // GMV — canonical: PaymentLog paid
    const gmv = paidLogs.reduce((s, p) => s + (p.amount || 0), 0);

    // Commission — canonical: HostPayout.uride_platform_fee_amount
    const totalPlatformFees = scopedPayouts.reduce((s, p) => s + (p.uride_platform_fee_amount || p.platform_fee || 0), 0);
    const totalStripeFees = scopedPayouts.reduce((s, p) => s + (p.stripe_fee_amount || 0), 0);

    // Commission by plan type — derive from booking metadata
    const marketplacePayouts = scopedPayouts.filter(p => (p.uride_platform_fee_rate || 0) >= 0.07);
    const hybridPayouts = scopedPayouts.filter(p => { const r = p.uride_platform_fee_rate || 0; return r > 0 && r < 0.07; });
    const fleetOSLogs = paidLogs.filter(p => {
      const b = bookings.find(bk => bk.id === p.booking_request_id);
      return b?.booking_source === 'direct';
    });

    const marketplaceCommission = marketplacePayouts.reduce((s, p) => s + (p.uride_platform_fee_amount || 0), 0);
    const hybridCommission = hybridPayouts.reduce((s, p) => s + (p.uride_platform_fee_amount || 0), 0);
    const fleetOSDirectRevenue = fleetOSLogs.reduce((s, p) => s + (p.amount || 0), 0);

    // Host net payout
    const totalNetPaidOut = scopedPayouts.filter(p => p.status === 'paid').reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const pendingPayouts = scopedPayouts.filter(p => ['pending', 'processing'].includes(p.status));
    const heldPayouts = scopedPayouts.filter(p => p.status === 'held');
    const failedPayouts = scopedPayouts.filter(p => p.status === 'failed');

    // Subscriptions — canonical: HostPlatformSubscription
    const activeSubscriptions = scopedSubscriptions.filter(s => s.status === 'active');
    const trialingSubscriptions = scopedSubscriptions.filter(s => s.status === 'trialing');
    const pastDueSubscriptions = scopedSubscriptions.filter(s => ['past_due', 'unpaid', 'incomplete'].includes(s.status));
    const cancelledSubscriptions = scopedSubscriptions.filter(s => ['canceled', 'cancelled', 'incomplete_expired'].includes(s.status));
    const activeMRR = activeSubscriptions.reduce((s, sub) => s + (sub.monthly_amount || 0), 0);
    const trialingProjectedMRR = trialingSubscriptions.reduce((s, sub) => s + (sub.monthly_amount || 0), 0);

    // Failed payments — canonical: BookingRequest + alerts
    const failedPaymentBookings = scopedBookings.filter(b => b.payment_status === 'failed' || ['payment_due', 'suspended', 'grace_period'].includes(b.booking_status));
    const amountAtRisk = failedPaymentBookings.reduce((s, b) => s + (b.weekly_rate || 0), 0);
    const starterDisabledCount = scopedBookings.filter(b => b.starter_disabled || b.moovetrax_kill_active).length;

    // Disputes/chargebacks
    const openDisputes = disputes.filter(d => !['resolved_host_favor', 'resolved_customer_favor', 'resolved_split', 'closed_no_action'].includes(d.status));
    const chargebackExposure = disputes.filter(d => d.dispute_type === 'chargeback').reduce((s, d) => s + (d.stripe_dispute_amount || 0), 0);
    const openReceivables = receivables.filter(r => ['open', 'partially_recovered'].includes(r.status));
    const openReceivableAmount = openReceivables.reduce((s, r) => s + (r.remaining_amount || 0), 0);

    const warnings = [];
    if (paidLogs.some(p => !p.stripe_payment_intent_id && p.payment_method === 'stripe')) warnings.push('Some PaymentLog records are missing Stripe IDs');
    if (trialingSubscriptions.length) warnings.push(`${trialingSubscriptions.length} subscription(s) are trialing — projected MRR only, no cash collected`);
    if (payouts.some(p => p._synthesized)) warnings.push('Some payout estimates are synthesized and not real Stripe transfers');
    if (fleetOSDirectRevenue > 0) warnings.push('FleetOS direct payments are included — these flow through host Stripe, not uRide funds');

    return Response.json({
      summary: {
        gmv,
        platform_commission: totalPlatformFees,
        marketplace_commission: marketplaceCommission,
        hybrid_commission: hybridCommission,
        stripe_fees: totalStripeFees,
        net_host_paid_out: totalNetPaidOut,
        fleetos_direct_revenue: fleetOSDirectRevenue,
        active_mrr: activeMRR,
        trialing_projected_mrr: trialingProjectedMRR,
        amount_at_risk: amountAtRisk,
        chargeback_exposure: chargebackExposure,
        open_receivable_amount: openReceivableAmount,
        failed_payment_booking_count: failedPaymentBookings.length,
        starter_disabled_count: starterDisabledCount,
      },
      revenue: { gmv, paid_payment_count: paidLogs.length, failed_payment_count: failedLogs.length, payment_logs: scopedLogs },
      payouts: {
        total_paid_out: totalNetPaidOut,
        pending: pendingPayouts,
        held: heldPayouts,
        failed: failedPayouts,
        all_payouts: scopedPayouts,
      },
      subscriptions: {
        active: activeSubscriptions,
        trialing: trialingSubscriptions,
        past_due: pastDueSubscriptions,
        cancelled: cancelledSubscriptions,
        active_mrr: activeMRR,
        trialing_projected_mrr: trialingProjectedMRR,
      },
      collections: {
        failed_payment_bookings: failedPaymentBookings,
        amount_at_risk: amountAtRisk,
        starter_disabled_count: starterDisabledCount,
        alerts: alerts.filter(a => ['rental_payment_failed', 'weekly_billing_failed', 'payment_retry_scheduled'].includes(a.alert_type)),
      },
      chargebacks: {
        disputes: disputes,
        open_disputes: openDisputes,
        chargeback_exposure: chargebackExposure,
        receivables: receivables,
        open_receivable_amount: openReceivableAmount,
      },
      warnings,
      calculation_notes: [
        'GMV = PaymentLog where status=paid',
        'Commission = HostPayout.uride_platform_fee_amount',
        'Net payout = HostPayout.net_host_payout where status=paid',
        'Subscription MRR = HostPlatformSubscription.monthly_amount (active only)',
        'Trialing MRR is projected, not collected',
        'FleetOS direct payments are outside uRide platform funds',
        'Payment entity is legacy and excluded from Financial Center',
      ],
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getFinancialCenterMetrics]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});