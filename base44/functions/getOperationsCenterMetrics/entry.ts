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

    const [bookings, vehicles, hosts, complianceDocs, paymentAlerts, operationalAlerts, communications, telematicsDevices] = await Promise.all([
      scopedHostId ? base44.asServiceRole.entities.BookingRequest.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.BookingRequest.list('-updated_date', 3000),
      scopedHostId ? base44.asServiceRole.entities.Vehicle.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.Vehicle.list('-updated_date', 2000),
      isAdmin && !scopedHostId ? base44.asServiceRole.entities.Host.list('-created_date', 500) : scopedHostId ? base44.asServiceRole.entities.Host.filter({ id: scopedHostId }) : [],
      scopedHostId ? base44.asServiceRole.entities.HostVehicleCompliance.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.HostVehicleCompliance.list('-created_date', 3000),
      base44.asServiceRole.entities.PaymentOperationalAlert.filter({ status: 'new' }),
      base44.asServiceRole.entities.OperationalAlert.filter({ status: 'new' }),
      base44.asServiceRole.entities.CommunicationThread.list('-last_message_at', 100),
      scopedHostId ? base44.asServiceRole.entities.TelematicsDevice.filter({ host_id: scopedHostId }) : base44.asServiceRole.entities.TelematicsDevice.list('-updated_date', 2000),
    ]);

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const staleCutoff = new Date(now.getTime() - 30 * 60 * 1000);

    // Bookings needing attention
    const failedPaymentBookings = bookings.filter(b => b.payment_status === 'failed');
    const paymentDueBookings = bookings.filter(b => b.booking_status === 'payment_due');
    const suspendedBookings = bookings.filter(b => b.booking_status === 'suspended');
    const gracePeriodBookings = bookings.filter(b => b.booking_status === 'grace_period');
    const pendingReviewBookings = bookings.filter(b => ['pending_review', 'pending_verification'].includes(b.booking_status));
    const activeBookings = bookings.filter(b => ['active', 'confirmed', 'approved'].includes(b.booking_status));

    // Unique customers from bookings
    const customerEmails = [...new Set(bookings.map(b => b.user_email).filter(Boolean))];
    const customersNeedingAttention = [...new Set([
      ...failedPaymentBookings.map(b => b.user_email),
      ...suspendedBookings.map(b => b.user_email),
      ...paymentDueBookings.map(b => b.user_email),
    ].filter(Boolean))];

    // Vehicles
    const suspendedVehicles = vehicles.filter(v => ['Suspended', 'Out of Service', 'Compliance Hold', 'Maintenance Hold'].includes(v.status));
    const availableVehicles = vehicles.filter(v => v.status === 'Available');
    const vehiclesNotEarning = availableVehicles.filter(v => {
      return !activeBookings.some(b => b.vehicle_id === v.id);
    });
    const gpsOfflineVehicles = telematicsDevices.filter(d => d.online_status === 'offline' || (d.last_seen_at && new Date(d.last_seen_at) < staleCutoff));

    // Compliance expiring
    const expiringCompliance = complianceDocs.filter(d => d.expiry_date && new Date(d.expiry_date) >= now && new Date(d.expiry_date) <= in30Days);
    const expiredCompliance = complianceDocs.filter(d => d.status === 'expired' || (d.expiry_date && new Date(d.expiry_date) < now));

    // Host setup blockers
    const hostsWithBlockers = hosts.filter(h =>
      !h.stripe_onboarding_complete || h.verification_status !== 'verified' || h.status !== 'approved'
    );

    // Unread communications
    const unreadComms = communications.filter(c => (c.unread_count_admin || 0) > 0 || (c.unread_count_host || 0) > 0);
    const escalatedComms = communications.filter(c => c.escalation_flag);

    const starterDisabled = bookings.filter(b => b.starter_disabled || b.moovetrax_kill_active);

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
        open_payment_alerts: paymentAlerts.length,
        open_operational_alerts: operationalAlerts.length,
      },
      customers: {
        all_emails: customerEmails,
        needing_attention: customersNeedingAttention,
        starter_disabled: starterDisabled.map(b => ({ email: b.user_email, booking_id: b.id, vehicle_id: b.vehicle_id })),
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
      },
      communications: { all: communications, unread: unreadComms, escalated: escalatedComms },
      scope: isAdmin ? 'admin' : 'host',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getOperationsCenterMetrics]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});