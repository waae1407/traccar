import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function getBooking(base44, id) {
  const rows = await base44.asServiceRole.entities.BookingRequest.filter({ id });
  return rows[0];
}

function shouldReleaseVehicle(vehicle) {
  return vehicle && !['Maintenance', 'Compliance Hold', 'Retired', 'Cleaning Hold', 'Maintenance Hold', 'Dispute Hold'].includes(vehicle.status);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { booking_request_id } = await req.json();
    if (!booking_request_id) return Response.json({ error: 'booking_request_id is required' }, { status: 400 });

    const booking = await getBooking(base44, booking_request_id);
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });

    const hosts = await base44.asServiceRole.entities.Host.filter({ id: booking.host_id });
    const host = hosts[0];
    const isHostOwner = host?.email === user.email || host?.user_id === user.id;
    if (!isHostOwner && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const packets = await base44.asServiceRole.entities.InspectionEvidencePacket.filter({ booking_request_id, inspection_type: 'dropoff' }, '-created_date', 1);
    const packet = packets[0];
    const now = new Date().toISOString();

    if (packet?.dispute_window_closed_at && packet.dispute_window_close_reason !== '') {
      return Response.json({ ok: true, skipped: 'window_already_closed' });
    }

    if (packet) {
      await base44.asServiceRole.entities.InspectionEvidencePacket.update(packet.id, {
        evidence_status: 'accepted',
        evidence_locked_at: packet.evidence_locked_at || now,
        lock_reason: packet.lock_reason || 'host_accepted_return',
        dispute_window_closed_at: now,
        dispute_window_close_reason: 'host_accepted',
      });
    }

    await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
      booking_status: 'completed',
      clean_return_status: 'approved_clean',
      rental_ended_at: booking.rental_ended_at || now,
      rental_ended_by: user.role === 'admin' ? 'admin_return_acceptance' : 'host_return_acceptance',
      host_review_completed_at: now,
      host_review_status: 'approved',
      completed_at: now,
      completion_reason: 'host_approved_return',
      billing_stopped_at: booking.billing_stopped_at || booking.return_completed_at || now,
      billing_stop_reason: booking.billing_stop_reason || 'host_approved_return',
      autopay_enabled: false,
      pending_review_alert_active: false,
    });

    if (booking.vehicle_id) {
      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
      const vehicle = vehicles[0];
      if (shouldReleaseVehicle(vehicle)) {
        await base44.asServiceRole.entities.Vehicle.update(booking.vehicle_id, { status: 'Available' });
      }
    }

    return Response.json({ ok: true, accepted_at: now });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});