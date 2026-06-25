import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function canRelease(vehicle) {
  return vehicle && !['Maintenance', 'Compliance Hold', 'Retired', 'Cleaning Hold', 'Maintenance Hold', 'Dispute Hold'].includes(vehicle.status);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const packets = await base44.asServiceRole.entities.InspectionEvidencePacket.filter({ inspection_type: 'dropoff', evidence_status: 'locked' }, '-created_date', 200);
    let accepted = 0;

    for (const packet of packets) {
      const expired = packet.dispute_window_expires_at && new Date(packet.dispute_window_expires_at).getTime() <= now.getTime();
      if (!expired || packet.dispute_window_closed_at) continue;

      const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: packet.booking_request_id });
      const booking = bookings[0];
      if (!booking || booking.booking_status === 'under_review') continue;

      await base44.asServiceRole.entities.InspectionEvidencePacket.update(packet.id, {
        evidence_status: 'auto_accepted',
        dispute_window_closed_at: now.toISOString(),
        dispute_window_close_reason: 'timeout',
        evidence_locked_at: packet.evidence_locked_at || now.toISOString(),
        lock_reason: packet.lock_reason || 'auto_accepted_after_24h',
      });

      // NOTE: processRentalLifecycleTransitions is the sole authority for BookingRequest
      // lifecycle auto-completion. This function only manages InspectionEvidencePacket state.
      // Do NOT update BookingRequest or Vehicle status here — prevents dual-completion race.
      accepted += 1;
    }

    return Response.json({ ok: true, auto_accepted: accepted, safety: { payment_changes: false, payout_changes: false, stripe_changes: false, ranking_changes: false } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});