import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function clientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { booking_request_id } = await req.json().catch(() => ({}));
    if (!booking_request_id) return Response.json({ error: 'Missing booking_request_id' }, { status: 400 });

    const booking = await base44.asServiceRole.entities.BookingRequest.get(booking_request_id).catch(() => null);
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });
    if (user.role !== 'admin' && booking.user_email !== user.email && booking.user_id !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const ip = clientIp(req);
    const userAgent = req.headers.get('user-agent') || '';
    const timestamp = new Date().toISOString();

    return Response.json({
      signature_ip_address: ip,
      signature_user_agent: userAgent,
      signature_device_info: userAgent,
      signature_timestamp: timestamp,
      signature_user_id: user.id || '',
      signature_email: user.email || '',
      contract_signed_at: timestamp,
      contract_signature_evidence_status: ip ? 'captured' : 'partial'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});