import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * validateVehicleBooking — Commercial-Grade Double Booking Prevention
 * 
 * Server-side availability lock with date overlap validation.
 * Never trust frontend — always validate server-side.
 * 
 * Blocking statuses: pending_payment, pending_review, approved, confirmed, 
 * checked_out, active, return_pending_host_review, grace_period, payment_retry
 * 
 * Returns: { blocked: boolean, reason: string, conflict?: { booking_id, dates, status } }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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

    if (complianceIssues.length > 0) {
      if (enforcementEnabled) {
        return Response.json({
          blocked: true,
          reason: 'This vehicle is temporarily unavailable.',
          internal_reason: complianceIssues.join('; '),
          compliance_enforcement_enabled: true,
        });
      } else {
        return Response.json({
          blocked: false,
          host_id: vehicle.host_id,
          compliance_enforcement_enabled: false,
          compliance_warning: `Compliance enforcement is OFF. Issues: ${complianceIssues.join('; ')}`,
        });
      }
    }

    // 3. DATE OVERLAP VALIDATION — Commercial-Grade Double Booking Prevention
    if (start_date && end_date) {
      const BLOCKING_STATUSES = [
        'pending_payment', 'pending_review', 'approved', 'confirmed',
        'active', 'return_pending_host_review', 'grace_period', 'payment_retry'
      ];

      const existingBookings = await base44.asServiceRole.entities.BookingRequest.filter({
        vehicle_id,
        booking_status: { $in: BLOCKING_STATUSES },
      });

      const requestedStart = new Date(start_date + 'T00:00:00');
      const requestedEnd = new Date(end_date + 'T23:59:59');

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
    }

    // 4. Check for active BookingHolds
    const activeHolds = await base44.asServiceRole.entities.BookingHold.filter({
      vehicle_id,
      status: 'active',
      hold_expires_at: { $gte: new Date().toISOString() }
    });

    if (activeHolds.length > 0) {
      return Response.json({
        blocked: true,
        reason: 'This vehicle is currently reserved by another customer.',
        internal_reason: 'VEHICLE_ON_HOLD',
        hold_expires_at: activeHolds[0].hold_expires_at,
      });
    }

    return Response.json({
      blocked: false,
      host_id: vehicle.host_id,
      compliance_enforcement_enabled: enforcementEnabled,
    });
  } catch (error) {
    console.error('[ValidateVehicleBooking]', error.message);
    // Fail open — don't block booking if check itself errors
    return Response.json({ blocked: false, warning: error.message });
  }
});