import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// One-time backfill: reconstructs PaymentLog entries from existing BookingRequest data.
// For each active/completed booking, creates one PaymentLog per billing week completed.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Get all bookings that have had at least one payment
    const bookings = await base44.asServiceRole.entities.BookingRequest.list('-created_date', 500);
    const eligible = bookings.filter(b =>
      b.billing_week_number && b.billing_week_number >= 1 &&
      b.weekly_rate && b.weekly_rate > 0 &&
      b.user_email &&
      ['confirmed', 'active', 'approved', 'completed', 'suspended'].includes(b.booking_status)
    );

    console.log(`[Backfill] Found ${eligible.length} eligible bookings`);

    let created = 0;
    let skipped = 0;

    for (const booking of eligible) {
      // Check existing logs for this booking to avoid duplicates
      const existing = await base44.asServiceRole.entities.PaymentLog.filter({
        booking_request_id: booking.id,
      });
      const existingWeeks = new Set(existing.map(l => l.week_number));

      let resolvedHostId = booking.host_id || '';
      if (!resolvedHostId && booking.vehicle_id) {
        const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
        resolvedHostId = vehicles[0]?.host_id || '';
      }

      // Reconstruct one log per completed week (weeks 1 through billing_week_number)
      const weeksCompleted = booking.billing_week_number || 1;

      for (let week = 1; week <= weeksCompleted; week++) {
        if (existingWeeks.has(week)) {
          skipped++;
          continue;
        }

        // Estimate paid_at: start_date + (week - 1) * 7 days
        let paidAt = new Date().toISOString();
        if (booking.start_date) {
          const d = new Date(booking.start_date + 'T12:00:00');
          d.setDate(d.getDate() + (week - 1) * 7);
          paidAt = d.toISOString();
        }

        await base44.asServiceRole.entities.PaymentLog.create({
          booking_request_id: booking.id,
          host_id: resolvedHostId,
          customer_email: booking.user_email,
          customer_name: booking.customer_full_name || '',
          vehicle_id: booking.vehicle_id,
          vehicle_name: booking.vehicle_name || '',
          week_number: week,
          amount: booking.weekly_rate,
          payment_method: 'other',
          status: 'paid',
          recorded_by: 'backfill',
          notes: 'Backfilled — exact payment method unknown. Please update manually if needed.',
          paid_at: paidAt,
        });
        created++;
      }
    }

    console.log(`[Backfill] Done — created ${created}, skipped ${skipped} existing`);
    return Response.json({ ok: true, created, skipped, bookings_processed: eligible.length });
  } catch (error) {
    console.error('[Backfill] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});