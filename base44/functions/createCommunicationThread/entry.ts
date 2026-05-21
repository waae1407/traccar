import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SLA_RESPONSE_HOURS = { urgent: 2, high: 4, normal: 24, low: 48 };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const {
      thread_type,
      subject,
      priority = 'normal',
      booking_request_id,
      vehicle_id,
      dispute_id,
      assigned_admin_id,
      initial_message,
      attachments = []
    } = payload;

    if (!thread_type || !subject) {
      return Response.json({ error: 'thread_type and subject are required' }, { status: 400 });
    }

    const isAdmin = user.role === 'admin';
    const hostRecords = await base44.entities.Host.filter({ email: user.email }, '-created_date', 1);
    const currentHost = hostRecords[0] || null;

    let host_id = payload.host_id;
    let customer_id = payload.customer_id;

    if (!isAdmin) {
      if (currentHost) {
        host_id = currentHost.id;
      } else {
        customer_id = user.email;
      }
    }

    const slaHours = SLA_RESPONSE_HOURS[priority] || SLA_RESPONSE_HOURS.normal;
    const now = new Date().toISOString();

    const thread = await base44.entities.CommunicationThread.create({
      thread_type,
      subject,
      priority,
      status: 'open',
      booking_request_id,
      vehicle_id,
      dispute_id,
      host_id,
      customer_id,
      assigned_admin_id: isAdmin ? assigned_admin_id : undefined,
      last_message_at: now,
      unread_count_host: isAdmin && host_id ? 1 : 0,
      unread_count_customer: isAdmin && customer_id ? 1 : 0,
      unread_count_admin: isAdmin ? 0 : 1,
      escalation_flag: priority === 'urgent',
      archived: false,
      frozen: false,
      sla_response_due_at: new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString(),
      attachment_count: attachments.length,
    });

    if (initial_message || attachments.length > 0) {
      await base44.entities.CommunicationMessage.create({
        thread_id: thread.id,
        sender_role: isAdmin ? 'admin' : currentHost ? 'host' : 'customer',
        sender_id: user.id,
        sender_name: user.full_name,
        sender_email: user.email,
        message_type: attachments.length > 0 && !initial_message ? 'document' : 'text',
        body: initial_message || 'Attachment shared',
        attachments,
        internal_note: false,
        visible_to_customer: !!customer_id || !currentHost,
        visible_to_host: !!host_id,
        visible_to_admin: true,
        created_at: now,
      });
    }

    await base44.entities.ActivityEvent.create({
      event_type: 'admin.note_added',
      actor_email: user.email,
      actor_role: isAdmin ? 'admin' : currentHost ? 'host' : 'customer',
      target_entity: 'CommunicationThread',
      target_id: thread.id,
      target_label: subject,
      host_id,
      customer_id,
      booking_request_id,
      vehicle_id,
      summary: `Communication thread created: ${thread_type} — ${subject}`,
      source: isAdmin ? 'admin_panel' : currentHost ? 'host_portal' : 'customer_app',
      event_status: 'success',
      metadata: { communication_action: 'thread_created', dispute_id },
    }).catch(() => {});

    return Response.json({ thread });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});