import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function mapAutomationToThread(payload) {
  if (payload.event_type) return payload;

  const entity = payload.event?.entity_name;
  const type = payload.event?.type;
  const data = payload.data || {};
  const oldData = payload.old_data || {};

  if (entity === 'BookingRequest' && type === 'update') {
    if (data.booking_status === 'approved' || data.booking_status === 'confirmed') {
      return {
        event_type: 'booking_conversation',
        subject: `Booking conversation: ${data.vehicle_name || data.vehicle_id || data.id}`,
        priority: 'normal',
        booking_request_id: data.id,
        vehicle_id: data.vehicle_id,
        host_id: data.host_id,
        customer_id: data.user_email,
        body: `Booking ${data.booking_status}. This thread preserves all operational communication for the rental.`,
      };
    }
    if (data.booking_status === 'cancellation_requested' || data.cancellation_requested_at !== oldData.cancellation_requested_at) {
      return {
        event_type: 'support_ticket',
        subject: `Cancellation request: ${data.vehicle_name || data.id}`,
        priority: 'high',
        booking_request_id: data.id,
        vehicle_id: data.vehicle_id,
        host_id: data.host_id,
        customer_id: data.user_email,
        body: data.cancellation_reason || 'Cancellation request opened.',
      };
    }
  }

  if (entity === 'Dispute' && type === 'create') {
    return {
      event_type: 'dispute_thread',
      subject: `${data.dispute_type || 'Dispute'} opened: ${data.vehicle_name || data.booking_request_id || data.id}`,
      priority: data.dispute_type === 'chargeback' ? 'urgent' : 'high',
      booking_request_id: data.booking_request_id,
      vehicle_id: data.vehicle_id,
      dispute_id: data.id,
      host_id: data.host_id,
      customer_id: data.customer_email,
      body: data.description || 'Dispute thread opened for evidence preservation and admin review.',
    };
  }

  if (entity === 'HostMaintenanceLog' && type === 'create') {
    return {
      event_type: 'maintenance_discussion',
      subject: `Maintenance: ${data.vehicle_name || data.vehicle_id}`,
      priority: data.status === 'overdue' ? 'high' : 'normal',
      vehicle_id: data.vehicle_id,
      host_id: data.host_id,
      body: `${data.service_type || 'Maintenance'} logged${data.notes ? ': ' + data.notes : '.'}`,
    };
  }

  if (entity === 'HostVehicleCompliance' && (type === 'create' || type === 'update')) {
    if (data.status === 'pending_review' || data.status === 'expired') {
      return {
        event_type: 'compliance_request',
        subject: `Compliance ${data.status}: ${data.vehicle_name || data.vehicle_id}`,
        priority: data.status === 'expired' ? 'urgent' : 'high',
        vehicle_id: data.vehicle_id,
        host_id: data.host_id,
        body: `${data.doc_type || 'Compliance document'} is ${data.status}.`,
      };
    }
  }

  if (entity === 'HostPayout' && type === 'update') {
    if (data.status === 'held' || data.status === 'failed') {
      return {
        event_type: 'payout_discussion',
        subject: `Payout ${data.status}: ${data.host_name || data.host_id}`,
        priority: data.status === 'failed' ? 'high' : 'normal',
        booking_request_id: data.booking_request_id,
        host_id: data.host_id,
        body: data.hold_reason || data.hold_notes || `Payout status changed to ${data.status}.`,
      };
    }
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const mapped = mapAutomationToThread(payload);

    if (!mapped) return Response.json({ skipped: true, reason: 'No matching communication trigger' });

    const { event_type, booking_request_id, vehicle_id, dispute_id, host_id, customer_id, subject, priority = 'normal', body } = mapped;
    if (!event_type || !subject) return Response.json({ error: 'event_type and subject required' }, { status: 400 });

    const existingQuery = { thread_type: event_type, archived: false };
    if (booking_request_id) existingQuery.booking_request_id = booking_request_id;
    if (dispute_id) existingQuery.dispute_id = dispute_id;
    if (vehicle_id && !booking_request_id && !dispute_id) existingQuery.vehicle_id = vehicle_id;

    const existing = await base44.asServiceRole.entities.CommunicationThread.filter(existingQuery, '-created_date', 1);
    if (existing.length > 0 && !['resolved', 'archived'].includes(existing[0].status)) {
      return Response.json({ thread: existing[0], created: false });
    }

    const now = new Date().toISOString();
    const thread = await base44.asServiceRole.entities.CommunicationThread.create({
      thread_type: event_type,
      subject,
      priority,
      status: 'open',
      booking_request_id,
      vehicle_id,
      dispute_id,
      host_id,
      customer_id,
      last_message_at: now,
      unread_count_host: host_id ? 1 : 0,
      unread_count_customer: customer_id ? 1 : 0,
      unread_count_admin: 1,
      escalation_flag: priority === 'urgent',
      archived: false,
      frozen: false,
      sla_response_due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    await base44.asServiceRole.entities.CommunicationMessage.create({
      thread_id: thread.id,
      sender_role: 'system',
      sender_id: 'system',
      sender_name: 'System',
      message_type: 'system_event',
      body: body || 'Thread automatically created for operational workflow.',
      visible_to_customer: !!customer_id,
      visible_to_host: !!host_id,
      visible_to_admin: true,
      created_at: now,
    });

    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'admin.note_added',
      actor_role: 'automation',
      target_entity: 'CommunicationThread',
      target_id: thread.id,
      target_label: subject,
      host_id,
      customer_id,
      booking_request_id,
      vehicle_id,
      summary: `Communication thread auto-created: ${event_type} — ${subject}`,
      source: 'automation',
      event_status: 'success',
      metadata: { communication_action: 'auto_thread_created', dispute_id },
    }).catch(() => {});

    return Response.json({ thread, created: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});