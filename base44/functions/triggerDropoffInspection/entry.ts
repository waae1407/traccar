import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Called by entity automation when return_exterior_photos is set on a BookingRequest
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const bookingId = body?.data?.id || body?.event?.entity_id;

    if (!bookingId) {
      return Response.json({ ok: true, skipped: "no booking id" });
    }

    console.log(`Triggering dropoff AI inspection for booking ${bookingId}`);

    const res = await base44.asServiceRole.functions.invoke("aiInspectPhotos", {
      booking_request_id: bookingId,
      inspection_type: "dropoff",
    });

    // ── Notify host that customer submitted return photos ──
    const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: bookingId }).catch(() => []);
    const booking = bookings[0];
    if (booking?.host_id) {
      base44.asServiceRole.functions.invoke('routePlatformNotification', {
        event_type: 'return_photos_submitted',
        severity: 'warning',
        category: 'bookings',
        title: `📋 Return Photos Submitted — ${booking.vehicle_name || 'vehicle'}`,
        message: `Customer ${booking.customer_full_name || booking.user_email} submitted return inspection photos. Review needed to complete the rental.`,
        booking_id: bookingId,
        host_id: booking.host_id,
        customer_id: booking.user_id || '',
        vehicle_id: booking.vehicle_id || '',
        action_url: '/host/return-reviews',
        source_function: 'triggerDropoffInspection',
      }).catch(e => console.error('[triggerDropoffInspection] host notify failed:', e.message));
    }

    console.log("Dropoff inspection result:", JSON.stringify(res));
    return Response.json({ ok: true, result: res });
  } catch (error) {
    console.error("triggerDropoffInspection error:", error.message);
    return Response.json({ ok: true, error: error.message });
  }
});