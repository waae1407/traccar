import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { search, customer_id, user_id, email, booking_id, host_id: filterHostId } = body;

    const isAdmin = user.role === 'admin';

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
      bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_id });
    } else if (email) {
      bookings = await base44.asServiceRole.entities.BookingRequest.filter({ user_email: email });
    } else if (customer_id || user_id) {
      // Scoped search — filter by user_id directly (avoids loading 2000 records)
      const [byUserId, byEmail] = await Promise.all([
        base44.asServiceRole.entities.BookingRequest.filter({ user_id: user_id || customer_id }, '-created_date', 100),
        user_id ? Promise.resolve([]) : base44.asServiceRole.entities.BookingRequest.filter({ user_email: customer_id }, '-created_date', 100),
      ]);
      bookings = [...byUserId, ...byEmail];
    } else if (search) {
      const s = String(search || '').toLowerCase();
      // Try email filter first (exact match is cheap)
      const byEmail = await base44.asServiceRole.entities.BookingRequest.filter({ user_email: search }, '-created_date', 100);
      if (byEmail.length > 0) {
        bookings = byEmail;
      } else {
        // Fall back to name search — pre-scope to host if not admin to avoid loading all records
        const fallbackQuery = scopedHostId ? { host_id: scopedHostId } : {};
        const allBookings = scopedHostId
          ? await base44.asServiceRole.entities.BookingRequest.filter(fallbackQuery, '-created_date', 500)
          : await base44.asServiceRole.entities.BookingRequest.list('-created_date', 500);
        bookings = allBookings.filter(b =>
          (b.customer_full_name || '').toLowerCase().includes(s) ||
          (b.user_email || '').toLowerCase().includes(s) ||
          (b.customer_phone || '').toLowerCase().includes(s) ||
          b.id === s
        );
      }
    }

    if (!bookings.length) return Response.json({ customer: null, message: 'No records found' });

    // Scope to host if not admin
    if (scopedHostId) {
      bookings = bookings.filter(b => b.host_id === scopedHostId);
    }
    // FIX #7: Return 403 not 500 when host has no access
    if (!bookings.length) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const sampleBooking = bookings[0];
    const customerEmail = sampleBooking.user_email;

    // Batch 1: Customer-scoped data (all direct filter, no large lists)
    const [paymentLogs, alerts, notifications, customers] = await Promise.all([
      base44.asServiceRole.entities.PaymentLog.filter({ customer_email: customerEmail }),
      base44.asServiceRole.entities.PaymentOperationalAlert.filter({ renter_email: customerEmail }),
      base44.asServiceRole.entities.Notification.filter({ user_email: customerEmail }, '-created_date', 50),
      base44.asServiceRole.entities.Customer.filter({ email: customerEmail }),
    ]);

    // Batch 2: Booking-scoped data (bounded)
    const bookingIds = new Set(bookings.map(b => b.id));
    const vehicleIds = [...new Set(bookings.map(b => b.vehicle_id).filter(Boolean))];
    const hostIds = [...new Set(bookings.map(b => b.host_id).filter(Boolean))];

    const [payouts, disputes, communications, telematicsCommands, inspectionPackets, activityEvents] = await Promise.all([
      base44.asServiceRole.entities.HostPayout.list('-created_date', 200),
      base44.asServiceRole.entities.Dispute.list('-created_date', 100),
      base44.asServiceRole.entities.CommunicationThread.list('-last_message_at', 50),
      base44.asServiceRole.entities.TelematicsCommand.list('-created_date', 100),
      base44.asServiceRole.entities.InspectionEvidencePacket.list('-created_date', 50),
      base44.asServiceRole.entities.ActivityEvent.list('-created_date', 200),
    ]);

    // Batch 3: Vehicle/host lookups (small sets)
    const [vehicles, hosts] = await Promise.all([
      Promise.all(vehicleIds.map(id => base44.asServiceRole.entities.Vehicle.filter({ id }).then(r => r[0]))),
      Promise.all(hostIds.map(id => base44.asServiceRole.entities.Host.filter({ id }).then(r => r[0]))),
    ]);
    const vehicleMap = Object.fromEntries(vehicles.filter(Boolean).map(v => [v.id, v]));
    const hostMap = Object.fromEntries(hosts.filter(Boolean).map(h => [h.id, h]));

    const scopedPaymentLogs = paymentLogs.filter(p => bookingIds.has(p.booking_request_id));
    // Match payouts by booking_request_id OR by host_id (handles orphan rollup payouts with null booking_request_id)
    const bookingHostIds = new Set(bookings.map(b => b.host_id).filter(Boolean));
    const scopedPayouts = payouts.filter(p =>
      bookingIds.has(p.booking_request_id) ||
      (p.booking_request_id == null && bookingHostIds.has(p.host_id))
    );
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
    if (scopedPaymentLogs.some(p => !p.stripe_payment_intent_id && p.payment_method === 'stripe' && p.source_type !== 'backfill')) warnings.push('Some PaymentLog records are missing Stripe IDs');
    if (!customers.length) warnings.push('Customer identity match is email-only — no Customer record found');
    // Only warn if there are stripe-method paid logs AND no payouts found — manual-only bookings don't generate HostPayouts
    const stripeMethodPaidLogs = paidLogs.filter(p => p.payment_method === 'stripe');
    if (scopedPayouts.length === 0 && stripeMethodPaidLogs.length > 0) warnings.push('Paid Stripe payments found but no HostPayout records exist for this customer');

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
      alerts,
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