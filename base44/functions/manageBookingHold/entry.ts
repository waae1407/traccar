import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * manageBookingHold — Create, Release, or Expire Booking Holds
 * 
 * Operations:
 * - create: Reserve vehicle for 10 minutes during checkout
 * - release: Manually release hold (customer cancelled)
 * - convert: Link hold to created BookingRequest
 * - expire: System releases expired holds
 */

const HOLD_DURATION_MINUTES = 10;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { operation, vehicle_id, session_id, booking_request_id } = await req.json();

    if (!vehicle_id) {
      return Response.json({ error: 'vehicle_id required' }, { status: 400 });
    }

    const now = new Date();

    if (operation === 'create') {
      // Check for existing active holds on this vehicle
      const existingHolds = await base44.asServiceRole.entities.BookingHold.filter({
        vehicle_id,
        status: 'active',
        hold_expires_at: { $gt: now.toISOString() }
      });

      if (existingHolds.length > 0) {
        return Response.json({
          ok: false,
          error: 'VEHICLE_ALREADY_HELD',
          hold_id: existingHolds[0].id,
          expires_at: existingHolds[0].hold_expires_at,
        });
      }

      // Check vehicle availability
      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicle_id });
      const vehicle = vehicles[0];
      
      if (!vehicle || vehicle.status === 'Compliance Hold') {
        return Response.json({ ok: false, error: 'VEHICLE_UNAVAILABLE' });
      }

      // Create hold
      const expiresAt = new Date(now.getTime() + HOLD_DURATION_MINUTES * 60 * 1000);
      
      const hold = await base44.asServiceRole.entities.BookingHold.create({
        vehicle_id,
        session_id: session_id || crypto.randomUUID(),
        customer_id: user.id,
        customer_email: user.email,
        hold_start: now.toISOString(),
        hold_expires_at: expiresAt.toISOString(),
        status: 'active',
      });

      // Update vehicle status to Reserved
      await base44.asServiceRole.entities.Vehicle.update(vehicle_id, {
        status: 'Reserved'
      });

      return Response.json({
        ok: true,
        hold_id: hold.id,
        expires_at: expiresAt.toISOString(),
        hold_duration_minutes: HOLD_DURATION_MINUTES,
      });
    }

    if (operation === 'release') {
      const holds = await base44.asServiceRole.entities.BookingHold.filter({
        id: session_id || booking_request_id,
        status: 'active'
      });

      if (holds.length === 0) {
        return Response.json({ ok: false, error: 'HOLD_NOT_FOUND' });
      }

      const hold = holds[0];

      // Release hold
      await base44.asServiceRole.entities.BookingHold.update(hold.id, {
        status: 'released',
        released_at: now.toISOString(),
        released_by: user.id,
        release_reason: 'Manual release',
      });

      // Restore vehicle status to Available
      await base44.asServiceRole.entities.Vehicle.update(hold.vehicle_id, {
        status: 'Available'
      });

      return Response.json({ ok: true, hold_id: hold.id, released: true });
    }

    if (operation === 'convert') {
      if (!booking_request_id) {
        return Response.json({ error: 'booking_request_id required for convert' }, { status: 400 });
      }

      const holds = await base44.asServiceRole.entities.BookingHold.filter({
        vehicle_id,
        customer_id: user.id,
        status: 'active'
      });

      if (holds.length === 0) {
        return Response.json({ ok: false, error: 'NO_ACTIVE_HOLD' });
      }

      const hold = holds[0];

      // Convert hold to booking
      await base44.asServiceRole.entities.BookingHold.update(hold.id, {
        status: 'converted',
        booking_request_id,
        released_at: now.toISOString(),
        released_by: 'system',
        release_reason: 'Converted to booking',
      });

      // Vehicle status will be updated by booking status automation
      return Response.json({ ok: true, hold_id: hold.id, booking_request_id, converted: true });
    }

    if (operation === 'expire') {
      // System operation — release all expired holds
      const expiredHolds = await base44.asServiceRole.entities.BookingHold.filter({
        status: 'active',
        hold_expires_at: { $lte: now.toISOString() }
      });

      let released = 0;
      for (const hold of expiredHolds) {
        await base44.asServiceRole.entities.BookingHold.update(hold.id, {
          status: 'expired',
          released_at: now.toISOString(),
          released_by: 'system',
          release_reason: 'Hold expired automatically',
        });

        // Restore vehicle status
        await base44.asServiceRole.entities.Vehicle.update(hold.vehicle_id, {
          status: 'Available'
        });

        released++;
      }

      return Response.json({ ok: true, expired_holds_released: released });
    }

    return Response.json({ error: 'Invalid operation' }, { status: 400 });
  } catch (error) {
    console.error('[manageBookingHold] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});