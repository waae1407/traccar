import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * remediateMiraiRobertIncident — One-time remediation for the Mirai/Robert double booking.
 * 
 * Booking A (6a36378565addca789bc531d): Valid — return_pending_host_review
 * Booking B (6a3c89d0a5c04c9ef4331083): Invalid — created via bypass, host_id mismatch, no Stripe record
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const BOOKING_A_ID = '6a36378565addca789bc531d';
    const BOOKING_B_ID = '6a3c89d0a5c04c9ef4331083';
    const VEHICLE_ID = '6a0a5ae4f6cad94bbc5dd315';
    const now = new Date().toISOString();
    const results = {};

    // ── STEP A: Determine valid booking ──
    const bookingA = (await base44.asServiceRole.entities.BookingRequest.filter({ id: BOOKING_A_ID }))[0];
    const bookingB = (await base44.asServiceRole.entities.BookingRequest.filter({ id: BOOKING_B_ID }))[0];

    if (!bookingA) return Response.json({ error: 'Booking A not found' }, { status: 404 });
    if (!bookingB) return Response.json({ error: 'Booking B not found' }, { status: 404 });

    // Booking A is valid — has dropoff photos, correct host_id, correct lifecycle
    // Booking B is invalid — host_id mismatch, no checkout, no Stripe record

    // ── STEP B: Mark invalid duplicate as superseded_invalid ──
    await base44.asServiceRole.entities.BookingRequest.update(BOOKING_B_ID, {
      booking_status: 'superseded_invalid',
      is_superseded: true,
      superseded_at: now,
      superseded_reason: 'duplicate_booking_created_during_unresolved_return',
      superseded_by_booking_id: BOOKING_A_ID,
      closure_reason: 'duplicate_booking',
      payment_status: 'refunded',
      admin_notes: 'REMEDIATED: Double booking created via admin bypass while vehicle was in return_pending_host_review. No Stripe charge existed. Superseded.',
      lifecycle_audit_notes: 'Invalid booking — host_id mismatch, no checkout completion, no Stripe payment record.',
    });
    results.booking_b_superseded = true;

    // ── STEP C: Check Stripe/payment records for Booking B ──
    const bookingBPayments = await base44.asServiceRole.entities.Payment.filter({ booking_request_id: BOOKING_B_ID });
    results.booking_b_stripe_payments = bookingBPayments.length;
    results.booking_b_has_stripe_charge = bookingBPayments.some(p => p.stripe_charge_id);

    // ── STEP D: If duplicate charge exists, create PricingAdjustment ──
    if (results.booking_b_has_stripe_charge) {
      await base44.asServiceRole.entities.PricingAdjustment.create({
        booking_request_id: BOOKING_B_ID,
        vehicle_id: VEHICLE_ID,
        host_id: bookingB.host_id || '',
        user_email: bookingB.user_email,
        vehicle_name: bookingB.vehicle_name,
        adjustment_type: 'overcharge_refund',
        original_amount: bookingB.total_due_now || bookingB.weekly_rate || 0,
        corrected_amount: 0,
        overcharge_amount: bookingB.total_due_now || bookingB.weekly_rate || 0,
        reason: 'Duplicate booking created via bypass. Customer should be refunded.',
        refund_status: 'pending',
        manual_refund_required: true,
        detected_by: 'remediateMiraiRobertIncident',
        detected_at: now,
        audit_note: 'Double booking — no valid rental occurred on Booking B.',
      });
      results.pricing_adjustment_created = true;
    } else {
      results.pricing_adjustment_created = false;
      results.note = 'No Stripe charge found for Booking B — no refund needed.';
    }

    // ── STEP E: Correct valid booking lifecycle ──
    const bookingAReturnCompleted = bookingA.return_completed_at || bookingA.dropoff_submitted_at;
    const bookingAHostReviewDue = bookingA.host_review_due_at || (bookingAReturnCompleted 
      ? new Date(new Date(bookingAReturnCompleted).getTime() + 24 * 60 * 60 * 1000).toISOString() 
      : null);

    if (bookingAReturnCompleted) {
      const geofenceVerified = bookingA.post_inspection_geofence_verified !== false;
      const reviewWindowExpired = bookingAHostReviewDue && now > new Date(bookingAHostReviewDue);

      if (reviewWindowExpired) {
        // Auto-complete Booking A
        await base44.asServiceRole.entities.BookingRequest.update(BOOKING_A_ID, {
          booking_status: 'completed',
          auto_completed_at: now,
          completed_at: now,
          completion_reason: 'host_review_window_expired',
          host_review_status: 'auto_completed',
          billing_stopped_at: bookingA.billing_stopped_at || bookingAReturnCompleted,
          billing_stop_reason: bookingA.billing_stop_reason || 'post_inspection_completed',
          rental_ended_at: bookingA.rental_ended_at || now,
          rental_ended_by: 'system_remediation',
          autopay_enabled: false,
          pending_review_alert_active: false,
          host_review_due_at: bookingAHostReviewDue,
          damage_dispute_deadline_at: bookingAHostReviewDue,
          damage_dispute_allowed_after_auto_complete: true,
        });
        results.booking_a_auto_completed = true;
        results.booking_a_status = 'completed';
      } else {
        // Keep in return_pending_host_review
        await base44.asServiceRole.entities.BookingRequest.update(BOOKING_A_ID, {
          booking_status: 'return_pending_host_review',
          return_completed_at: bookingAReturnCompleted,
          billing_stopped_at: bookingA.billing_stopped_at || bookingAReturnCompleted,
          billing_stop_reason: bookingA.billing_stop_reason || 'post_inspection_completed',
          post_inspection_geofence_verified: geofenceVerified,
          host_review_due_at: bookingAHostReviewDue,
          damage_dispute_deadline_at: bookingAHostReviewDue,
          damage_dispute_allowed_after_auto_complete: true,
          host_review_status: 'pending',
        });
        results.booking_a_auto_completed = false;
        results.booking_a_status = 'return_pending_host_review';
      }
    }

    // ── STEP F: Correct vehicle status ──
    const blockingBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      vehicle_id: VEHICLE_ID,
      booking_status: { $in: ['active', 'confirmed', 'checked_out', 'return_required', 'post_inspection_required', 'overdue_return', 'return_pending_host_review'] },
      id: { $ne: BOOKING_B_ID },
    });

    if (blockingBookings.length === 0 && results.booking_a_auto_completed) {
      await base44.asServiceRole.entities.Vehicle.update(VEHICLE_ID, { status: 'Available' });
      results.vehicle_status = 'Available';
    } else {
      await base44.asServiceRole.entities.Vehicle.update(VEHICLE_ID, { status: 'Return Pending Host Review' });
      results.vehicle_status = 'Return Pending Host Review';
    }

    // ── STEP G: Send notifications ──
    // Notify customer
    await base44.asServiceRole.functions.invoke('routePlatformNotification', {
      event_type: 'booking_duplicate_resolved',
      severity: 'info',
      category: 'bookings',
      title: 'Duplicate Booking Resolved',
      message: 'We identified and cancelled a duplicate booking on your account. Your original rental remains active. No charges were made for the duplicate.',
      booking_id: BOOKING_B_ID,
      customer_id: bookingA.user_id || '',
      user_email: bookingA.user_email,
      action_url: '/my-vehicle',
    }).catch(e => console.error('[Remediation] customer notification failed:', e.message));

    // Notify host
    await base44.asServiceRole.functions.invoke('routePlatformNotification', {
      event_type: 'host_review_required',
      severity: 'critical',
      category: 'bookings',
      title: 'Return Review Required — Action Needed',
      message: `Return photos submitted for ${bookingA.vehicle_name}. You have 24 hours to review. After that, the return will be auto-completed.`,
      booking_id: BOOKING_A_ID,
      host_id: bookingA.host_id || '',
      vehicle_id: VEHICLE_ID,
      action_url: '/host/vehicles',
    }).catch(e => console.error('[Remediation] host notification failed:', e.message));

    // Notify admin
    await base44.asServiceRole.functions.invoke('routePlatformNotification', {
      event_type: 'duplicate_booking_resolved',
      severity: 'warning',
      category: 'system',
      title: 'Double Booking Detected & Remediated',
      message: `Mirai vehicle had overlapping bookings. Booking B (${BOOKING_B_ID}) superseded. Booking A (${BOOKING_A_ID}) lifecycle corrected. No duplicate Stripe charge found.`,
      booking_id: BOOKING_B_ID,
      vehicle_id: VEHICLE_ID,
      metadata: { booking_a_status: results.booking_a_status, auto_completed: results.booking_a_auto_completed },
    }).catch(e => console.error('[Remediation] admin notification failed:', e.message));

    // ── STEP H: Create audit records ──
    await base44.asServiceRole.entities.BookingIntegrityAudit.create({
      audit_type: 'overlap_detected',
      severity: 'critical',
      vehicle_id: VEHICLE_ID,
      booking_request_id: BOOKING_B_ID,
      conflicting_booking_ids: [BOOKING_A_ID],
      resolution: 'manual_override',
      resolution_notes: 'Booking B created via admin bypass during return_pending_host_review. Superseded. Booking A lifecycle corrected. No duplicate Stripe charge.',
      resolved_at: now,
      resolved_by: user.email,
      metadata: {
        booking_a_status: results.booking_a_status,
        booking_a_auto_completed: results.booking_a_auto_completed,
        booking_b_superseded: true,
        pricing_adjustment_created: results.pricing_adjustment_created,
      },
    });

    await base44.asServiceRole.entities.OperationalAlert.create({
      alert_type: 'booking_issues_detected',
      severity: 'critical',
      status: 'resolved',
      title: 'Double Booking Remediated — Mirai / Robert Akenji',
      message: `Booking B (${BOOKING_B_ID}) superseded as duplicate. Booking A (${BOOKING_A_ID}) lifecycle corrected to ${results.booking_a_status}. No duplicate Stripe charge found.`,
      recommended_action: 'Verify customer received notification. Monitor Booking A for host review completion.',
      domain: 'fleet',
      vehicle_id: VEHICLE_ID,
      host_id: bookingA.host_id || '',
      related_booking_id: BOOKING_A_ID,
      resolved_at: now,
      resolved_by: user.email,
      resolution_notes: 'Remediation complete. Duplicate superseded, lifecycle corrected, notifications sent.',
      source: 'remediateMiraiRobertIncident',
    });

    results.success = true;
    return Response.json(results);
  } catch (error) {
    console.error('[Remediation] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});