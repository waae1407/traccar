import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CATEGORY_TO_TYPE = {
  new_damage: 'damage',
  excessive_dirt: 'cleaning',
  smoke_odor: 'smoking',
  missing_key_item: 'damage',
  low_fuel_battery: 'damage',
  mileage_issue: 'late_return',
  wrong_return_location: 'late_return',
  unsafe_condition: 'damage',
  other: 'damage',
};

function windowOpen(packet, vehicle) {
  if (!packet || packet.evidence_status === 'disputed') return false;
  if (packet.dispute_window_closed_at) return false;
  if (vehicle?.status === 'Available') return false;
  if (!packet.dispute_window_expires_at) return true;
  return new Date(packet.dispute_window_expires_at).getTime() > Date.now();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { booking_request_id, packet_id, photo_id, photo_slot, dispute_category, host_evidence_urls = [], notes = '' } = body;
    if (!booking_request_id || !packet_id || !photo_slot || !dispute_category || !host_evidence_urls.length) {
      return Response.json({ error: 'booking, packet, photo slot, category, and host evidence photos are required' }, { status: 400 });
    }

    const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
    const booking = bookings[0];
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });

    const hosts = await base44.asServiceRole.entities.Host.filter({ id: booking.host_id });
    const host = hosts[0];
    const isHostOwner = host?.email === user.email || host?.user_id === user.id;
    if (!isHostOwner && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const packets = await base44.asServiceRole.entities.InspectionEvidencePacket.filter({ id: packet_id });
    const packet = packets[0];
    const vehicles = booking.vehicle_id ? await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id }) : [];
    const vehicle = vehicles[0];

    if (!windowOpen(packet, vehicle)) return Response.json({ error: 'Return dispute window is closed' }, { status: 423 });

    const now = new Date().toISOString();
    const dispute = await base44.asServiceRole.entities.Dispute.create({
      booking_request_id: booking.id,
      vehicle_id: booking.vehicle_id,
      vehicle_name: booking.vehicle_name,
      host_id: booking.host_id,
      customer_email: booking.user_email,
      dispute_type: CATEGORY_TO_TYPE[dispute_category] || 'damage',
      opened_by: 'host',
      status: 'open',
      description: `[Return photo dispute] Slot: ${photo_slot}. Category: ${dispute_category}. ${notes}`,
      host_statement: notes,
      host_evidence_urls,
      due_by: packet.dispute_window_expires_at,
    });

    await base44.asServiceRole.entities.InspectionEvidencePacket.update(packet.id, {
      evidence_status: 'disputed',
      dispute_window_closed_at: now,
      dispute_window_close_reason: 'dispute_opened',
      evidence_locked_at: packet.evidence_locked_at || now,
      lock_reason: packet.lock_reason || 'host_dispute_opened',
      trust_attribution_preview: {
        status: 'pending_admin_review',
        no_party_penalty_until_resolved: true,
        dispute_category,
        linked_photo_slot: photo_slot,
      },
    });

    if (photo_id) {
      const photos = await base44.asServiceRole.entities.InspectionEvidencePhoto.filter({ id: photo_id });
      if (photos[0]) {
        await base44.asServiceRole.entities.InspectionEvidencePhoto.update(photo_id, {
          issue_flagged: true,
          dispute_status: 'open',
          linked_dispute_id: dispute.id,
        });
      }
    }

    await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
      booking_status: 'under_review',
      clean_return_status: ['excessive_dirt', 'smoke_odor'].includes(dispute_category) ? 'not_clean' : booking.clean_return_status,
      pending_review_alert_active: true,
      viewed_by_admin: false,
      admin_notes: [booking.admin_notes, `[Host Return Dispute] ${dispute_category} on ${photo_slot}: ${notes}`].filter(Boolean).join('\n'),
    });

    if (booking.vehicle_id) await base44.asServiceRole.entities.Vehicle.update(booking.vehicle_id, { status: 'Dispute Hold' });

    return Response.json({ ok: true, dispute });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});