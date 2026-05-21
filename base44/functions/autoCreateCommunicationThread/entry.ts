import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { event_type, booking_request_id, vehicle_id, dispute_id, host_id, customer_id, subject, priority = 'normal' } = await req.json();

    if (!event_type || !subject) {
      return Response.json({ error: 'event_type and subject required' }, { status: 400 });
    }

    // Check if thread already exists for this event
    const existingQuery = { thread_type: event_type };
    if (booking_request_id) existingQuery.booking_request_id = booking_request_id;
    if (dispute_id) existingQuery.dispute_id = dispute_id;
    if (vehicle_id) existingQuery.vehicle_id = vehicle_id;

    const existing = await base44.entities.CommunicationThread.filter(existingQuery, '-created_date', 1);
    if (existing.length > 0 && existing[0].status !== 'resolved' && existing[0].status !== 'archived') {
      return Response.json({ thread: existing[0], created: false });
    }

    // Determine assigned admin based on event type
    let assigned_admin_id = null;
    if (event_type === 'dispute_thread' || event_type === 'payout_discussion') {
      // Could implement admin assignment logic here
    }

    // Create thread
    const thread = await base44.entities.CommunicationThread.create({
      thread_type: event_type,
      subject,
      priority,
      status: 'open',
      booking_request_id,
      vehicle_id,
      dispute_id,
      host_id,
      customer_id,
      assigned_admin_id,
      last_message_at: new Date().toISOString(),
      unread_count_host: customer_id ? 1 : 0,
      unread_count_customer: host_id ? 1 : 0,
      unread_count_admin: (host_id || customer_id) ? 1 : 0,
      escalation_flag: priority === 'urgent',
      sla_response_due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    // Create system event message
    await base44.entities.CommunicationMessage.create({
      thread_id: thread.id,
      sender_role: 'system',
      sender_id: 'system',
      sender_name: 'System',
      message_type: 'system_event',
      body: 'Thread automatically created: ' + subject,
      visible_to_customer: !!customer_id,
      visible_to_host: !!host_id,
      visible_to_admin: true,
    });

    return Response.json({ thread, created: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});