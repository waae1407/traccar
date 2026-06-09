import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { host_id } = await req.json();
    if (!host_id) return Response.json({ error: 'host_id required' }, { status: 400 });

    const isAdmin = user.role === 'admin';

    let host;
    try {
      host = await base44.asServiceRole.entities.Host.get(host_id);
    } catch (e) {
      if (e.message && e.message.includes('not found')) return Response.json({ error: 'Host not found' }, { status: 404 });
      throw e;
    }
    if (!host) return Response.json({ error: 'Host not found' }, { status: 404 });

    if (!isAdmin && host.email !== user.email && host.user_id !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // --- Batch 1: Small/bounded config lookups (safe to parallel) ---
    const [subscriptions, plan, commerceProfile, brandSettings] = await Promise.all([
      base44.asServiceRole.entities.HostPlatformSubscription.filter({ host_id }, '-updated_date', 5),
      base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id }, '-updated_date', 1),
      base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id }, '-updated_date', 1),
      base44.asServiceRole.entities.HostBrandSettings.filter({ host_id }, '-updated_date', 1),
    ]);

    // --- Batch 2: Fleet data (scoped to host, typically small) ---
    const [vehicles, telematicsDevices, complianceDocs] = await Promise.all([
      base44.asServiceRole.entities.Vehicle.filter({ host_id }),
      base44.asServiceRole.entities.TelematicsDevice.filter({ host_id }),
      base44.asServiceRole.entities.HostVehicleCompliance.filter({ host_id }),
    ]);

    // --- Batch 3: Financial records (scoped to host, bounded) ---
    const [paymentLogs, payouts, expenses, recurringExpenses, alerts] = await Promise.all([
      base44.asServiceRole.entities.PaymentLog.filter({ host_id }, '-paid_at', 500),
      base44.asServiceRole.entities.HostPayout.filter({ host_id }, '-created_date', 200),
      base44.asServiceRole.entities.HostExpense.filter({ host_id }, '-created_date', 200),
      base44.asServiceRole.entities.RecurringExpense.filter({ host_id }),
      base44.asServiceRole.entities.PaymentOperationalAlert.filter({ host_id }, '-created_date', 50),
    ]);

    // --- Batch 4: Operations (scoped to host, bounded) ---
    const [bookings, maintenanceLogs, installRecords] = await Promise.all([
      base44.asServiceRole.entities.BookingRequest.filter({ host_id }, '-updated_date', 200),
      base44.asServiceRole.entities.HostMaintenanceLog.filter({ host_id }, '-created_date', 100),
      base44.asServiceRole.entities.TelematicsInstallRecord.filter({ host_id }, '-created_date', 100),
    ]);

    const activeSubscription = subscriptions.find(s => ['active', 'trialing'].includes(s.status));
    const currentPlan = plan[0] || null;
    const commerce = commerceProfile[0] || null;
    const brand = brandSettings[0] || null;

    const liveVehicles = vehicles.filter(v => ['Available', 'Reserved', 'Active Rental', 'Booked', 'Payment Due', 'Grace Period'].includes(v.status));
    const offlineVehicles = vehicles.filter(v => ['Suspended', 'Out of Service', 'Compliance Hold', 'Maintenance'].includes(v.status));

    const activeBookings = bookings.filter(b => ['active', 'confirmed', 'approved'].includes(b.booking_status));
    const failedPaymentBookings = bookings.filter(b => b.payment_status === 'failed');

    const paidLogs = paymentLogs.filter(p => p.status === 'paid');
    const grossRevenue = paidLogs.reduce((s, p) => s + (p.amount || 0), 0);
    const totalPlatformFees = payouts.reduce((s, p) => s + (p.uride_platform_fee_amount || p.platform_fee || 0), 0);
    const totalStripeFees = payouts.reduce((s, p) => s + (p.stripe_fee_amount || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const totalMaintenanceCost = maintenanceLogs.reduce((s, m) => s + (m.cost || 0), 0);

    // FIX #2: Payout status breakdown — do not hide pending amounts
    const payoutsPaid = payouts.filter(p => p.status === 'paid');
    const payoutsPending = payouts.filter(p => !p.status || ['pending', 'processing'].includes(p.status));
    const payoutsFailed = payouts.filter(p => p.status === 'failed');
    const payoutsHeld = payouts.filter(p => p.status === 'held');
    const totalPayoutCreated = payouts.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const totalPayoutPaid = payoutsPaid.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const totalPayoutPending = payoutsPending.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const totalPayoutFailed = payoutsFailed.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);

    const expiringDocs = complianceDocs.filter(d => ['expiring_soon', 'expired'].includes(d.status));
    const expiredDocs = complianceDocs.filter(d => d.status === 'expired');

    const gpsOnline = telematicsDevices.filter(d => d.online_status === 'online').length;
    const gpsOffline = telematicsDevices.filter(d => d.online_status === 'offline').length;
    const gpsUnknown = telematicsDevices.filter(d => !d.online_status || d.online_status === 'unknown').length;

    const planMode = currentPlan?.active_mode && currentPlan.active_mode !== 'none'
      ? currentPlan.active_mode
      : (currentPlan?.selected_mode || 'marketplace_partner');

    const subscriptionMRR = activeSubscription?.monthly_amount || 0;
    const isTrialing = activeSubscription?.status === 'trialing';

    const warnings = [];
    if (!host.stripe_onboarding_complete) warnings.push('Host Stripe Connect is not completed — payouts cannot be issued automatically');
    if (expiredDocs.length) warnings.push(`${expiredDocs.length} vehicle compliance document(s) are expired`);
    if (isTrialing) warnings.push('Subscription is trialing — no cash collected yet');
    if (failedPaymentBookings.length) warnings.push(`${failedPaymentBookings.length} booking(s) have failed payments`);
    if (payoutsHeld.length) warnings.push(`${payoutsHeld.length} payout(s) are currently held`);
    if (totalPayoutPending > 0) warnings.push(`$${totalPayoutPending.toFixed(2)} in payouts are pending (created but not yet transferred)`);
    if (paymentLogs.length >= 500) warnings.push('Payment log results may be truncated — showing last 500 records');
    if (bookings.length >= 200) warnings.push('Booking results may be truncated — showing last 200 records');

    return Response.json({
      host,
      plan: currentPlan,
      plan_mode: planMode,
      subscription: activeSubscription || null,
      subscription_mrr: subscriptionMRR,
      is_trialing: isTrialing,
      commerce_profile: commerce,
      brand_settings: brand,
      vehicles: { all: vehicles, live: liveVehicles, offline: offlineVehicles, total: vehicles.length },
      bookings: { all: bookings.length, active: activeBookings.length, failed_payment: failedPaymentBookings.length },
      revenue: {
        gross_revenue: grossRevenue,
        platform_fees: totalPlatformFees,
        stripe_fees: totalStripeFees,
        payment_log_source: true,
      },
      payouts: {
        all: payouts,
        paid: payoutsPaid,
        pending: payoutsPending,
        failed: payoutsFailed,
        held: payoutsHeld,
        // FIX #2: Status breakdown
        total_host_payout_created: totalPayoutCreated,
        total_host_payout_paid: totalPayoutPaid,
        total_host_payout_pending: totalPayoutPending,
        total_host_payout_failed: totalPayoutFailed,
        // Legacy alias — now correct
        net_host_paid_out: totalPayoutPaid,
        net_host_payout_created: totalPayoutCreated,
      },
      expenses: { all: expenses, recurring: recurringExpenses, total: totalExpenses },
      maintenance: { logs: maintenanceLogs, total_cost: totalMaintenanceCost },
      compliance: { all: complianceDocs, expiring: expiringDocs, expired: expiredDocs },
      telematics: { devices: telematicsDevices, install_records: installRecords, gps_online: gpsOnline, gps_offline: gpsOffline, gps_unknown: gpsUnknown },
      alerts,
      warnings,
      query_limits_used: { bookings: 200, payment_logs: 500, payouts: 200, expenses: 200, maintenance: 100 },
      is_truncated: bookings.length >= 200 || paymentLogs.length >= 500,
      scope: isAdmin ? 'admin' : 'host',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getHost360]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});