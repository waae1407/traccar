import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Called by entity automation when pickup_photos is set on a BookingRequest
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const bookingId = body?.data?.id || body?.event?.entity_id;

    if (!bookingId) {
      return Response.json({ ok: true, skipped: "no booking id" });
    }

    console.log(`Triggering pickup AI inspection for booking ${bookingId}`);

    const res = await base44.asServiceRole.functions.invoke("aiInspectPhotos", {
      booking_request_id: bookingId,
      inspection_type: "pickup",
    });

    // ── Notify host that customer started pickup inspection ──
    const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: bookingId }).catch(() => []);
    const booking = bookings[0];
    if (booking?.host_id) {
      base44.asServiceRole.functions.invoke('routePlatformNotification', {
        event_type: 'pickup_inspection_started',
        severity: 'info',
        category: 'bookings',
        title: `🚗 Pickup Inspection Started — ${booking.vehicle_name || 'vehicle'}`,
        message: `Customer ${booking.customer_full_name || booking.user_email} has submitted pickup photos. AI inspection is running.`,
        booking_id: bookingId,
        host_id: booking.host_id,
        customer_id: booking.user_id || '',
        vehicle_id: booking.vehicle_id || '',
        action_url: '/host/booking-360?id=' + bookingId,
        source_function: 'triggerPickupInspection',
      }).catch(e => console.error('[triggerPickupInspection] host notify failed:', e.message));
    }

    console.log("Pickup inspection result:", JSON.stringify(res));
    return Response.json({ ok: true, result: res });
  } catch (error) {
    console.error("triggerPickupInspection error:", error.message);
    return Response.json({ ok: true, error: error.message });
  }
});