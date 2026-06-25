import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * getVehicleAvailabilityCalendar — Turo-Style Calendar
 * 
 * Returns calendar data for a vehicle showing:
 * - Available dates
 * - Booked dates (from BookingRequest)
 * - Blocked dates (from VehicleAvailabilityRule)
 * - Maintenance dates
 * - Personal use dates
 * - Fast-commit lock status (<120s shows "Checkout in progress")
 * 
 * Input:
 * - vehicle_id
 * - start_month (YYYY-MM)
 * - end_month (YYYY-MM)
 * - requested_start (optional)
 * - requested_end (optional)
 * 
 * Output:
 * - calendar_days: array of day objects
 * - availability rules
 * - blocking reasons
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { vehicle_id, start_month, end_month, requested_start, requested_end } = await req.json();

    if (!vehicle_id) {
      return Response.json({ error: 'vehicle_id required' }, { status: 400 });
    }

    // Load vehicle
    const vehicles = await base44.entities.Vehicle.filter({ id: vehicle_id });
    const vehicle = vehicles[0];
    if (!vehicle) {
      return Response.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    // Parse month range
    const startDate = new Date(`${start_month}-01T00:00:00`);
    const endDate = new Date(`${end_month}-01T00:00:00`);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0); // Last day of end_month

    // Generate date range
    const dateRange = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dateRange.push(d.toISOString().split('T')[0]);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Load existing bookings for this vehicle in the date range
    const BLOCKING_STATUSES = [
      'pending_payment', 'pending_review', 'approved', 'confirmed',
      'active', 'return_pending_host_review', 'grace_period', 'payment_retry'
    ];

    const bookings = await base44.asServiceRole.entities.BookingRequest.filter({
      vehicle_id,
      booking_status: { $in: BLOCKING_STATUSES },
      start_date: { $lte: endDate.toISOString().split('T')[0] },
      end_date: { $gte: startDate.toISOString().split('T')[0] }
    });

    // Load host availability rules
    const availabilityRules = await base44.entities.VehicleAvailabilityRule.filter({
      vehicle_id,
      is_active: true,
      start_date: { $lte: endDate.toISOString().split('T')[0] },
      $or: [
        { end_date: { $gte: startDate.toISOString().split('T')[0] } },
        { end_date: null }
      ]
    });

    // Load active fast-commit locks (<120 seconds old)
    const now = new Date();
    const activeLocks = await base44.asServiceRole.entities.BookingHold.filter({
      vehicle_id,
      status: 'active',
      hold_expires_at: { $gt: now.toISOString() }
    });

    // Filter to locks <120 seconds old
    const recentLocks = activeLocks.filter(lock => {
      const lockAge = now.getTime() - new Date(lock.hold_start).getTime();
      return lockAge < 120000; // 120 seconds
    });

    // Build calendar
    const calendar = dateRange.map(date => {
      const dateObj = new Date(date + 'T12:00:00');
      const dayOfWeek = dateObj.getDay();

      // Check if date is in the past
      if (dateObj < today) {
        return {
          date,
          status: 'unavailable',
          reason_code: 'past_date',
          customer_label: 'Unavailable',
          host_label: 'Past Date',
          can_book: false
        };
      }

      // Check advance notice requirement
      const advanceNoticeHours = vehicle.advance_notice_hours || 0;
      if (advanceNoticeHours > 0) {
        const hoursFromNow = (dateObj.getTime() - today.getTime()) / (1000 * 60 * 60);
        if (hoursFromNow < advanceNoticeHours) {
          return {
            date,
            status: 'unavailable',
            reason_code: `advance_notice_${advanceNoticeHours}h`,
            customer_label: `Requires ${advanceNoticeHours}h notice`,
            host_label: 'Advance Notice Required',
            can_book: false
          };
        }
      }

      // Check fast-commit locks first (highest priority for "Checkout in progress")
      const lockOnDate = recentLocks.find(lock => {
        const lockStart = new Date(lock.hold_start);
        const lockEnd = new Date(lock.hold_expires_at);
        return dateObj >= lockStart && dateObj <= lockEnd;
      });

      if (lockOnDate) {
        return {
          date,
          status: 'checkout_in_progress',
          reason_code: 'fast_commit_lock',
          customer_label: 'Checkout in Progress',
          host_label: 'Customer Checking Out',
          expires_at: lockOnDate.hold_expires_at,
          can_book: false
        };
      }

      // Check bookings
      const bookingOnDate = bookings.find(b => {
        const bookingStart = new Date(b.start_date + 'T00:00:00');
        const bookingEnd = new Date(b.end_date + 'T23:59:59');
        return dateObj >= bookingStart && dateObj <= bookingEnd;
      });

      if (bookingOnDate) {
        return {
          date,
          status: 'booked',
          reason_code: 'already_booked',
          customer_label: 'Booked',
          host_label: `Booked (${bookingOnDate.booking_status})`,
          booking_id: bookingOnDate.id,
          can_book: false
        };
      }

      // Check host availability rules
      const ruleOnDate = availabilityRules.find(rule => {
        const ruleStart = new Date(rule.start_date + 'T00:00:00');
        const ruleEnd = rule.end_date ? new Date(rule.end_date + 'T23:59:59') : null;

        // Single date rule
        if (!rule.end_date) {
          return rule.start_date === date;
        }

        // Date range rule
        if (ruleEnd && (dateObj < ruleStart || dateObj > ruleEnd)) {
          return false;
        }

        // Recurring rules
        if (rule.repeats && rule.repeat_rule) {
          if (rule.repeat_rule === 'weekdays' && (dayOfWeek === 0 || dayOfWeek === 6)) {
            return false;
          }
          if (rule.repeat_rule === 'weekends' && dayOfWeek !== 0 && dayOfWeek !== 6) {
            return false;
          }
          if (rule.repeat_rule === 'custom' && rule.repeat_days && !rule.repeat_days.includes(dayOfWeek)) {
            return false;
          }
        }

        return true;
      });

      if (ruleOnDate) {
        const statusMap = {
          'blocked': 'unavailable',
          'maintenance': 'maintenance',
          'personal_use': 'unavailable',
          'blackout': 'unavailable',
          'available_override': 'available',
          'pickup_window': 'available',
          'return_window': 'available'
        };

        const labelMap = {
          'blocked': 'Host Blocked',
          'maintenance': 'Maintenance',
          'personal_use': 'Personal Use',
          'blackout': 'Unavailable',
          'available_override': 'Available',
          'pickup_window': 'Available',
          'return_window': 'Available'
        };

        return {
          date,
          status: statusMap[ruleOnDate.rule_type] || 'unavailable',
          reason_code: ruleOnDate.rule_type,
          customer_label: labelMap[ruleOnDate.rule_type] || 'Unavailable',
          host_label: ruleOnDate.reason || labelMap[ruleOnDate.rule_type],
          rule_id: ruleOnDate.id,
          can_book: ruleOnDate.rule_type === 'available_override'
        };
      }

      // Default availability
      const isAvailable = vehicle.available_by_default !== false;
      return {
        date,
        status: isAvailable ? 'available' : 'unavailable',
        reason_code: isAvailable ? 'available' : 'host_blocked_by_default',
        customer_label: isAvailable ? 'Available' : 'Unavailable',
        host_label: isAvailable ? 'Available for booking' : 'Blocked by default',
        can_book: isAvailable,
        pricing: {
          daily_rate: vehicle.daily_rate,
          weekly_rate: vehicle.weekly_rate,
          monthly_rate: vehicle.monthly_rate
        },
        minimum_rental_days: vehicle.minimum_rental_days,
        maximum_rental_days: vehicle.maximum_rental_days
      };
    });

    return Response.json({
      vehicle_id,
      calendar,
      rules: {
        minimum_rental_days: vehicle.minimum_rental_days || 7,
        maximum_rental_days: vehicle.maximum_rental_days,
        advance_notice_hours: vehicle.advance_notice_hours,
        instant_booking_enabled: vehicle.instant_booking_enabled !== false,
        pickup_window_start: vehicle.pickup_window_start,
        pickup_window_end: vehicle.pickup_window_end,
        return_window_start: vehicle.return_window_start,
        return_window_end: vehicle.return_window_end,
        rental_types: {
          daily: vehicle.allow_daily_booking || false,
          weekly: vehicle.allow_weekly_booking || true,
          monthly: vehicle.allow_monthly_booking || false,
          rent_to_own: vehicle.rent_to_own_eligible || false
        },
        contactless_pickup: vehicle.contactless_pickup || false,
        delivery_available: vehicle.delivery_available || false
      }
    });
  } catch (error) {
    console.error('[getVehicleAvailabilityCalendar] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});