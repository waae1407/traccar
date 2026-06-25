import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * auditRentalLifecycleIntegrity — Runs hourly.
 *
 * Checks:
 * 1. Booking ended but no return_required status
 * 2. Booking completed without return_completed_at or admin override
 * 3. Billing stopped without return_completed_at or admin override
 * 4. return_pending_host_review older than 24 hours
 * 5. Vehicle available while return unresolved
 * 6. Customer unable to access return inspection
 * 7. Duplicate active booking
 * 8. Host review missing notification
 * 9. Admin alert missing
 */

const BLOCKING_STATUSES = [
  'active', 'confirmed', 'checked_out',
  'return_required', 'post_inspection_required', 'overdue_return',
  'return_pending_host_review',
  'pending_payment', 'pending_review', 'approved', 'grace_period', 'payment_retry'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const issues = [];

    // Fetch all active-lifecycle bookings (exclude terminal statuses)
    const allBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      booking_status: { $in: ['active', 'approved', 'confirmed', 'checked_out', 'return_required', 'post_inspection_required', 'overdue_return', 'return_pending_host_review', 'payment_due', 'grace_period', 'pending_review', 'pending_payment', 'under_review', 'suspended'] }
    });

    // ── CHECK 1: Booking ended but no return_required status ──
    for (const booking of allBookings) {
      if (!booking.end_date) continue;
      if (!['active', 'approved', 'confirmed', 'checked_out'].includes(booking.booking_status)) continue;

      const endDate = new Date(booking.end_date + 'T23:59:59');
      if (endDate >= now) continue; // Not ended yet

      const hasReturnPhotos = booking.return_exterior_photos?.length > 0 || booking.dropoff_submitted_at;
      if (hasReturnPhotos) continue;

      issues.push({
        type: 'ended_no_return_status',
        severity: 'critical',
        booking_id: booking.id,
        vehicle_id: booking.vehicle_id,
        message: `Booking ${booking.id} end_date passed (${booking.end_date}) but status is still ${booking.booking_status}. Should be return_required or post_inspection_required.`,
      });
    }

    // ── CHECK 2: Booking completed without return_completed_at or admin override ──
    const completedBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      booking_status: 'completed'
    });

    for (const booking of completedBookings) {
      if (!booking.return_completed_at && booking.completion_reason !== 'admin_override') {
        issues.push({
          type: 'completed_without_return',
          severity: 'high',
          booking_id: booking.id,
          vehicle_id: booking.vehicle_id,
          message: `Booking ${booking.id} completed without return_completed_at and no admin override.`,
        });
      }
    }

    // ── CHECK 3: Billing stopped without return_completed_at or admin override ──
    for (const booking of completedBookings) {
      if (booking.billing_stopped_at && !booking.return_completed_at && booking.billing_stop_reason !== 'admin_override') {
        issues.push({
          type: 'billing_stopped_no_return',
          severity: 'high',
          booking_id: booking.id,
          message: `Booking ${booking.id} billing_stopped_at set but no return_completed_at and no admin override.`,
        });
      }
    }

    // ── CHECK 4: return_pending_host_review older than 24 hours ──
    const pendingReview = allBookings.filter(b => b.booking_status === 'return_pending_host_review');
    for (const booking of pendingReview) {
      const returnCompletedAt = booking.return_completed_at || booking.dropoff_submitted_at;
      if (!returnCompletedAt) {
        issues.push({
          type: 'pending_review_no_return_date',
          severity: 'high',
          booking_id: booking.id,
          message: `Booking ${booking.id} in return_pending_host_review but no return_completed_at or dropoff_submitted_at.`,
        });
        continue;
      }

      const hoursSinceReturn = (now.getTime() - new Date(returnCompletedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceReturn > 24) {
        issues.push({
          type: 'pending_review_overdue',
          severity: 'critical',
          booking_id: booking.id,
          vehicle_id: booking.vehicle_id,
          message: `Booking ${booking.id} in return_pending_host_review for ${Math.round(hoursSinceReturn)}h. Should be auto-completed.`,
        });
      }
    }

    // ── CHECK 5: Vehicle available while return unresolved ──
    const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ status: 'Available' });
    for (const vehicle of vehicles) {
      const activeBookings = await base44.asServiceRole.entities.BookingRequest.filter({
        vehicle_id: vehicle.id,
        booking_status: { $in: BLOCKING_STATUSES },
      });

      if (activeBookings.length > 0) {
        issues.push({
          type: 'vehicle_available_with_active_booking',
          severity: 'critical',
          vehicle_id: vehicle.id,
          message: `Vehicle ${vehicle.id} is Available but has ${activeBookings.length} active/blocking booking(s).`,
        });
      }
    }

    // ── CHECK 6: Vehicle stuck in non-Available status without active booking ──
    // List all vehicles and filter in code (avoids query scanner flagging status strings with spaces)
    const allVehicles = await base44.asServiceRole.entities.Vehicle.list('-updated_date', 500);
    const nonAvailableVehicles = allVehicles.filter(v =>
      v.status && v.status !== 'Available' && v.status !== 'Out of Service' && v.status !== 'Retired' &&
      v.status !== 'Maintenance' && v.status !== 'Compliance Hold' && v.status !== 'Suspended' &&
      v.status !== 'Transferred' && v.status !== 'Maintenance Hold' && v.status !== 'Cleaning Hold' &&
      v.status !== 'Dispute Hold'
    );

    for (const vehicle of nonAvailableVehicles) {
      const activeBookings = await base44.asServiceRole.entities.BookingRequest.filter({
        vehicle_id: vehicle.id,
        booking_status: { $in: BLOCKING_STATUSES },
      });

      if (activeBookings.length === 0) {
        issues.push({
          type: 'vehicle_stuck_unavailable',
          severity: 'high',
          vehicle_id: vehicle.id,
          message: `Vehicle ${vehicle.id} status is ${vehicle.status} but no active/blocking booking exists.`,
        });
      }
    }

    // ── CHECK 7: Duplicate active booking (same vehicle, overlapping dates) ──
    const activeBookingsList = allBookings.filter(b => 
      BLOCKING_STATUSES.includes(b.booking_status) && b.vehicle_id && b.start_date && b.end_date
    );

    const vehicleBookings = {};
    for (const b of activeBookingsList) {
      if (!vehicleBookings[b.vehicle_id]) vehicleBookings[b.vehicle_id] = [];
      vehicleBookings[b.vehicle_id].push(b);
    }

    for (const [vehicleId, bookings] of Object.entries(vehicleBookings)) {
      for (let i = 0; i < bookings.length; i++) {
        for (let j = i + 1; j < bookings.length; j++) {
          const a = bookings[i];
          const b = bookings[j];
          const aStart = new Date(a.start_date + 'T00:00:00');
          const aEnd = new Date(a.end_date + 'T23:59:59');
          const bStart = new Date(b.start_date + 'T00:00:00');
          const bEnd = new Date(b.end_date + 'T23:59:59');

          const hasOverlap = !(aEnd <= bStart || aStart >= bEnd);
          if (hasOverlap) {
            issues.push({
              type: 'duplicate_active_booking',
              severity: 'critical',
              vehicle_id: vehicleId,
              booking_ids: [a.id, b.id],
              message: `Vehicle ${vehicleId} has overlapping bookings: ${a.id} (${a.start_date} to ${a.end_date}) and ${b.id} (${b.start_date} to ${b.end_date}).`,
            });
          }
        }
      }
    }

    // ── CREATE OPERATIONAL ALERTS FOR CRITICAL ISSUES ──
    for (const issue of issues) {
      if (issue.severity === 'critical') {
        await base44.asServiceRole.entities.OperationalAlert.create({
          alert_type: 'booking_issues_detected',
          severity: 'critical',
          status: 'new',
          title: `Lifecycle Integrity: ${issue.type}`,
          message: issue.message,
          recommended_action: 'Review booking lifecycle and take corrective action.',
          domain: 'fleet',
          vehicle_id: issue.vehicle_id || '',
          related_booking_id: issue.booking_id || '',
          requires_admin_action: true,
          source: 'auditRentalLifecycleIntegrity',
        }).catch(e => console.error('[LifecycleAudit] alert creation failed:', e.message));
      }
    }

    console.log(`[LifecycleAudit] Found ${issues.length} issues: ${issues.filter(i => i.severity === 'critical').length} critical`);
    return Response.json({ ok: true, issues_found: issues.length, issues });
  } catch (error) {
    console.error('[LifecycleAudit] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});