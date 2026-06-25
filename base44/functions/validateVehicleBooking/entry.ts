import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * validateVehicleBooking — Commercial-Grade Double Booking Prevention
 * 
 * Server-side availability lock with comprehensive validation:
 * - Vehicle status and compliance
 * - Booking conflicts (date overlap)
 * - Minimum rental days
 * - Advance notice hours
 * - Pickup/return time windows
 * - Host availability rules (VehicleAvailabilityRule)
 * - Fast-commit locks (<120s active checkout)
 * 
 * Returns: { blocked: boolean, reason: string, internal_reason?: string, conflict?: object }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Allow testing without auth - in production would require auth
    const user = await base44.auth.me().catch(() => null);

    const { vehicle_id, start_date, end_date } = await req.json();
    if (!vehicle_id) return Response.json({ error: 'vehicle_id required' }, { status: 400 });

    // Load compliance enforcement setting (default: true)
    const platformSettings = await base44.asServiceRole.entities.PlatformSetting.filter({ key: 'compliance_enforcement_enabled' }, '-updated_date', 1).catch(() => []);
    const enforcementEnabled = platformSettings[0] ? platformSettings[0].value_boolean !== false : true;

    // 1. Check vehicle exists and status
    const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicle_id });
    const vehicle = vehicles[0];
    if (!vehicle) {
      return Response.json({ blocked: true, reason: 'This vehicle is temporarily unavailable.', internal_reason: 'Vehicle not found' });
    }

    if (!vehicle.host_id) {
      return Response.json({
        blocked: true,
        reason: 'This vehicle is temporarily unavailable.',
        internal_reason: 'Vehicle is missing required host assignment'
      });
    }

    // Compliance Hold always blocks regardless of enforcement setting
    if (vehicle.status === 'Compliance Hold') {
      return Response.json({
        blocked: true,
        reason: 'This vehicle is temporarily unavailable.',
        internal_reason: 'Vehicle status: Compliance Hold — expired or missing compliance documents'
      });
    }

    if (vehicle.status !== 'Available' && vehicle.status !== 'Reserved') {
      return Response.json({
        blocked: true,
        reason: 'This vehicle is not currently available for booking.',
        internal_reason: `Vehicle status: ${vehicle.status}`
      });
    }

    // 2. Check compliance documents
    const compliance = await base44.asServiceRole.entities.HostVehicleCompliance.filter({ vehicle_id });

    const expiredDocs = compliance.filter(c => c.status === 'expired');
    const requiredTypes = ['insurance', 'registration'];
    const uploadedTypes = compliance.map(c => c.doc_type);
    const missingRequired = requiredTypes.filter(t => !uploadedTypes.includes(t));

    const complianceIssues = [];
    if (expiredDocs.length > 0) complianceIssues.push(`Expired docs: ${expiredDocs.map(c => c.doc_type).join(', ')}`);
    if (missingRequired.length > 0) complianceIssues.push(`Missing docs: ${missingRequired.join(', ')}`);

    let complianceWarning = null;
    if (complianceIssues.length > 0) {
      if (enforcementEnabled) {
        return Response.json({
          blocked: true,
          reason: 'This vehicle is temporarily unavailable.',
          internal_reason: complianceIssues.join('; '),
          compliance_enforcement_enabled: true,
        });
      } else {
        // Enforcement OFF - warn but continue to check availability rules
        complianceWarning = `Compliance enforcement is OFF. Issues: ${complianceIssues.join('; ')}`;
      }
    }

    // 3. DATE OVERLAP VALIDATION — Commercial-Grade Double Booking Prevention
    if (start_date && end_date) {
      const requestedStart = new Date(start_date + 'T00:00:00');
      const requestedEnd = new Date(end_date + 'T23:59:59');
      const rentalDays = Math.ceil((requestedEnd - requestedStart) / (1000 * 60 * 60 * 24));

      // 3a. Check minimum rental days
      const minRentalDays = vehicle.minimum_rental_days || 7;
      if (rentalDays < minRentalDays) {
        return Response.json({
          blocked: true,
          reason: `This vehicle requires a minimum rental of ${minRentalDays} days.`,
          internal_reason: 'MINIMUM_RENTAL_DAYS',
          minimum_required: minRentalDays,
          requested_days: rentalDays,
        });
      }

      // 3b. Check advance notice
      const advanceNoticeHours = vehicle.advance_notice_hours || 0;
      if (advanceNoticeHours > 0) {
        const hoursFromNow = (requestedStart.getTime() - new Date().getTime()) / (1000 * 60 * 60);
        if (hoursFromNow < advanceNoticeHours) {
          return Response.json({
            blocked: true,
            reason: `This vehicle requires ${advanceNoticeHours} hours advance notice.`,
            internal_reason: 'ADVANCE_NOTICE',
            advance_notice_hours: advanceNoticeHours,
            hours_from_now: Math.round(hoursFromNow),
          });
        }
      }

      // 3c. Check pickup/return windows
      if (vehicle.pickup_window_start && vehicle.pickup_window_end) {
        const pickupHour = parseInt(vehicle.pickup_window_start.split(':')[0]);
        const pickupMinute = parseInt(vehicle.pickup_window_start.split(':')[1]);
        const requestedPickupHour = requestedStart.getHours();
        const requestedPickupMinute = requestedStart.getMinutes();
        const requestedTime = requestedPickupHour * 60 + requestedPickupMinute;
        const windowStart = pickupHour * 60 + pickupMinute;
        const windowEnd = parseInt(vehicle.pickup_window_end.split(':')[0]) * 60 + parseInt(vehicle.pickup_window_end.split(':')[1]);
        
        if (requestedTime < windowStart || requestedTime > windowEnd) {
          return Response.json({
            blocked: true,
            reason: `Pickup must be between ${vehicle.pickup_window_start} and ${vehicle.pickup_window_end}.`,
            internal_reason: 'PICKUP_WINDOW',
            pickup_window: { start: vehicle.pickup_window_start, end: vehicle.pickup_window_end },
          });
        }
      }

      // 3d. Check booking conflicts
      const BLOCKING_STATUSES = [
        'pending_payment', 'pending_review', 'approved', 'confirmed',
        'active', 'return_pending_host_review', 'grace_period', 'payment_retry'
      ];

      const existingBookings = await base44.asServiceRole.entities.BookingRequest.filter({
        vehicle_id,
        booking_status: { $in: BLOCKING_STATUSES },
      });

      for (const booking of existingBookings) {
        if (!booking.start_date || !booking.end_date) continue;

        const existingStart = new Date(booking.start_date + 'T00:00:00');
        const existingEnd = new Date(booking.end_date + 'T23:59:59');

        const hasOverlap = !(requestedEnd <= existingStart || requestedStart >= existingEnd);

        if (hasOverlap) {
          return Response.json({
            blocked: true,
            reason: 'This vehicle is not available for the selected dates.',
            internal_reason: 'BOOKING_CONFLICT',
            conflict: {
              booking_id: booking.id,
              conflicting_dates: { start: booking.start_date, end: booking.end_date },
              booking_status: booking.booking_status,
            },
          });
        }
      }

      // 3e. Check host availability rules (VehicleAvailabilityRule)
      const availabilityRules = await base44.asServiceRole.entities.VehicleAvailabilityRule.filter({
        vehicle_id,
        is_active: true,
        rule_type: { $in: ['blocked', 'maintenance', 'personal_use', 'blackout'] },
      });

      for (const rule of availabilityRules) {
        const ruleStart = new Date(rule.start_date + 'T00:00:00');
        const ruleEnd = rule.end_date ? new Date(rule.end_date + 'T23:59:59') : ruleStart; // Single-day rule

        // PROPER OVERLAP LOGIC: Two ranges overlap if NOT (requested_end <= rule_start OR requested_start >= rule_end)
        // Simplified: requestedEnd > ruleStart AND requestedStart < ruleEnd
        const hasOverlap = requestedStart <= ruleEnd && requestedEnd >= ruleStart;

        if (hasOverlap) {
          return Response.json({
            blocked: true,
            reason: rule.customer_reason || 'This vehicle is unavailable on the selected dates.',
            internal_reason: 'HOST_AVAILABILITY_RULE',
            rule_type: rule.rule_type,
            rule_dates: { start: rule.start_date, end: rule.end_date || rule.start_date },
            overlap_details: {
              requested: { start: start_date, end: end_date },
              rule: { start: rule.start_date, end: rule.end_date || rule.start_date }
            }
          });
        }
      }
    }

    // 4. Check for active BookingHolds (fast-commit locks <120s)
    const activeHolds = await base44.asServiceRole.entities.BookingHold.filter({
      vehicle_id,
      status: 'active',
      hold_expires_at: { $gte: new Date().toISOString() }
    });

    // Filter to only locks <120 seconds old (active checkout in progress)
    const now = new Date().getTime();
    const activeFastCommitLocks = activeHolds.filter(hold => {
      const holdAge = now - new Date(hold.hold_start).getTime();
      return holdAge < 120000; // 120 seconds
    });

    if (activeFastCommitLocks.length > 0) {
      return Response.json({
        blocked: true,
        reason: 'Another customer is completing checkout for this vehicle. Please try again in a moment.',
        internal_reason: 'FAST_COMMIT_LOCK',
        lock_expires_at: activeFastCommitLocks[0].hold_expires_at,
        lock_age_seconds: Math.round((now - new Date(activeFastCommitLocks[0].hold_start).getTime()) / 1000),
      });
    }

    return Response.json({
      blocked: false,
      host_id: vehicle.host_id,
      compliance_enforcement_enabled: enforcementEnabled,
      ...(complianceWarning && { compliance_warning: complianceWarning })
    });
  } catch (error) {
    console.error('[ValidateVehicleBooking] Error:', error.message);
    // Fail open — don't block booking if check itself errors
    return Response.json({ blocked: false, warning: error.message });
  }
});