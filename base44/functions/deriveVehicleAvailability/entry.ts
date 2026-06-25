import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * deriveVehicleAvailability — Centralized Vehicle Availability Source of Truth
 *
 * Derives vehicle availability from active booking lifecycle, NOT from vehicle.status alone.
 * Vehicle.status may be stale — this function checks the actual blocking state.
 *
 * Returns: { availability_status, can_book, blocking_booking_id, blocking_reason, blocking_phase }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { vehicle_id, start_date, end_date } = body;

    if (!vehicle_id) {
      return Response.json({ error: 'vehicle_id required' }, { status: 400 });
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // ── 1. Check vehicle exists ──
    const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicle_id });
    const vehicle = vehicles[0];
    if (!vehicle) {
      return Response.json({
        availability_status: 'unavailable',
        can_book: false,
        blocking_booking_id: null,
        blocking_reason: 'Vehicle not found',
        blocking_phase: 'missing'
      });
    }

    // ── 2. Check active BookingCommitLocks (<120s fast-commit) ──
    const activeHolds = await base44.asServiceRole.entities.BookingHold.filter({
      vehicle_id,
      status: 'active',
      hold_expires_at: { $gte: now.toISOString() }
    });

    const activeFastCommitLocks = activeHolds.filter(h => {
      const holdAge = now.getTime() - new Date(h.hold_start).getTime();
      return holdAge < 120000;
    });

    if (activeFastCommitLocks.length > 0) {
      return Response.json({
        availability_status: 'checkout_in_progress',
        can_book: false,
        blocking_booking_id: null,
        blocking_reason: 'Another customer is completing checkout for this vehicle',
        blocking_phase: 'checkout'
      });
    }

    // ── 3. Check active/blocking bookings ──
    const BLOCKING_STATUSES = [
      'pending_payment', 'pending_review', 'approved', 'confirmed', 'checked_out',
      'active', 'return_required', 'post_inspection_required', 'overdue_return',
      'return_pending_host_review', 'grace_period', 'payment_retry',
      'payment_due', 'suspended', 'under_review'
    ];

    const BLOCKING_PHASES = [
      'payment_complete', 'pickup_required', 'checked_out', 'active',
      'return_required', 'return_in_progress', 'host_review'
    ];

    const allBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      vehicle_id
    });

    // Filter to active blocking bookings (not superseded, not completed, not cancelled)
    const blockingBookings = allBookings.filter(b => {
      if (b.is_superseded) return false;
      if (b.booking_status === 'completed' || b.booking_status === 'cancelled' || b.booking_status === 'superseded_invalid') return false;
      if (!BLOCKING_STATUSES.includes(b.booking_status)) return false;
      // If phase is set, check it too — but if phase is null, fall back to status
      if (b.rental_lifecycle_phase) {
        if (!BLOCKING_PHASES.includes(b.rental_lifecycle_phase)) return false;
      }
      return true;
    });

    // If date range specified, check for overlap
    let relevantBlockingBookings = blockingBookings;
    if (start_date && end_date) {
      const reqStart = new Date(start_date + 'T00:00:00');
      const reqEnd = new Date(end_date + 'T23:59:59');
      relevantBlockingBookings = blockingBookings.filter(b => {
        if (!b.start_date || !b.end_date) return true; // Block if no dates — can't verify
        const bStart = new Date(b.start_date + 'T00:00:00');
        const bEnd = new Date(b.end_date + 'T23:59:59');
        const hasOverlap = !(reqEnd <= bStart || reqStart >= bEnd);
        return hasOverlap;
      });
    }

    if (relevantBlockingBookings.length > 0) {
      const booking = relevantBlockingBookings[0];
      const phase = booking.rental_lifecycle_phase || '';
      let availabilityStatus = 'booked';

      // Derive more specific status from phase/status
      if (phase === 'active' || phase === 'checked_out' || ['active', 'checked_out', 'confirmed', 'approved'].includes(booking.booking_status)) {
        availabilityStatus = 'rented';
      } else if (phase === 'return_required' || phase === 'return_in_progress' || ['return_required', 'post_inspection_required', 'overdue_return'].includes(booking.booking_status)) {
        availabilityStatus = 'return_required';
      } else if (phase === 'host_review' || booking.booking_status === 'return_pending_host_review') {
        availabilityStatus = 'host_review';
      }

      return Response.json({
        availability_status: availabilityStatus,
        can_book: false,
        blocking_booking_id: booking.id,
        blocking_reason: `Active booking: ${booking.booking_status}`,
        blocking_phase: phase || booking.booking_status,
        blocking_booking_dates: { start: booking.start_date, end: booking.end_date }
      });
    }

    // ── 4. Check maintenance/blocked availability rules ──
    const availabilityRules = await base44.asServiceRole.entities.VehicleAvailabilityRule.filter({
      vehicle_id,
      is_active: true,
      rule_type: { $in: ['blocked', 'maintenance', 'personal_use', 'blackout'] }
    });

    for (const rule of availabilityRules) {
      const ruleStart = new Date(rule.start_date + 'T00:00:00');
      const ruleEnd = rule.end_date ? new Date(rule.end_date + 'T23:59:59') : ruleStart;

      // If date range specified, check overlap
      if (start_date && end_date) {
        const reqStart = new Date(start_date + 'T00:00:00');
        const reqEnd = new Date(end_date + 'T23:59:59');
        const hasOverlap = !(reqEnd <= ruleStart || reqStart >= ruleEnd);
        if (!hasOverlap) continue;
      } else {
        // No date range — check if rule covers today
        if (ruleStart > now || (rule.end_date && ruleEnd < now)) continue;
      }

      const status = rule.rule_type === 'maintenance' ? 'maintenance' : 'unavailable';
      return Response.json({
        availability_status: status,
        can_book: false,
        blocking_booking_id: null,
        blocking_reason: rule.customer_reason || rule.rule_type,
        blocking_phase: 'availability_rule',
        rule_dates: { start: rule.start_date, end: rule.end_date || rule.start_date }
      });
    }

    // ── 5. Check vehicle hard-status blocks ──
    const HARD_BLOCK_STATUSES = ['Maintenance', 'Maintenance Hold', 'Compliance Hold', 'Suspended', 'Out of Service', 'Retired', 'Dispute Hold', 'Cleaning Hold'];
    if (HARD_BLOCK_STATUSES.includes(vehicle.status)) {
      return Response.json({
        availability_status: vehicle.status === 'Maintenance' || vehicle.status === 'Maintenance Hold' ? 'maintenance' : 'unavailable',
        can_book: false,
        blocking_booking_id: null,
        blocking_reason: `Vehicle status: ${vehicle.status}`,
        blocking_phase: 'vehicle_status'
      });
    }

    // ── 6. Check marketplace visibility flags ──
    if (vehicle.marketplace_visible === false || vehicle.admin_marketplace_approved === false) {
      return Response.json({
        availability_status: 'unavailable',
        can_book: false,
        blocking_booking_id: null,
        blocking_reason: 'Not marketplace visible',
        blocking_phase: 'visibility'
      });
    }

    if (vehicle.approval_status === 'rejected') {
      return Response.json({
        availability_status: 'unavailable',
        can_book: false,
        blocking_booking_id: null,
        blocking_reason: 'Vehicle approval rejected',
        blocking_phase: 'approval'
      });
    }

    // ── 7. Available! ──
    return Response.json({
      availability_status: 'available',
      can_book: true,
      blocking_booking_id: null,
      blocking_reason: null,
      blocking_phase: null
    });

  } catch (error) {
    console.error('[deriveVehicleAvailability] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});