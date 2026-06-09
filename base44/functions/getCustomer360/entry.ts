import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { search, customer_id, user_id, email, booking_id, host_id: filterHostId } = body;

    const isAdmin = user.role === 'admin';
    const isHost = user.role === 'host' || (!isAdmin && user.role !== 'admin');

    // Resolve host scope for non-admin
    let scopedHostId = null;
    if (!isAdmin) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ user_id: user.id });
      const hostByEmail = hosts[0] || (await base44.asServiceRole.entities.Host.filter({ email: user.email }))[0];
      scopedHostId = hostByEmail?.id || filterHostId;
      if (!scopedHostId) return Response.json({ error: 'Host scope not found' }, { status: 403 });
    }

    // Find matching bookings
    let bookings = [];
    if (booking_id) {
      const b = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_id });
      bookings = b;
    } else if (email) {
      bookings = await base44.asServiceRole.entities.BookingRequest.filter({ user_email: email });
    } else if (customer_id || user_id) {
      const allBookings = await base44.asServiceRole.entities.BookingRequest.list('-created_date', 2000);
      bookings = allBookings.filter(b => b.user_id === (user_id || customer_id) || b.user_email);
    } else if (search) {
      const s = String(search || '').toLowerCase();
      const allBookings = await base44.asServiceRole.entities.BookingRequest.list('-created_date', 2000);
      bookings = allBookings.filter(b =>
        (b.customer_full_name || '').toLowerCase().includes(s) ||
        (b.user_email || '').toLowerCase().includes(s) ||
        (b.customer_phone || '').toLowerCase().includes(s) ||
        b.id === s
      );
    }

    if (!bookings.length) return Response.json({ customer: null, message: 'No records found' });

    // Scope to host if not admin
    if (scopedHostId) {
      bookings = bookings.filter(b => b.host_id === scopedHostId);
    }
    if (!bookings.length) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const sampleBooking = bookings[0];
    const customerEmail = sampleBooking.user_email;

    // Parallel data fetch
    const [paymentLogs, payouts, alerts, notifications, activityEvents, disputes, communications, telematicsCommands, inspectionPackets, customers] = await Promise.all([
      base44.asServiceRole.entities.PaymentLog.filter({ customer_email: customerEmail }),
      base44.asServiceRole.entities.HostPayout.list('-created_date', 500),
      base44.asServiceRole.entities.PaymentOperationalAlert.filter({ renter_email: customerEmail }),
      base44.asServiceRole.entities.Notification.filter({ user_email: customerEmail }),
      base44.asServiceRole.entities.ActivityEvent.list('-created_date', 500),
      base44.asServiceRole.entities.Dispute.list('-created_date', 200),
      base44.asServiceRole.entities.CommunicationThread.list('-last_message_at', 100),
      base44.asServiceRole.entities.TelematicsCommand.list('-created_date', 300),
      base44.asServiceRole.entities.InspectionEvidencePacket.list('-created_date', 100),
      base44.asServiceRole.entities.Customer.filter({ email: customerEmail }),
    ]);

    const bookingIds = new Set(bookings.map(b => b.id));
    const vehicleIds = [...new Set(bookings.map(b => b.vehicle_id).filter(Boolean))];
    const hostIds = [...new Set(bookings.map(b => b.host_id).filter(Boolean))];

    const [vehicles, hosts] = await Promise.all([
      Promise.all(vehicleIds.map(id => base44.asServiceRole.entities.Vehicle.filter({ id }).then(r => r[0]))),
      Promise.all(hostIds.map(id => base44.asServiceRole.entities.Host.filter({ id }).then(r => r[0]))),
    ]);
    const vehicleMap = Object.fromEntries(vehicles.filter(Boolean).map(v => [v.id, v]));
    const hostMap = Object.fromEntries(hosts.filter(Boolean).map(h => [h.id, h]));

    const scopedPaymentLogs = paymentLogs.filter(p => bookingIds.has(p.booking_request_id));
    const scopedPayouts = payouts.filter(p => bookingIds.has(p.booking_request_id));
    const scopedActivity = activityEvents.filter(e => bookingIds.has(e.booking_id) || (e.customer_id === customerEmail));
    const scopedDisputes = disputes.filter(d => bookingIds.has(d.booking_request_id) || d.customer_email === customerEmail);
    const scopedComms = communications.filter(c => c.customer_id && bookingIds.has(c.booking_request_id));
    const scopedCommands = telematicsCommands.filter(c => c.booking_id && bookingIds.has(c.booking_id));
    const scopedInspections = inspectionPackets.filter(i => bookingIds.has(i.booking_request_id));

    const activeBooking = bookings.find(b => ['active', 'confirmed', 'approved', 'payment_due', 'suspended', 'grace_period'].includes(b.booking_status));

    const paidLogs = scopedPaymentLogs.filter(p => p.status === 'paid');
    const failedLogs = scopedPaymentLogs.filter(p => p.status === 'failed');
    const lastPaid = paidLogs.sort((a, b) => new Date(b.paid_at || b.created_date) - new Date(a.paid_at || a.created_date))[0];
    const lastFailed = failedLogs.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];

    const totalPaid = paidLogs.reduce((s, p) => s + (p.amount || 0), 0);
    const amountAtRisk = bookings.filter(b => ['payment_due', 'suspended', 'grace_period'].includes(b.booking_status)).reduce((s, b) => s + (b.weekly_rate || 0), 0);

    const warnings = [];
    if (scopedPaymentLogs.some(p => !p.stripe_payment_intent_id && p.payment_method === 'stripe')) warnings.push('Some PaymentLog records are missing Stripe IDs');
    if (!customers.length) warnings.push('Customer identity match is email-only — no Customer record found');
    if (scopedPayouts.length === 0 && paidLogs.length > 0) warnings.push('Paid payments found but no HostPayout records exist for this customer');

    return Response.json({
      customer: {
        email: customerEmail,
        full_name: sampleBooking.customer_full_name || '',
        phone: sampleBooking.customer_phone || '',
        address: sampleBooking.customer_address || '',
        dob: sampleBooking.customer_dob || '',
        employer: sampleBooking.employer || '',
        income_range: sampleBooking.income_range || '',
        customer_record: customers[0] || null,
      },
      active_booking: activeBooking ? {
        ...activeBooking,
        vehicle: vehicleMap[activeBooking.vehicle_id] || null,
        host: hostMap[activeBooking.host_id] || null,
      } : null,
      bookings: bookings.map(b => ({
        ...b,
        vehicle: vehicleMap[b.vehicle_id] || null,
        host: hostMap[b.host_id] || null,
      })),
      payment_summary: {
        total_paid: totalPaid,
        amount_at_risk: amountAtRisk,
        last_successful_payment: lastPaid || null,
        last_failed_payment: lastFailed || null,
        next_billing_date: activeBooking?.next_billing_date || null,
        payment_failure_attempts: activeBooking?.payment_failure_attempts || 0,
        starter_disabled: activeBooking?.starter_disabled || activeBooking?.moovetrax_kill_active || false,
        grace_period_ends_at: activeBooking?.grace_period_ends_at || null,
        payment_status: activeBooking?.payment_status || null,
        booking_status: activeBooking?.booking_status || null,
        starter_disable_scheduled_at: activeBooking?.starter_disable_scheduled_at || null,
      },
      payment_logs: scopedPaymentLogs,
      payouts: scopedPayouts,
      alerts: alerts,
      notifications: notifications.slice(0, 50),
      activity_events: scopedActivity.slice(0, 100),
      disputes: scopedDisputes,
      communications: scopedComms,
      telematics_commands: scopedCommands.slice(0, 50),
      inspections: scopedInspections,
      warnings,
      scope: isAdmin ? 'admin' : 'host',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getCustomer360]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});