import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function band({ completed, renterFault, chargebacks, dropoffRate }) {
  if (completed < 2) return 'insufficient_history';
  if (renterFault >= 2 || chargebacks >= 1) return 'needs_review';
  if (dropoffRate < 70 || renterFault === 1) return 'watch';
  return 'reliable';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const [bookings, packets, disputes, existing] = await Promise.all([
      base44.asServiceRole.entities.BookingRequest.list('-created_date', 1000),
      base44.asServiceRole.entities.InspectionEvidencePacket.list('-created_date', 1000),
      base44.asServiceRole.entities.Dispute.list('-created_date', 1000),
      base44.asServiceRole.entities.RenterTrustSummary.list('-updated_date', 1000),
    ]);

    const emails = [...new Set(bookings.map((b) => b.user_email).filter(Boolean))];
    let updated = 0;
    for (const email of emails) {
      const renterBookings = bookings.filter((b) => b.user_email === email);
      const bookingIds = new Set(renterBookings.map((b) => b.id));
      const completed = renterBookings.filter((b) => b.booking_status === 'completed').length;
      const pickup = packets.filter((p) => bookingIds.has(p.booking_request_id) && p.inspection_type === 'pickup').length;
      const dropoff = packets.filter((p) => bookingIds.has(p.booking_request_id) && p.inspection_type === 'dropoff').length;
      const clean = renterBookings.filter((b) => b.clean_return_status === 'approved_clean').length;
      const renterFault = disputes.filter((d) => bookingIds.has(d.booking_request_id) && d.status === 'resolved_host_favor').length;
      const damage = disputes.filter((d) => bookingIds.has(d.booking_request_id) && ['damage', 'cleaning', 'smoking', 'gps_tampering', 'unauthorized_driver'].includes(d.dispute_type)).length;
      const chargebacks = disputes.filter((d) => bookingIds.has(d.booking_request_id) && d.dispute_type === 'chargeback').length;
      const gpsConflicts = packets.filter((p) => bookingIds.has(p.booking_request_id) && p.gps_tolerance_status === 'outside_5_miles').length;
      const dropoffRate = completed ? Math.round((dropoff / completed) * 100) : 0;
      const summary = {
        renter_user_id: renterBookings.find((b) => b.user_id)?.user_id || '',
        renter_email: email,
        completed_rentals_count: completed,
        pickup_compliance_count: pickup,
        dropoff_compliance_count: dropoff,
        clean_return_count: clean,
        damage_dispute_count: damage,
        renter_fault_dispute_count: renterFault,
        chargeback_count: chargebacks,
        gps_conflict_count: gpsConflicts,
        private_trust_band: band({ completed, renterFault, chargebacks, dropoffRate }),
        admin_notes: 'Private internal renter trust only. Not public, not ranking, not automatic suppression.',
        last_calculated_at: new Date().toISOString(),
      };
      const found = existing.find((x) => x.renter_email === email);
      if (found) await base44.asServiceRole.entities.RenterTrustSummary.update(found.id, summary);
      else await base44.asServiceRole.entities.RenterTrustSummary.create(summary);
      updated += 1;
    }

    return Response.json({ ok: true, updated, safety: { public_scores: false, ranking_changes: false, suppression: false, payment_changes: false } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});