import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const thread_id = payload.thread_id || url.searchParams.get('thread_id');
    if (!thread_id) return Response.json({ error: 'thread_id required' }, { status: 400 });

    const thread = await base44.entities.CommunicationThread.get(thread_id);
    if (!thread) return Response.json({ error: 'Thread not found' }, { status: 404 });

    const isAdmin = user.role === 'admin';
    const hosts = await base44.entities.Host.filter({ email: user.email }, '-created_date', 1);
    const host = hosts[0] || null;
    const isHost = !!host && thread.host_id === host.id;
    const isCustomer = thread.customer_id === user.email || thread.customer_id === user.id;

    if (!isAdmin && !isHost && !isCustomer) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const messages = await base44.entities.CommunicationMessage.filter({ thread_id }, 'created_date', 300);
    const filteredMessages = messages.filter(m => {
      if (m.deleted) return isAdmin;
      if (isAdmin) return m.visible_to_admin !== false;
      if (isHost) return m.visible_to_host !== false;
      return m.visible_to_customer !== false;
    });

    const updateField = isAdmin ? 'unread_count_admin' : isHost ? 'unread_count_host' : 'unread_count_customer';
    await base44.entities.CommunicationThread.update(thread_id, { [updateField]: 0 });

    const enriched = { ...thread };

    if (thread.booking_request_id) {
      const booking = await base44.entities.BookingRequest.get(thread.booking_request_id).catch(() => null);
      if (booking) enriched.booking_info = { id: booking.id, status: booking.booking_status, vehicle_name: booking.vehicle_name, customer_name: booking.customer_full_name };
    }
    if (thread.vehicle_id) {
      const vehicle = await base44.entities.Vehicle.get(thread.vehicle_id).catch(() => null);
      if (vehicle) enriched.vehicle_info = { id: vehicle.id, name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`, plate: vehicle.plate, vin: vehicle.vin };
    }
    if (thread.dispute_id) {
      const dispute = await base44.entities.Dispute.get(thread.dispute_id).catch(() => null);
      if (dispute) enriched.dispute_info = { id: dispute.id, type: dispute.dispute_type, status: dispute.status };
    }
    if (thread.host_id) {
      const hostRecord = await base44.entities.Host.get(thread.host_id).catch(() => null);
      if (hostRecord) enriched.host_info = { id: hostRecord.id, name: hostRecord.business_name || hostRecord.full_name, email: hostRecord.email };
    }

    return Response.json({ thread: enriched, messages: filteredMessages });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});