import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const bookingId = body?.booking_id;
    if (!bookingId) return Response.json({ error: "booking_id is required" }, { status: 400 });

    return Response.json({ success: true, message: "ok", booking_id: bookingId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});