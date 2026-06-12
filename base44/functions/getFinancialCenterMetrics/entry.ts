import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'admin';
    const body = await req.json().catch(() => ({}));
    let { host_id: filterHostId } = body;

    // Resolve host scope for non-admin
    if (!isAdmin) {
      const [hosts, hostByUser] = await Promise.all([
        base44.asServiceRole.entities.Host.filter({ email: user.email }),
        base44.asServiceRole.entities.Host.filter({ user_id: user.id }),
      ]);
      const myHost = hosts[0] || hostByUser[0];
      if (!myHost) return Response.json({ error: 'Host not found' }, { status: 403 });
      filterHostId = myHost.id; // Always scope to own host — cannot be overridden
    }

    // Default date range: last 30 days
    let { date_from, date_to } = body;
    if (!date_from && !date_to) {
      const now = new Date();
      date_to = now.toISOString().split('T')[0];
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      date_from = past.toISOString().split('T')[0];
    }

    function inRange(dateStr) {
      if (!dateStr) return true;
      if (date_from && dateStr < date_from) return false;
      if (date_to && dateStr > date_to + 'T23:59:59') return false;
      return true;
    }

    // Batch 1: Payment logs and payouts — scoped by host if provided, limited to 1000
    const [paymentLogs, payouts] = await Promise.all([
      filterHostId
        ? base44.asServiceRole.entities.PaymentLog.filter({ host_id: filterHostId }, '-paid_at', 1000)
        : base44.asServiceRole.entities.PaymentLog.list('-paid_at', 1000),
      filterHostId
        ? base44.asServiceRole.entities.HostPayout.filter({ host_id: filterHostId }, '-created_date', 500)
        : base44.asServiceRole.entities.HostPayout.list('-created_date', 500),
    ]);

    // Batch 2: Bookings + subscriptions
    const [bookings, subscriptions] = await Promise.all([
      filterHostId
        ? base44.asServiceRole.entities.BookingRequest.filter({ host_id: filterHostId }, '-updated_date', 500)
        : base44.asServiceRole.entities.BookingRequest.list('-updated_date', 500),
      filterHostId
        ? base44.asServiceRole.entities.HostPlatformSubscription.filter({ host_id: filterHostId }, '-updated_date', 100)
        : base44.asServiceRole.entities.HostPlatformSubscription.list('-updated_date', 200),
    ]);

    // Batch 3: Disputes, receivables, and hosts for name resolution
    const [disputes, receivables, alerts] = await Promise.all([
      filterHostId
        ? base44.asServiceRole.entities.Dispute.filter({ host_id: filterHostId }, '-created_date', 200)
        : base44.asServiceRole.entities.Dispute.list('-created_date', 200),
      filterHostId
        ? base44.asServiceRole.entities.HostReceivable.filter({ host_id: filterHostId }, '-created_date', 500)
        : base44.asServiceRole.entities.HostReceivable.list('-created_date', 500),
      filterHostId
        ? base44.asServiceRole.entities.PaymentOperationalAlert.filter({ host_id: filterHostId }, '-created_date', 200)
        : base44.asServiceRole.entities.PaymentOperationalAlert.list('-created_date', 200),
    ]);

    const scopedLogs = paymentLogs.filter(p => inRange(p.paid_at || p.created_date));
    const scopedPayouts = payouts.filter(p => inRange(p.payout_date || p.created_date));
    const scopedBookings = bookings;
    const scopedSubscriptions = subscriptions;

    const paidLogs = scopedLogs.filter(p => p.status === 'paid');
    const failedLogs = scopedLogs.filter(p => p.status === 'failed');

    // GMV — canonical: PaymentLog paid
    const gmv = paidLogs.reduce((s, p) => s + (p.amount || 0), 0);

    // Commission — canonical: HostPayout.uride_platform_fee_amount (all statuses)
    const totalPlatformFees = scopedPayouts.reduce((s, p) => s + (p.uride_platform_fee_amount || p.platform_fee || 0), 0);
    const totalStripeFees = scopedPayouts.reduce((s, p) => s + (p.stripe_fee_amount || 0), 0);

    // Commission by plan type
    const marketplacePayouts = scopedPayouts.filter(p => (p.uride_platform_fee_rate || 0) >= 0.07);
    const hybridPayouts = scopedPayouts.filter(p => { const r = p.uride_platform_fee_rate || 0; return r > 0 && r < 0.07; });
    const fleetOSLogs = paidLogs.filter(p => {
      const b = bookings.find(bk => bk.id === p.booking_request_id);
      return b?.booking_source === 'direct';
    });

    const marketplaceCommission = marketplacePayouts.reduce((s, p) => s + (p.uride_platform_fee_amount || 0), 0);
    const hybridCommission = hybridPayouts.reduce((s, p) => s + (p.uride_platform_fee_amount || 0), 0);
    const fleetOSDirectRevenue = fleetOSLogs.reduce((s, p) => s + (p.amount || 0), 0);

    // FIX #2: Payout status breakdown
    const payoutsPaid = scopedPayouts.filter(p => p.status === 'paid');
    const payoutsPending = scopedPayouts.filter(p => !p.status || ['pending', 'processing'].includes(p.status));
    const payoutsFailed = scopedPayouts.filter(p => p.status === 'failed');
    const payoutsHeld = scopedPayouts.filter(p => p.status === 'held');

    const totalHostPayoutCreated = scopedPayouts.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const totalHostPayoutPaid = payoutsPaid.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const totalHostPayoutPending = payoutsPending.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const totalHostPayoutFailed = payoutsFailed.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const totalHostPayoutUnknown = scopedPayouts
      .filter(p => p.status && !['paid', 'pending', 'processing', 'failed', 'held'].includes(p.status))
      .reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);

    // Subscriptions — canonical: HostPlatformSubscription
    const activeSubscriptions = scopedSubscriptions.filter(s => s.status === 'active');
    const trialingSubscriptions = scopedSubscriptions.filter(s => s.status === 'trialing');
    const pastDueSubscriptions = scopedSubscriptions.filter(s => ['past_due', 'unpaid', 'incomplete'].includes(s.status));
    const cancelledSubscriptions = scopedSubscriptions.filter(s => ['canceled', 'cancelled', 'incomplete_expired'].includes(s.status));
    const activeMRR = activeSubscriptions.reduce((s, sub) => s + (sub.monthly_amount || 0), 0);
    const trialingProjectedMRR = trialingSubscriptions.reduce((s, sub) => s + (sub.monthly_amount || 0), 0);

    const failedPaymentBookings = scopedBookings.filter(b => b.payment_status === 'failed' || ['payment_due', 'suspended', 'grace_period'].includes(b.booking_status));
    const amountAtRisk = failedPaymentBookings.reduce((s, b) => s + (b.weekly_rate || 0), 0);
    const starterDisabledCount = scopedBookings.filter(b => b.starter_disabled || b.moovetrax_kill_active).length;

    const openDisputes = disputes.filter(d => !['resolved_host_favor', 'resolved_customer_favor', 'resolved_split', 'closed_no_action'].includes(d.status));
    const chargebackExposure = disputes.filter(d => d.dispute_type === 'chargeback').reduce((s, d) => s + (d.stripe_dispute_amount || 0), 0);
    const openReceivables = receivables.filter(r => ['open', 'partially_recovered', 'partially_paid'].includes(r.status));
    const openReceivableAmount = openReceivables.reduce((s, r) => s + (r.remaining_amount || r.original_amount || 0), 0);

    // Manual payment fee receivables — separate from chargeback receivables
    const manualFeeReceivables = receivables.filter(r => r.receivable_type === 'manual_payment_fee' || r.source_payment_type === 'manual_payment');
    const manualFeeOpen = manualFeeReceivables.filter(r => r.status === 'open');
    const manualFeePaid = manualFeeReceivables.filter(r => r.status === 'paid');
    const manualFeeWaived = manualFeeReceivables.filter(r => r.status === 'waived');

    const manualPaymentLogs = scopedLogs.filter(p => p.status === 'paid' && ['zelle','cash','cashapp','venmo','check','other'].includes(p.payment_method));
    const manualPaymentCollected = manualPaymentLogs.reduce((s, p) => s + (p.amount || 0), 0);
    const manualFeeDueTotal = manualFeeOpen.reduce((s, r) => s + (r.platform_fee_amount_due || r.remaining_amount || r.original_amount || 0), 0);
    const manualFeePaidTotal = manualFeePaid.reduce((s, r) => s + (r.platform_fee_amount_due || r.original_amount || 0), 0);
    const manualFeeWaivedTotal = manualFeeWaived.reduce((s, r) => s + (r.platform_fee_amount_due || r.original_amount || 0), 0);
    const manualNetHostTotal = manualPaymentLogs.reduce((s, p) => s + (p.host_net_after_platform_fee || p.amount || 0), 0);

    const isTruncated = paymentLogs.length >= 1000 || payouts.length >= 500 || bookings.length >= 500;

    const warnings = [];
    if (isTruncated) warnings.push('Some result sets are truncated — apply a narrower date range or host filter for complete data');
    if (paymentLogs.length >= 1000) warnings.push(`Payment log results capped at 1000 — showing records within date range only`);
    if (paidLogs.some(p => !p.stripe_payment_intent_id && p.payment_method === 'stripe')) warnings.push('Some PaymentLog records are missing Stripe IDs');
    if (trialingSubscriptions.length) warnings.push(`${trialingSubscriptions.length} subscription(s) are trialing — projected MRR only, no cash collected`);
    if (totalHostPayoutPending > 0) warnings.push(`$${totalHostPayoutPending.toFixed(2)} in payouts are pending (created but not yet transferred to hosts)`);
    if (fleetOSDirectRevenue > 0) warnings.push('FleetOS direct payments are included — these flow through host Stripe, not uRide funds');

    return Response.json({
      summary: {
        gmv,
        platform_commission: totalPlatformFees,
        marketplace_commission: marketplaceCommission,
        hybrid_commission: hybridCommission,
        stripe_fees: totalStripeFees,
        // FIX #2: Replaced net_host_paid_out = 0 with breakdown
        total_host_payout_created: totalHostPayoutCreated,
        total_host_payout_paid: totalHostPayoutPaid,
        total_host_payout_pending: totalHostPayoutPending,
        total_host_payout_failed: totalHostPayoutFailed,
        total_host_payout_unknown_status: totalHostPayoutUnknown,
        // Legacy alias — now correctly reflects paid-only
        net_host_paid_out: totalHostPayoutPaid,
        fleetos_direct_revenue: fleetOSDirectRevenue,
        active_mrr: activeMRR,
        trialing_projected_mrr: trialingProjectedMRR,
        amount_at_risk: amountAtRisk,
        chargeback_exposure: chargebackExposure,
        open_receivable_amount: openReceivableAmount,
        failed_payment_booking_count: failedPaymentBookings.length,
        starter_disabled_count: starterDisabledCount,
        manual_payments_collected: manualPaymentCollected,
        manual_fees_due: manualFeeDueTotal,
        manual_fees_paid: manualFeePaidTotal,
        manual_fees_waived: manualFeeWaivedTotal,
        manual_net_host_amount: manualNetHostTotal,
      },
      revenue: { gmv, paid_payment_count: paidLogs.length, failed_payment_count: failedLogs.length, payment_logs: scopedLogs },
      payouts: {
        // FIX #2: Full breakdown
        total_host_payout_created: totalHostPayoutCreated,
        total_host_payout_paid: totalHostPayoutPaid,
        total_host_payout_pending: totalHostPayoutPending,
        total_host_payout_failed: totalHostPayoutFailed,
        total_paid_out: totalHostPayoutPaid,
        paid: payoutsPaid,
        pending: payoutsPending,
        failed: payoutsFailed,
        held: payoutsHeld,
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
        disputes,
        open_disputes: openDisputes,
        chargeback_exposure: chargebackExposure,
        receivables,
        open_receivable_amount: openReceivableAmount,
      },
      manual_fees: {
        receivables: manualFeeReceivables,
        open: manualFeeOpen,
        paid: manualFeePaid,
        waived: manualFeeWaived,
        manual_payments_collected: manualPaymentCollected,
        manual_fees_due: manualFeeDueTotal,
        manual_fees_paid: manualFeePaidTotal,
        manual_fees_waived: manualFeeWaivedTotal,
        manual_net_host_amount: manualNetHostTotal,
        payment_logs: manualPaymentLogs,
      },
      warnings,
      query_limits_used: { payment_logs: 1000, payouts: 500, bookings: 500 },
      is_truncated: isTruncated,
      date_range_used: { date_from, date_to },
      calculation_notes: [
        'GMV = PaymentLog where status=paid',
        'Commission = HostPayout.uride_platform_fee_amount (all payout statuses)',
        'total_host_payout_created = sum of all HostPayout.net_host_payout regardless of status',
        'total_host_payout_paid = HostPayout.net_host_payout where status=paid',
        'total_host_payout_pending = HostPayout.net_host_payout where status=pending/processing/missing',
        'net_host_paid_out = paid-only payouts (do not report pending as paid)',
        'Subscription MRR = HostPlatformSubscription.monthly_amount (active only)',
        'Trialing MRR is projected, not collected',
        'FleetOS direct payments are outside uRide platform funds',
        'Manual payment platform fees tracked via HostReceivable (receivable_type=manual_payment_fee)',
        'Manual fee resolution uses canonical platformFeeResolver — same rules as Stripe/billing flows',
        'Payment entity is legacy and excluded from Financial Center',
        'VehicleExpense entity is legacy and excluded',
        'calculateHostEarnings is legacy and excluded',
      ],
      scope: isAdmin ? 'admin' : 'host',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getFinancialCenterMetrics]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});