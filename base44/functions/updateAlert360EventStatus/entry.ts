import { createClientFromRequest } from 'npm:@base44/sdk@0.8.32';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const { event_id, action, note, reason, assignee_id, incident_id } = payload;

    const event = await base44.asServiceRole.entities.TelematicsSafetyEvent.get(event_id);
    if (!event) return Response.json({ error: 'Not found' }, { status: 404 });

    const isAdmin = user.role === 'admin';
    
    // Auth check
    if (!isAdmin) {
      if (user.role === 'host') {
        const hosts = await base44.asServiceRole.entities.Host.filter({ user_id: user.id });
        const hostIds = hosts.map(h => h.id);
        if (!hostIds.includes(event.host_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });
      } else {
        // Customer
        if (event.customer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
        // Customers cannot resolve admin-only alerts
        if (!event.visible_to_customer) return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const updates = {};
    const timestamp = new Date().toISOString();
    const userName = user.full_name || user.email;

    let internal_notes = event.internal_notes || '';
    const addInternalNote = (text) => {
        internal_notes += `\n[${timestamp}] ${userName}: ${text}`;
    };

    if (action === 'acknowledge') {
        updates.status = 'acknowledged';
        updates.acknowledged_at = timestamp;
        updates.acknowledged_by = userName;
        addInternalNote('Event acknowledged.');
    } else if (action === 'resolve') {
        updates.status = 'resolved';
        updates.is_active = false;
        updates.resolved_at = timestamp;
        updates.resolved_by = userName;
        if (note) {
          updates.resolution_notes = note;
          addInternalNote(`Event resolved. ${note}`);
        } else {
          addInternalNote(`Event resolved.`);
        }
    } else if (action === 'dismiss_false_positive') {
        updates.status = 'dismissed_false_positive';
        updates.is_active = false;
        updates.resolved_at = timestamp;
        updates.resolved_by = userName;
        if (reason) updates.resolution_notes = reason;
        addInternalNote(`Dismissed as false positive. Reason: ${reason || ''}`);
    } else if (action === 'add_note') {
        if (note) addInternalNote(note);
    } else if (action === 'assign') {
        updates.assigned_to = assignee_id;
        addInternalNote(`Assigned to ${assignee_id}`);
    } else if (action === 'link_incident') {
        updates.linked_incident_id = incident_id;
        addInternalNote(`Linked to incident ${incident_id}`);
    } else if (action === 'unlink_incident') {
        updates.linked_incident_id = null;
        addInternalNote(`Unlinked from incident`);
    }

    updates.internal_notes = internal_notes;

    const result = await base44.asServiceRole.entities.TelematicsSafetyEvent.update(event_id, updates);
    return Response.json({ success: true, event: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});