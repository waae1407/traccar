import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SLA_RESPONSE_HOURS = {
  urgent: 2,
  high: 4,
  normal: 24,
  low: 48,
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { thread_type, subject, priority = 'normal', booking_request_id, vehicle_id, dispute_id, host_id, customer_id, assigned_admin_id, initial_message } = await req.json();

    // Validate required fields
    if (!thread_type || !subject) {
      return Response.json({ error: 'thread_type and subject are required' }, { status: 400 });
    }

    // Calculate SLA deadline
    const slaHours = SLA_RESPONSE_HOURS[priority] || SLA_RESPONSE_HOURS.normal;
    const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

    // Create thread
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
      assigned_admin_id,
      last_message_at: new Date().toISOString(),
      unread_count_host: customer_id ? 1 : 0,
      unread_count_customer: host_id ? 1 : 0,
      unread_count_admin: (host_id || customer_id) ? 1 : 0,
      escalation_flag: priority === 'urgent',
      sla_response_due_at: slaDueAt,
    });

    // Create initial message if provided
    if (initial_message) {
      await base44.entities.CommunicationMessage.create({
        thread_id: thread.id,
        sender_role: user.role,
        sender_id: user.id,
        sender_name: user.full_name,
        sender_email: user.email,
        message_type: 'text',
        body: initial_message,
        visible_to_customer: !!customer_id,
        visible_to_host: !!host_id,
        visible_to_admin: true,
      });
    }

    // Log activity event
    await base44.entities.ActivityEvent.create({
      event_type: 'maintenance.logged',
      actor_email: user.email,
      actor_role: user.role,
      target_entity: 'CommunicationThread',
      target_id: thread.id,
      target_label: subject,
      host_id,
      customer_id,
      booking_request_id,
      vehicle_id,
      summary: `Communication thread created: ${thread_type} — ${subject}`,
      source: user.role === 'admin' ? 'admin_panel' : user.role === 'host' ? 'host_portal' : 'customer_app',
      event_status: 'success',
    }).catch(() => {});

    return Response.json({ thread });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});