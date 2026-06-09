import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'admin';
    const body = await req.json().catch(() => ({}));
    const { host_id: bodyHostId } = body;

    let scopedHostId = bodyHostId;
    if (!isAdmin) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ email: user.email });
      const hostByUser = await base44.asServiceRole.entities.Host.filter({ user_id: user.id });
      const myHost = hosts[0] || hostByUser[0];
      if (!myHost) return Response.json({ error: 'Host not found' }, { status: 403 });
      scopedHostId = myHost.id;
    }

    // Batch 1: Bookings + vehicles (scoped, bounded to 500)
    const [bookings, vehicles] = await Promise.all([
      scopedHostId
        ? base44.asServiceRole.entities.BookingRequest.filter({ host_id: scopedHostId }, '-updated_date', 500)
        : base44.asServiceRole.entities.BookingRequest.list('-updated_date', 500),
      scopedHostId
        ? base44.asServiceRole.entities.Vehicle.filter({ host_id: scopedHostId })
        : base44.asServiceRole.entities.Vehicle.list('-updated_date', 500),
    ]);

    // Batch 2: Compliance + GPS + hosts (bounded)
    const [complianceDocs, telematicsDevices, hosts] = await Promise.all([
      scopedHostId
        ? base44.asServiceRole.entities.HostVehicleCompliance.filter({ host_id: scopedHostId })
        : base44.asServiceRole.entities.HostVehicleCompliance.list('-created_date', 500),
      scopedHostId
        ? base44.asServiceRole.entities.TelematicsDevice.filter({ host_id: scopedHostId })
        : base44.asServiceRole.entities.TelematicsDevice.list('-updated_date', 500),
      isAdmin && !scopedHostId
        ? base44.asServiceRole.entities.Host.list('-created_date', 200)
        : scopedHostId
          ? base44.asServiceRole.entities.Host.filter({ id: scopedHostId })
          : Promise.resolve([]),
    ]);

    // Batch 3: Alerts + comms (capped small — FIX #6)
    const [paymentAlerts, operationalAlerts, communications] = await Promise.all([
      base44.asServiceRole.entities.PaymentOperationalAlert.filter({ status: 'new' }, '-created_date', 100),
      base44.asServiceRole.entities.OperationalAlert.filter({ status: 'new' }, '-created_date', 100),
      base44.asServiceRole.entities.CommunicationThread.list('-last_message_at', 100),
    ]);

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const staleCutoff = new Date(now.getTime() - 30 * 60 * 1000);

    // Booking categories
    const failedPaymentBookings = bookings.filter(b => b.payment_status === 'failed');
    const paymentDueBookings = bookings.filter(b => b.booking_status === 'payment_due');
    const suspendedBookings = bookings.filter(b => b.booking_status === 'suspended');
    const gracePeriodBookings = bookings.filter(b => b.booking_status === 'grace_period');
    const pendingReviewBookings = bookings.filter(b => ['pending_review', 'pending_verification'].includes(b.booking_status));
    const activeBookings = bookings.filter(b => ['active', 'confirmed', 'approved'].includes(b.booking_status));

    const starterDisabled = bookings.filter(b => b.starter_disabled || b.moovetrax_kill_active);

    // FIX #5: Grace period + starter kill included in needing attention
    const customersNeedingAttention = [...new Set([
      ...failedPaymentBookings.map(b => b.user_email),
      ...suspendedBookings.map(b => b.user_email),
      ...paymentDueBookings.map(b => b.user_email),
      ...gracePeriodBookings.map(b => b.user_email),          // FIX #5
      ...starterDisabled.map(b => b.user_email),              // FIX #5
    ].filter(Boolean))];

    // Build attention detail list (not just emails)
    const attentionBookings = bookings.filter(b =>
      b.payment_status === 'failed' ||
      ['payment_due', 'suspended', 'grace_period'].includes(b.booking_status) ||
      b.starter_disabled ||
      b.moovetrax_kill_active
    );

    const customerEmails = [...new Set(bookings.map(b => b.user_email).filter(Boolean))];

    // Vehicles
    const suspendedVehicles = vehicles.filter(v => ['Suspended', 'Out of Service', 'Compliance Hold', 'Maintenance Hold'].includes(v.status));
    const availableVehicles = vehicles.filter(v => v.status === 'Available');
    const vehiclesNotEarning = availableVehicles.filter(v => !activeBookings.some(b => b.vehicle_id === v.id));
    const gpsOfflineVehicles = telematicsDevices.filter(d =>
      d.online_status === 'offline' || (d.last_seen_at && new Date(d.last_seen_at) < staleCutoff)
    );

    // Compliance
    const expiringCompliance = complianceDocs.filter(d =>
      d.expiry_date && new Date(d.expiry_date) >= now && new Date(d.expiry_date) <= in30Days
    );
    const expiredCompliance = complianceDocs.filter(d =>
      d.status === 'expired' || (d.expiry_date && new Date(d.expiry_date) < now)
    );

    // Host blockers
    const hostsWithBlockers = hosts.filter(h =>
      !h.stripe_onboarding_complete || h.verification_status !== 'verified' || h.status !== 'approved'
    );

    // Comms
    const unreadComms = communications.filter(c => (c.unread_count_admin || 0) > 0 || (c.unread_count_host || 0) > 0);
    const escalatedComms = communications.filter(c => c.escalation_flag);

    // FIX #6: Alert count is capped — label it correctly
    const openPaymentAlertCount = paymentAlerts.length;
    const openOperationalAlertCount = operationalAlerts.length;
    const alertCountCapped = paymentAlerts.length >= 100 || operationalAlerts.length >= 100;

    const isTruncated = bookings.length >= 500 || vehicles.length >= 500;

    const warnings = [];
    if (gracePeriodBookings.length) warnings.push(`${gracePeriodBookings.length} booking(s) in grace period — customers added to needing_attention`);
    if (starterDisabled.length) warnings.push(`${starterDisabled.length} booking(s) have starter kill active`);
    if (isTruncated) warnings.push('Booking/vehicle results capped at 500 — use host_id filter for complete data');
    if (alertCountCapped) warnings.push('Operational alert counts are capped at 100 — actual open count may be higher (is_alert_count_exact: false)');
    if (expiredCompliance.length) warnings.push(`${expiredCompliance.length} compliance document(s) expired`);

    return Response.json({
      summary: {
        bookings_active: activeBookings.length,
        bookings_payment_failed: failedPaymentBookings.length,
        bookings_payment_due: paymentDueBookings.length,
        bookings_suspended: suspendedBookings.length,
        bookings_grace_period: gracePeriodBookings.length,
        bookings_pending_review: pendingReviewBookings.length,
        customers_needing_attention: customersNeedingAttention.length,
        vehicles_suspended: suspendedVehicles.length,
        vehicles_not_earning: vehiclesNotEarning.length,
        gps_offline_count: gpsOfflineVehicles.length,
        compliance_expiring_count: expiringCompliance.length,
        compliance_expired_count: expiredCompliance.length,
        hosts_with_blockers: hostsWithBlockers.length,
        unread_comms: unreadComms.length,
        escalated_comms: escalatedComms.length,
        starter_disabled_count: starterDisabled.length,
        // FIX #6: Labeled as estimated if capped
        open_payment_alerts: openPaymentAlertCount,
        open_operational_alerts: openOperationalAlertCount,
        is_alert_count_exact: !alertCountCapped,
      },
      customers: {
        all_emails: customerEmails,
        needing_attention: customersNeedingAttention,
        needing_attention_bookings: attentionBookings.map(b => ({
          email: b.user_email,
          booking_id: b.id,
          vehicle_id: b.vehicle_id,
          booking_status: b.booking_status,
          payment_status: b.payment_status,
          starter_disabled: b.starter_disabled || b.moovetrax_kill_active || false,
          grace_period_ends_at: b.grace_period_ends_at || null,
        })),
        starter_disabled: starterDisabled.map(b => ({
          email: b.user_email,
          booking_id: b.id,
          vehicle_id: b.vehicle_id,
        })),
      },
      bookings: {
        all: bookings,
        failed_payment: failedPaymentBookings,
        payment_due: paymentDueBookings,
        suspended: suspendedBookings,
        grace_period: gracePeriodBookings,
        pending_review: pendingReviewBookings,
        active: activeBookings,
      },
      hosts: { all: hosts, with_blockers: hostsWithBlockers },
      vehicles: { all: vehicles, suspended: suspendedVehicles, not_earning: vehiclesNotEarning },
      gps_offline: gpsOfflineVehicles,
      compliance: { expiring: expiringCompliance, expired: expiredCompliance },
      alerts: {
        payment_alerts: paymentAlerts,
        operational_alerts: operationalAlerts,
        is_alert_count_exact: !alertCountCapped,
        alert_count_note: alertCountCapped ? 'Alert counts capped at 100 per type — actual totals may be higher' : 'Alert counts are exact',
      },
      communications: { all: communications, unread: unreadComms, escalated: escalatedComms },
      warnings,
      query_limits_used: { bookings: 500, vehicles: 500, alerts: 100 },
      is_truncated: isTruncated,
      scope: isAdmin ? 'admin' : 'host',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getOperationsCenterMetrics]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});