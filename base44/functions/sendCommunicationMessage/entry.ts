import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { thread_id, message_type = 'text', body, attachments = [], internal_note = false } = await req.json();
    if (!thread_id || (!body && attachments.length === 0)) {
      return Response.json({ error: 'thread_id and message content are required' }, { status: 400 });
    }

    const thread = await base44.entities.CommunicationThread.get(thread_id);
    if (!thread) return Response.json({ error: 'Thread not found' }, { status: 404 });

    const isAdmin = user.role === 'admin';
    const hosts = await base44.entities.Host.filter({ email: user.email }, '-created_date', 1);
    const host = hosts[0] || null;
    const isHost = !!host && thread.host_id === host.id;
    const isCustomer = thread.customer_id === user.email || thread.customer_id === user.id;

    if (!isAdmin && !isHost && !isCustomer) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (thread.frozen && !isAdmin) return Response.json({ error: 'Thread is frozen by admin' }, { status: 403 });
    if (isHost && thread.muted_host) return Response.json({ error: 'Host is muted in this thread' }, { status: 403 });
    if (isCustomer && thread.muted_customer) return Response.json({ error: 'Customer is muted in this thread' }, { status: 403 });

    let visible_to_customer = true;
    let visible_to_host = true;
    let visible_to_admin = true;

    if (internal_note || message_type === 'internal_note') {
      visible_to_customer = false;
      visible_to_host = isHost;
      visible_to_admin = true;
    }

    const senderRole = isAdmin ? 'admin' : isHost ? 'host' : 'customer';
    const now = new Date().toISOString();

    const message = await base44.entities.CommunicationMessage.create({
      thread_id,
      sender_role: senderRole,
      sender_id: user.id,
      sender_name: user.full_name,
      sender_email: user.email,
      message_type: internal_note ? 'internal_note' : message_type,
      body: body || 'Attachment shared',
      attachments,
      internal_note: !!internal_note,
      visible_to_customer,
      visible_to_host,
      visible_to_admin,
      created_at: now,
    });

    const previousLastMessageAt = thread.last_message_at || thread.created_date;
    const firstResponseMinutes = !thread.first_response_at && previousLastMessageAt
      ? Math.max(0, Math.round((new Date(now).getTime() - new Date(previousLastMessageAt).getTime()) / 60000))
      : thread.first_response_minutes;
    const unreadAgeHours = previousLastMessageAt
      ? Math.max(0, Math.round((new Date(now).getTime() - new Date(previousLastMessageAt).getTime()) / 3600000))
      : 0;

    const updates = {
      last_message_at: now,
      attachment_count: (thread.attachment_count || 0) + attachments.length,
      unread_age_hours: unreadAgeHours,
      response_consistency_score: firstResponseMinutes ? Math.max(0, Math.min(100, 100 - Math.floor(firstResponseMinutes / 60) * 5)) : (thread.response_consistency_score || 70),
    };

    if (!thread.first_response_at && previousLastMessageAt) {
      updates.first_response_at = now;
      updates.first_response_minutes = firstResponseMinutes;
      updates.first_response_by_role = senderRole;
      if (thread.sla_response_due_at && new Date(now) > new Date(thread.sla_response_due_at)) {
        updates.sla_breached = true;
      }
    }

    if (!internal_note) {
      updates.status = isAdmin
        ? (thread.customer_id ? 'awaiting_customer' : 'awaiting_host')
        : 'awaiting_admin';
    }

    if (visible_to_host && !isHost) updates.unread_count_host = (thread.unread_count_host || 0) + 1;
    if (visible_to_customer && !isCustomer) updates.unread_count_customer = (thread.unread_count_customer || 0) + 1;
    if (visible_to_admin && !isAdmin) updates.unread_count_admin = (thread.unread_count_admin || 0) + 1;

    await base44.entities.CommunicationThread.update(thread_id, updates);

    await base44.entities.ActivityEvent.create({
      event_type: 'admin.note_added',
      actor_email: user.email,
      actor_role: senderRole,
      target_entity: 'CommunicationMessage',
      target_id: message.id,
      target_label: thread.subject,
      host_id: thread.host_id,
      customer_id: thread.customer_id,
      booking_request_id: thread.booking_request_id,
      vehicle_id: thread.vehicle_id,
      summary: `${internal_note ? 'Internal note' : 'Message'} sent in ${thread.thread_type}: ${(body || 'Attachment shared').substring(0, 80)}`,
      source: isAdmin ? 'admin_panel' : isHost ? 'host_portal' : 'customer_app',
      event_status: 'success',
      metadata: { communication_action: internal_note ? 'internal_note_added' : 'message_sent', attachment_count: attachments.length },
    }).catch(() => {});

    return Response.json({ message });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});