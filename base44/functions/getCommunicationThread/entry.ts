import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const thread_id = url.searchParams.get('thread_id');

    if (!thread_id) {
      return Response.json({ error: 'thread_id required' }, { status: 400 });
    }

    const thread = await base44.entities.CommunicationThread.get(thread_id);
    if (!thread) {
      return Response.json({ error: 'Thread not found' }, { status: 404 });
    }

    // Check permissions
    const isAdmin = user.role === 'admin';
    const isHost = thread.host_id && await base44.entities.Host.filter({ email: user.email }).then(h => h.length > 0);
    const isCustomer = thread.customer_id && user.email === thread.customer_id;

    if (!isAdmin && !isHost && !isCustomer) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get messages with visibility filtering
    const messages = await base44.entities.CommunicationMessage.filter({ thread_id }, 'created_date', 200);

    let filteredMessages;
    if (isAdmin) {
      filteredMessages = messages.filter(m => m.visible_to_admin !== false);
    } else if (isHost) {
      filteredMessages = messages.filter(m => m.visible_to_host !== false);
    } else if (isCustomer) {
      filteredMessages = messages.filter(m => m.visible_to_customer !== false);
    } else {
      filteredMessages = [];
    }

    // Mark messages as read for this user
    const unreadIds = filteredMessages.filter(m => !m.deleted).map(m => m.id);
    if (unreadIds.length > 0) {
      const updateField = isAdmin ? 'unread_count_admin' : isHost ? 'unread_count_host' : 'unread_count_customer';
      await base44.entities.CommunicationThread.update(thread_id, { [updateField]: 0 });
    }

    // Enrich thread with related data
    const enriched = { ...thread };

    if (thread.booking_request_id) {
      try {
        const booking = await base44.entities.BookingRequest.get(thread.booking_request_id);
        if (booking) enriched.booking_info = { id: booking.id, status: booking.booking_status, vehicle_name: booking.vehicle_name };
      } catch {}
    }

    if (thread.vehicle_id) {
      try {
        const vehicle = await base44.entities.Vehicle.get(thread.vehicle_id);
        if (vehicle) enriched.vehicle_info = { id: vehicle.id, name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`, plate: vehicle.plate };
      } catch {}
    }

    if (thread.dispute_id) {
      try {
        const dispute = await base44.entities.Dispute.get(thread.dispute_id);
        if (dispute) enriched.dispute_info = { id: dispute.id, type: dispute.dispute_type, status: dispute.status };
      } catch {}
    }

    return Response.json({ thread: enriched, messages: filteredMessages });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});