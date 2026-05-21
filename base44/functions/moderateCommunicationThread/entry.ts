import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { thread_id, action, reason, assigned_admin_id, priority, status } = await req.json();

    if (!thread_id || !action) {
      return Response.json({ error: 'thread_id and action required' }, { status: 400 });
    }

    const thread = await base44.entities.CommunicationThread.get(thread_id);
    if (!thread) {
      return Response.json({ error: 'Thread not found' }, { status: 404 });
    }

    const updates = {};

    switch (action) {
      case 'assign':
        if (assigned_admin_id) updates.assigned_admin_id = assigned_admin_id;
        break;
      case 'escalate':
        updates.escalation_flag = true;
        updates.priority = 'urgent';
        break;
      case 'deescalate':
        updates.escalation_flag = false;
        updates.priority = priority || 'normal';
        break;
      case 'archive':
        updates.archived = true;
        updates.status = 'archived';
        updates.closed_at = new Date().toISOString();
        break;
      case 'close':
        updates.status = status || 'resolved';
        updates.closed_at = new Date().toISOString();
        break;
      case 'reopen':
        updates.status = 'open';
        updates.closed_at = null;
        break;
      case 'freeze':
        updates.status = 'archived';
        break;
      case 'set_priority':
        updates.priority = priority;
        break;
      case 'set_status':
        updates.status = status;
        break;
      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (reason) {
      // Create internal note about the moderation action
      await base44.entities.CommunicationMessage.create({
        thread_id,
        sender_role: 'admin',
        sender_id: user.id,
        sender_name: user.full_name,
        sender_email: user.email,
        message_type: 'internal_note',
        body: `Moderation: ${action} — ${reason}`,
        internal_note: true,
        visible_to_customer: false,
        visible_to_host: false,
        visible_to_admin: true,
      });
    }

    await base44.entities.CommunicationThread.update(thread_id, updates);

    // Log activity
    await base44.entities.ActivityEvent.create({
      event_type: 'admin.override',
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'CommunicationThread',
      target_id: thread_id,
      target_label: thread.subject,
      summary: `Thread moderated: ${action}${reason ? ' — ' + reason : ''}`,
      source: 'admin_panel',
      event_status: 'success',
    }).catch(() => {});

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});