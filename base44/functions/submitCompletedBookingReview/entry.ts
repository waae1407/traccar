import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function clampRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(5, Math.round(n)));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { booking_id } = body;
    if (!booking_id) return Response.json({ error: 'booking_id is required' }, { status: 400 });

    const bookings = await base44.entities.BookingRequest.filter({ id: booking_id });
    const booking = bookings[0];
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });
    if (booking.user_email !== user.email) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (booking.booking_status !== 'completed') return Response.json({ error: 'Only completed bookings can be reviewed' }, { status: 400 });

    const existing = await base44.entities.HostReview.filter({ booking_request_id: booking.id });
    if (existing.length > 0) return Response.json({ error: 'Review already submitted for this booking' }, { status: 409 });

    const severeDisputes = await base44.entities.Dispute.filter({ booking_request_id: booking.id });
    const unresolvedSevere = severeDisputes.some((d) =>
      ['damage', 'chargeback', 'gps_tampering', 'unauthorized_driver'].includes(d.dispute_type) &&
      ['open', 'under_review', 'evidence_requested', 'payout_held', 'chargeback'].includes(d.status)
    );

    const now = new Date().toISOString();
    const review = await base44.entities.HostReview.create({
      host_id: booking.host_id,
      vehicle_id: booking.vehicle_id,
      vehicle_name: booking.vehicle_name,
      booking_request_id: booking.id,
      reviewer_name: user.full_name || booking.customer_full_name || user.email,
      reviewer_email: user.email,
      renter_user_id: user.id || booking.user_id,
      rating: clampRating(body.overall_rating),
      overall_rating: clampRating(body.overall_rating),
      host_experience_rating: clampRating(body.host_experience_rating),
      vehicle_condition_rating: clampRating(body.vehicle_condition_rating),
      cleanliness_rating: clampRating(body.cleanliness_rating),
      communication_rating: clampRating(body.communication_rating),
      pickup_dropoff_rating: clampRating(body.pickup_dropoff_rating),
      would_rent_again: body.would_rent_again !== false,
      review_text: String(body.review_text || '').slice(0, 3000),
      review_submitted_at: now,
      review_confidence_weight: unresolvedSevere ? 0.5 : 1,
      severe_dispute_flag: unresolvedSevere,
      review_source: 'completed_booking_prompt',
      status: 'pending',
      moderation_status: unresolvedSevere ? 'flagged' : 'pending',
      visibility_status: 'hidden',
      verified_booking: true,
      dispute_adjusted_weight: unresolvedSevere ? 0.5 : 1,
      fake_review_flag: false,
      moderation_notes: unresolvedSevere ? 'Review confidence reduced due to unresolved severe dispute on the booking.' : '',
    });

    await base44.entities.ReviewModerationQueue.create({
      review_id: review.id,
      booking_request_id: booking.id,
      host_id: booking.host_id,
      vehicle_id: booking.vehicle_id,
      moderation_status: unresolvedSevere ? 'flagged' : 'pending',
      visibility_status: 'hidden',
      flag_reason: unresolvedSevere ? 'Unresolved severe dispute reduces review confidence.' : '',
    });

    await base44.entities.ReputationEventLog.create({
      event_type: 'review_submitted',
      entity_type: 'review',
      entity_id: review.id,
      host_id: booking.host_id,
      vehicle_id: booking.vehicle_id,
      booking_request_id: booking.id,
      source_entity: 'BookingRequest',
      source_entity_id: booking.id,
      score_impact: 0,
      subscores_affected: ['reviews', 'cleanliness', 'communication', 'pickup_dropoff', 'repeat_renter'],
      reason: 'Verified completed-booking review submitted for internal moderation. Hidden from public display.',
      processed_by: 'completed_booking_review_collector',
    });

    return Response.json({ ok: true, review });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});