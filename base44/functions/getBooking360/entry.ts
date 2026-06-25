import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { booking_request_id, search_query } = await req.json();

    let booking = null;

    // Multi-field search: if search_query provided, search across booking_id, customer name, email, phone, VIN, vehicle name, host name
    if (search_query && !booking_request_id) {
      const q = search_query.trim().toLowerCase();

      // Try exact booking ID first
      try {
        booking = await base44.asServiceRole.entities.BookingRequest.get(search_query.trim());
      } catch (_) { /* not a direct ID, continue searching */ }

      // Search by customer email / name / phone fields
      if (!booking) {
        const byEmail = await base44.asServiceRole.entities.BookingRequest.filter({ user_email: search_query.trim() }, "-created_date", 20);
        if (byEmail.length === 1) booking = byEmail[0];
        else if (byEmail.length > 1) {
          return Response.json({ error: 'Multiple bookings found for this email', search_results: byEmail.map(b => ({ id: b.id, customer: b.customer_full_name, vehicle: b.vehicle_name, status: b.booking_status, start: b.start_date })) }, { status: 200 });
        }
      }

      if (!booking) {
        const byPhone = await base44.asServiceRole.entities.BookingRequest.filter({ customer_phone: search_query.trim() }, "-created_date", 20);
        if (byPhone.length === 1) booking = byPhone[0];
        else if (byPhone.length > 1) {
          return Response.json({ error: 'Multiple bookings found for this phone', search_results: byPhone.map(b => ({ id: b.id, customer: b.customer_full_name, vehicle: b.vehicle_name, status: b.booking_status, start: b.start_date })) }, { status: 200 });
        }
      }

      // Search by VIN → find vehicle → find bookings
      if (!booking) {
        const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ vin: search_query.trim() }, "-created_date", 10);
        if (vehicles.length === 1) {
          const vBookings = await base44.asServiceRole.entities.BookingRequest.filter({ vehicle_id: vehicles[0].id }, "-created_date", 50);
          if (vBookings.length === 1) booking = vBookings[0];
          else if (vBookings.length > 1) {
            return Response.json({ error: 'Multiple bookings found for this VIN', search_results: vBookings.map(b => ({ id: b.id, customer: b.customer_full_name, vehicle: b.vehicle_name, status: b.booking_status, start: b.start_date })) }, { status: 200 });
          }
        }
      }

      // Search by host name → find host → find bookings
      if (!booking) {
        const hosts = await base44.asServiceRole.entities.Host.filter({ full_name: search_query.trim() }, "-created_date", 10);
        if (hosts.length === 1) {
          const hBookings = await base44.asServiceRole.entities.BookingRequest.filter({ host_id: hosts[0].id }, "-created_date", 50);
          if (hBookings.length === 1) booking = hBookings[0];
          else if (hBookings.length > 1) {
            return Response.json({ error: 'Multiple bookings found for this host', search_results: hBookings.map(b => ({ id: b.id, customer: b.customer_full_name, vehicle: b.vehicle_name, status: b.booking_status, start: b.start_date })) }, { status: 200 });
          }
        }
      }

      // Partial name search across all recent bookings
      if (!booking) {
        const recent = await base44.asServiceRole.entities.BookingRequest.list("-created_date", 500);
        const matches = recent.filter(b => {
          const haystack = `${b.customer_full_name || ""} ${b.user_email || ""} ${b.vehicle_name || ""} ${b.customer_phone || ""}`.toLowerCase();
          return haystack.includes(q);
        });
        if (matches.length === 1) booking = matches[0];
        else if (matches.length > 1) {
          return Response.json({ error: 'Multiple bookings match your search', search_results: matches.slice(0, 20).map(b => ({ id: b.id, customer: b.customer_full_name, vehicle: b.vehicle_name, status: b.booking_status, start: b.start_date })) }, { status: 200 });
        }
      }

      if (!booking) return Response.json({ error: 'No booking found matching your search' }, { status: 404 });
    } else {
      if (!booking_request_id) return Response.json({ error: 'booking_request_id or search_query required' }, { status: 400 });

      // FIX #7: Return 404 (not 500) for invalid IDs
      try {
        booking = await base44.asServiceRole.entities.BookingRequest.get(booking_request_id);
      } catch (e) {
        if (e.message && e.message.includes('not found')) return Response.json({ error: 'Booking not found' }, { status: 404 });
        throw e;
      }
      if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    const isAdmin = user.role === 'admin';
    if (!isAdmin) {
      if (booking.user_email !== user.email && booking.user_id !== user.id) {
        const hosts = await base44.asServiceRole.entities.Host.filter({ email: user.email });
        const hostByUserId = await base44.asServiceRole.entities.Host.filter({ user_id: user.id });
        const myHost = hosts[0] || hostByUserId[0];
        // FIX #7: Explicit 403
        if (!myHost || booking.host_id !== myHost.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const [vehicle, host, paymentLogs, payouts, alerts, notifications, activityEvents, disputes, communications, telematicsCommands, inspectionPackets, contractTemplate, manualFeeReceivables] = await Promise.all([
      booking.vehicle_id ? base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id }).then(r => r[0]) : Promise.resolve(null),
      booking.host_id ? base44.asServiceRole.entities.Host.filter({ id: booking.host_id }).then(r => r[0]) : Promise.resolve(null),
      base44.asServiceRole.entities.PaymentLog.filter({ booking_request_id }),
      base44.asServiceRole.entities.HostPayout.filter({ booking_request_id }),
      base44.asServiceRole.entities.PaymentOperationalAlert.filter({ booking_id: booking_request_id }),
      base44.asServiceRole.entities.Notification.filter({ booking_request_id }),
      base44.asServiceRole.entities.ActivityEvent.filter({ booking_id: booking_request_id }),
      base44.asServiceRole.entities.Dispute.filter({ booking_request_id }),
      base44.asServiceRole.entities.CommunicationThread.filter({ booking_request_id }),
      base44.asServiceRole.entities.TelematicsCommand.filter({ booking_id: booking_request_id }),
      base44.asServiceRole.entities.InspectionEvidencePacket.filter({ booking_request_id }),
      booking.host_id ? base44.asServiceRole.entities.ContractTemplate.filter({ host_id: booking.host_id }).then(r => r.find(t => ['weekly_rental', 'rent_to_own'].includes(t.template_type))) : Promise.resolve(null),
      base44.asServiceRole.entities.HostReceivable.filter({ booking_request_id }),
    ]);

    const paidLogs = paymentLogs.filter(p => p.status === 'paid');
    const failedLogs = paymentLogs.filter(p => p.status === 'failed');
    const totalCollected = paidLogs.reduce((s, p) => s + (p.amount || 0), 0);

    // FIX #2: Payout status breakdown for this booking
    const payoutsPaid = payouts.filter(p => p.status === 'paid');
    const payoutsPending = payouts.filter(p => !p.status || ['pending', 'processing'].includes(p.status));
    const totalPaidOut = payoutsPaid.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const totalPendingPayout = payoutsPending.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const totalPayoutCreated = payouts.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const totalPlatformFees = payouts.reduce((s, p) => s + (p.uride_platform_fee_amount || p.platform_fee || 0), 0);

    // Manual payment fee summary for this booking
    const manualLogs = paidLogs.filter(p => ['zelle','cash','cashapp','venmo','check','other'].includes(p.payment_method));
    const manualFeeReceivablesOpen = manualFeeReceivables.filter(r => r.status === 'open');
    const manualFeeReceivablesPaid = manualFeeReceivables.filter(r => r.status === 'paid');
    const manualFeeReceivablesWaived = manualFeeReceivables.filter(r => r.status === 'waived');
    const totalManualCollected = manualLogs.reduce((s, p) => s + (p.amount || 0), 0);
    const totalManualFeeDue = manualFeeReceivablesOpen.reduce((s, r) => s + (r.platform_fee_amount_due || r.remaining_amount || r.original_amount || 0), 0);

    // Stripe-sourced paid logs (should have payouts)
    const stripePaidLogs = paidLogs.filter(p => p.payment_method === 'stripe' || !['zelle','cash','cashapp','venmo','check','other'].includes(p.payment_method));

    const warnings = [];
    if (paymentLogs.some(p => !p.stripe_payment_intent_id && p.payment_method === 'stripe')) warnings.push('Some PaymentLog records missing Stripe IDs');
    // Only warn about missing HostPayout for Stripe payments — manual payments intentionally have no HostPayout
    if (stripePaidLogs.length > 0 && payouts.length === 0 && manualLogs.length === 0) warnings.push('Stripe payments exist but no HostPayout records found — potential payout gap');
    if (stripePaidLogs.length > 0 && payouts.length === 0 && manualLogs.length > 0) warnings.push('Mix of Stripe and manual payments — no HostPayout found for Stripe portion. Manual payment platform fee tracked via host receivable.');
    if (manualLogs.length > 0 && payouts.length === 0) {
      // All manual — no payout warning; instead note the receivable
      if (manualFeeReceivablesOpen.length > 0) warnings.push(`Manual payment recorded. Platform fee reconciliation ($${totalManualFeeDue.toFixed(2)} due) is tracked with host via receivable.`);
      else warnings.push('Manual payment recorded. Platform fee reconciliation is tracked with host.');
    }
    if (booking.payment_status === 'paid' && paidLogs.length === 0) warnings.push('Booking marked paid but no PaymentLog records found');
    if (payouts.some(p => p._synthesized)) warnings.push('Some payout rows are synthesized estimates — not real transfers');
    if (totalPendingPayout > 0) warnings.push(`$${totalPendingPayout.toFixed(2)} in payouts are pending (not yet transferred)`);

    return Response.json({
      booking,
      vehicle: vehicle || null,
      host: host || null,
      payment_summary: {
        total_collected: totalCollected,
        // FIX #2: Breakdown instead of just paid=0
        total_payout_created: totalPayoutCreated,
        total_payout_paid: totalPaidOut,
        total_payout_pending: totalPendingPayout,
        total_paid_out: totalPaidOut,
        total_platform_fees: totalPlatformFees,
        paid_payment_count: paidLogs.length,
        failed_payment_count: failedLogs.length,
        payment_status: booking.payment_status,
        booking_status: booking.booking_status,
        payment_failure_attempts: booking.payment_failure_attempts || 0,
        starter_disabled: booking.starter_disabled || booking.moovetrax_kill_active || false,
        next_billing_date: booking.next_billing_date,
        billing_week_number: booking.billing_week_number,
        grace_period_ends_at: booking.grace_period_ends_at,
        starter_disable_scheduled_at: booking.starter_disable_scheduled_at,
      },
      payment_logs: paymentLogs,
      payouts,
      manual_fee_summary: {
        manual_logs: manualLogs,
        manual_collected: totalManualCollected,
        manual_fee_due: totalManualFeeDue,
        receivables: manualFeeReceivables,
        open_receivables: manualFeeReceivablesOpen,
        paid_receivables: manualFeeReceivablesPaid,
        waived_receivables: manualFeeReceivablesWaived,
      },
      alerts,
      notifications,
      activity_events: activityEvents,
      disputes,
      communications,
      telematics_commands: telematicsCommands,
      inspections: inspectionPackets,
      contract_template: contractTemplate || null,
      warnings,
      scope: isAdmin ? 'admin' : 'host_or_customer',
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[getBooking360]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});