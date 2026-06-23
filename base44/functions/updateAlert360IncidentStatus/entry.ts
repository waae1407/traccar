import { createClientFromRequest } from 'npm:@base44/sdk@0.8.32';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const { incident_id, action, note, reason, assignee_id, event_id } = payload;

    const incident = await base44.asServiceRole.entities.TelematicsIncident.get(incident_id);
    if (!incident) return Response.json({ error: 'Not found' }, { status: 404 });

    const isAdmin = user.role === 'admin';
    if (!isAdmin) {
      if (user.role === 'host') {
        const hosts = await base44.asServiceRole.entities.Host.filter({ user_id: user.id });
        const hostIds = hosts.map(h => h.id);
        if (!hostIds.includes(incident.host_id)) return Response.json({ error: 'Forbidden' }, { status: 403 });
      } else {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const updates = {};
    const timestamp = new Date().toISOString();
    const userName = user.full_name || user.email;

    let internal_notes = incident.internal_notes || '';
    const addInternalNote = (text) => {
        internal_notes += `\n[${timestamp}] ${userName}: ${text}`;
    };

    if (action === 'acknowledge') {
        updates.status = 'investigating';
        addInternalNote('Incident acknowledged/investigating.');
    } else if (action === 'investigating') {
        updates.status = 'investigating';
        addInternalNote('Incident status set to investigating.');
    } else if (action === 'resolve') {
        updates.status = 'resolved';
        if (note) updates.resolution_notes = note;
        addInternalNote(`Incident resolved. ${note || ''}`);
        
        // resolve all linked active events
        const linkedEvents = await base44.asServiceRole.entities.TelematicsSafetyEvent.filter({ linked_incident_id: incident_id, is_active: true });
        for (const ev of linkedEvents) {
            await base44.asServiceRole.entities.TelematicsSafetyEvent.update(ev.id, {
                status: 'resolved',
                is_active: false,
                resolved_at: timestamp,
                resolved_by: userName,
                internal_notes: (ev.internal_notes || '') + `\n[${timestamp}] System: Resolved via Incident ${incident_id}`
            });
        }
    } else if (action === 'dismiss_false_positive') {
        updates.status = 'dismissed_false_positive';
        if (reason) updates.resolution_notes = reason;
        addInternalNote(`Dismissed as false positive. Reason: ${reason || ''}`);
        
        const linkedEvents = await base44.asServiceRole.entities.TelematicsSafetyEvent.filter({ linked_incident_id: incident_id, is_active: true });
        for (const ev of linkedEvents) {
            await base44.asServiceRole.entities.TelematicsSafetyEvent.update(ev.id, {
                status: 'dismissed_false_positive',
                is_active: false,
                resolved_at: timestamp,
                resolved_by: userName,
                internal_notes: (ev.internal_notes || '') + `\n[${timestamp}] System: Dismissed via Incident ${incident_id}`
            });
        }
    } else if (action === 'add_note') {
        if (note) addInternalNote(note);
    } else if (action === 'assign') {
        updates.assigned_to = assignee_id;
        addInternalNote(`Assigned to ${assignee_id}`);
    } else if (action === 'attach_event') {
        let related = incident.related_event_ids || [];
        if (!related.includes(event_id)) {
            related.push(event_id);
            updates.related_event_ids = related;
            addInternalNote(`Attached event ${event_id}`);
        }
        await base44.asServiceRole.entities.TelematicsSafetyEvent.update(event_id, { linked_incident_id: incident_id });
    } else if (action === 'detach_event') {
        let related = incident.related_event_ids || [];
        updates.related_event_ids = related.filter(id => id !== event_id);
        addInternalNote(`Detached event ${event_id}`);
        await base44.asServiceRole.entities.TelematicsSafetyEvent.update(event_id, { linked_incident_id: null });
    }

    updates.internal_notes = internal_notes;

    const result = await base44.asServiceRole.entities.TelematicsIncident.update(incident_id, updates);
    return Response.json({ success: true, incident: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});