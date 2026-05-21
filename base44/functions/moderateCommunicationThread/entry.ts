import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const { thread_id, action, reason, assigned_admin_id, priority, status, message_id } = await req.json();
    if (!thread_id || !action) return Response.json({ error: 'thread_id and action required' }, { status: 400 });

    const thread = await base44.entities.CommunicationThread.get(thread_id);
    if (!thread) return Response.json({ error: 'Thread not found' }, { status: 404 });

    const updates = {};
    let systemBody = '';

    switch (action) {
      case 'assign':
        updates.assigned_admin_id = assigned_admin_id || user.id;
        systemBody = 'Admin joined this thread.';
        break;
      case 'escalate':
        updates.escalation_flag = true;
        updates.priority = 'urgent';
        systemBody = 'Thread escalated for admin review.';
        break;
      case 'deescalate':
        updates.escalation_flag = false;
        updates.priority = priority || 'normal';
        systemBody = 'Thread escalation cleared.';
        break;
      case 'archive':
        updates.archived = true;
        updates.status = 'archived';
        updates.closed_at = new Date().toISOString();
        systemBody = 'Thread archived.';
        break;
      case 'close':
        updates.status = status || 'resolved';
        updates.closed_at = new Date().toISOString();
        systemBody = 'Thread resolved.';
        break;
      case 'reopen':
        updates.status = 'open';
        updates.archived = false;
        updates.closed_at = null;
        updates.frozen = false;
        systemBody = 'Thread reopened.';
        break;
      case 'freeze':
        updates.frozen = true;
        systemBody = 'Thread frozen by admin. Only admins can add messages.';
        break;
      case 'unfreeze':
        updates.frozen = false;
        systemBody = 'Thread unfrozen by admin.';
        break;
      case 'mute_host':
        updates.muted_host = true;
        systemBody = 'Host muted in this thread.';
        break;
      case 'mute_customer':
        updates.muted_customer = true;
        systemBody = 'Customer muted in this thread.';
        break;
      case 'unmute_host':
        updates.muted_host = false;
        systemBody = 'Host unmuted in this thread.';
        break;
      case 'unmute_customer':
        updates.muted_customer = false;
        systemBody = 'Customer unmuted in this thread.';
        break;
      case 'set_priority':
        updates.priority = priority;
        systemBody = `Priority changed to ${priority}.`;
        break;
      case 'set_status':
        updates.status = status;
        systemBody = `Status changed to ${status}.`;
        break;
      case 'flag_message':
        if (!message_id) return Response.json({ error: 'message_id required' }, { status: 400 });
        await base44.entities.CommunicationMessage.update(message_id, { moderation_flag: true });
        systemBody = 'A message was flagged for moderation.';
        break;
      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (Object.keys(updates).length > 0) await base44.entities.CommunicationThread.update(thread_id, updates);

    await base44.entities.CommunicationMessage.create({
      thread_id,
      sender_role: 'system',
      sender_id: 'system',
      sender_name: 'System',
      message_type: 'system_event',
      body: reason ? `${systemBody} Reason: ${reason}` : systemBody,
      visible_to_customer: !['mute_host', 'mute_customer', 'unmute_host', 'unmute_customer'].includes(action),
      visible_to_host: !['mute_host', 'mute_customer', 'unmute_host', 'unmute_customer'].includes(action),
      visible_to_admin: true,
      created_at: new Date().toISOString(),
    });

    if (reason) {
      await base44.entities.CommunicationMessage.create({
        thread_id,
        sender_role: 'admin',
        sender_id: user.id,
        sender_name: user.full_name,
        sender_email: user.email,
        message_type: 'internal_note',
        body: `Moderation note: ${action} — ${reason}`,
        internal_note: true,
        visible_to_customer: false,
        visible_to_host: false,
        visible_to_admin: true,
        created_at: new Date().toISOString(),
      });
    }

    await base44.entities.ActivityEvent.create({
      event_type: 'admin.override',
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'CommunicationThread',
      target_id: thread_id,
      target_label: thread.subject,
      host_id: thread.host_id,
      customer_id: thread.customer_id,
      booking_request_id: thread.booking_request_id,
      vehicle_id: thread.vehicle_id,
      summary: `Thread moderated: ${action}${reason ? ' — ' + reason : ''}`,
      source: 'admin_panel',
      event_status: 'success',
      metadata: { communication_action: action },
    }).catch(() => {});

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});