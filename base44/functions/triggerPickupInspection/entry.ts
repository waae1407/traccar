import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Called by entity automation when pickup_photos is set on a BookingRequest
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const bookingId = body?.booking_id || body?.data?.id || body?.event?.entity_id;

    if (!bookingId) {
      return Response.json({ ok: true, skipped: "no booking id" });
    }

    console.log(`Triggering pickup AI inspection for booking ${bookingId}`);

    const res = await base44.asServiceRole.functions.invoke("aiInspectPhotos", {
      booking_request_id: bookingId,
      inspection_type: "pickup",
    });

    console.log("Pickup inspection result:", JSON.stringify(res));
    return Response.json({ ok: true, result: res });
  } catch (error) {
    console.error("triggerPickupInspection error:", error.message);
    return Response.json({ ok: true, error: error.message });
  }
});