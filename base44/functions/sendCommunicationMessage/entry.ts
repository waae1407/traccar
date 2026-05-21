import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { thread_id, message_type = 'text', body, attachments = [], internal_note = false } = await req.json();

    if (!thread_id || !body) {
      return Response.json({ error: 'thread_id and body are required' }, { status: 400 });
    }

    // Get thread
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

    // Determine visibility
    let visible_to_customer = true;
    let visible_to_host = true;
    let visible_to_admin = true;

    if (internal_note || message_type === 'internal_note') {
      visible_to_customer = false;
      visible_to_host = false;
      visible_to_admin = true;
    }

    // Create message
    const message = await base44.entities.CommunicationMessage.create({
      thread_id,
      sender_role: isAdmin ? 'admin' : isHost ? 'host' : 'customer',
      sender_id: user.id,
      sender_name: user.full_name,
      sender_email: user.email,
      message_type,
      body,
      attachments,
      internal_note: visible_to_customer === false,
      visible_to_customer,
      visible_to_host,
      visible_to_admin,
    });

    // Update thread last_message_at
    await base44.entities.CommunicationThread.update(thread_id, {
      last_message_at: new Date().toISOString(),
      status: thread.status === 'open' ? thread.status : 
        isAdmin ? 'awaiting_host' : 
        isHost ? 'awaiting_admin' : 'awaiting_admin',
    });

    // Update unread counts
    const updates = {};
    if (visible_to_host && !isHost) updates.unread_count_host = (thread.unread_count_host || 0) + 1;
    if (visible_to_customer && !isCustomer) updates.unread_count_customer = (thread.unread_count_customer || 0) + 1;
    if (visible_to_admin && !isAdmin) updates.unread_count_admin = (thread.unread_count_admin || 0) + 1;

    if (Object.keys(updates).length > 0) {
      await base44.entities.CommunicationThread.update(thread_id, updates);
    }

    // Log activity event
    await base44.entities.ActivityEvent.create({
      event_type: 'maintenance.logged',
      actor_email: user.email,
      actor_role: isAdmin ? 'admin' : isHost ? 'host' : 'customer',
      target_entity: 'CommunicationMessage',
      target_id: message.id,
      target_label: thread.subject,
      host_id: thread.host_id,
      customer_id: thread.customer_id,
      booking_request_id: thread.booking_request_id,
      vehicle_id: thread.vehicle_id,
      summary: `Message sent in ${thread.thread_type}: ${body.substring(0, 50)}...`,
      source: isAdmin ? 'admin_panel' : isHost ? 'host_portal' : 'customer_app',
      event_status: 'success',
    }).catch(() => {});

    return Response.json({ message });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});