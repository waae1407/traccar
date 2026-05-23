import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Maps BookingRequest.booking_status → Vehicle.status.
 * Called by entity automation on BookingRequest updates when booking_status changes.
 * Must be idempotent and respect protected vehicle statuses.
 */

const BOOKING_TO_VEHICLE_STATUS = {
  "approved": "Reserved",
  "confirmed": "Reserved",
  "active": "Active Rental",
  "payment_due": "Payment Due",
  "grace_period": "Grace Period",
  "suspended": "Suspended",
  "completed": "Available",
  "return_pending_host_review": "Return Pending Host Review",
  "under_review": "Dispute Hold",
  "cancelled": "Available",
  "rejected": "Available",
};

// These vehicle statuses are set manually and must not be overridden by automation
const PROTECTED_VEHICLE_STATUSES = ["Compliance Hold", "Maintenance", "Retired", "Cleaning Hold", "Maintenance Hold", "Dispute Hold", "Return Pending Host Review"];

async function logEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: 'automation',
      actor_email: 'automation@uridehub.com',
      actor_role: 'automation',
      target_entity: 'Vehicle',
      target_id: data.vehicle_id || '',
      host_id: data.host_id || '',
      booking_id: data.booking_id || '',
      vehicle_id: data.vehicle_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: 'automation',
      user_email: 'automation@uridehub.com',
      event_title: data.summary || data.event_type,
      event_status: 'success',
    });
  } catch (e) {
    console.error('[AuditLog]', e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    // Entity automation payload structure
    const bookingId = payload.event?.entity_id;
    let booking = payload.data; // may be null if payload_too_large

    if (!bookingId) {
      console.log('[SyncVehicleStatus] No booking ID in payload — skipping');
      return Response.json({ ok: true, skipped: 'no_booking_id' });
    }

    // Fetch booking if not in payload (payload_too_large scenario)
    if (!booking) {
      const records = await base44.asServiceRole.entities.BookingRequest.filter({ id: bookingId });
      booking = records[0];
    }

    if (!booking) {
      return Response.json({ ok: true, skipped: 'booking_not_found' });
    }

    // Determine target vehicle status
    const targetVehicleStatus = BOOKING_TO_VEHICLE_STATUS[booking.booking_status];
    if (!targetVehicleStatus) {
      console.log(`[SyncVehicleStatus] No mapping for booking_status: ${booking.booking_status} — skipping`);
      return Response.json({ ok: true, skipped: `no_mapping_for_${booking.booking_status}` });
    }

    if (!booking.vehicle_id) {
      return Response.json({ ok: true, skipped: 'no_vehicle_id' });
    }

    // Get current vehicle
    const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
    const vehicle = vehicles[0];
    if (!vehicle) {
      return Response.json({ ok: true, skipped: 'vehicle_not_found' });
    }

    // Idempotency: skip if already correct
    if (vehicle.status === targetVehicleStatus) {
      console.log(`[SyncVehicleStatus] Vehicle ${booking.vehicle_id} already ${targetVehicleStatus}`);
      return Response.json({ ok: true, skipped: 'already_correct', status: targetVehicleStatus });
    }

    // Protect manual-only statuses from automation override
    // Exception: terminal bookings may release only from non-dispute/non-maintenance holds
    const isTerminalBooking = ["completed", "cancelled", "rejected"].includes(booking.booking_status);
    const protectedTerminalHold = ["Dispute Hold", "Cleaning Hold", "Maintenance Hold", "Maintenance", "Compliance Hold", "Retired"].includes(vehicle.status);
    if (isTerminalBooking && protectedTerminalHold) {
      console.log(`[SyncVehicleStatus] Terminal booking but vehicle is protected by ${vehicle.status} — skipping release`);
      return Response.json({ ok: true, skipped: 'protected_terminal_hold', current: vehicle.status });
    }
    if (PROTECTED_VEHICLE_STATUSES.includes(vehicle.status) && !isTerminalBooking) {
      console.log(`[SyncVehicleStatus] Vehicle ${booking.vehicle_id} in protected status: ${vehicle.status} — skipping`);
      return Response.json({ ok: true, skipped: 'protected_status', current: vehicle.status });
    }

    // Apply the transition
    const prevStatus = vehicle.status;
    await base44.asServiceRole.entities.Vehicle.update(booking.vehicle_id, {
      status: targetVehicleStatus,
    });

    console.log(`[SyncVehicleStatus] Vehicle ${booking.vehicle_id}: ${prevStatus} → ${targetVehicleStatus} (booking ${bookingId} status: ${booking.booking_status})`);

    await logEvent(base44, {
      event_type: 'vehicle.status_changed',
      vehicle_id: booking.vehicle_id,
      host_id: booking.host_id || '',
      booking_id: bookingId,
      summary: `Vehicle status: ${prevStatus} → ${targetVehicleStatus} (booking ${booking.booking_status})`,
      metadata: {
        from: prevStatus,
        to: targetVehicleStatus,
        booking_status: booking.booking_status,
        booking_id: bookingId,
      },
    });

    return Response.json({ ok: true, vehicle_id: booking.vehicle_id, from: prevStatus, to: targetVehicleStatus });
  } catch (error) {
    console.error('[SyncVehicleStatus] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});