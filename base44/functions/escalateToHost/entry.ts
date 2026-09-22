import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * escalateToHost — Customer escalates an AI chat issue to their rental host.
 *
 * Flow:
 *   1. Find the customer's active booking (approved/confirmed/active/checked_out)
 *   2. Resolve the host from the booking
 *   3. Create a CommunicationThread (support_ticket) linked to host + customer + booking
 *   4. Send the customer's initial message
 *   5. Notify the host via in-app + email so they can respond
 *   6. Return the thread so the customer can continue the conversation
 */

const ACTIVE_STATUSES = ['approved', 'confirmed', 'active', 'checked_out'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { subject, message, priority = 'normal' } = await req.json();
    if (!message || !message.trim()) {
      return Response.json({ error: 'A message describing your issue is required' }, { status: 400 });
    }

    // Find the customer's active booking
    const bookings = await base44.entities.BookingRequest.filter({
      user_email: user.email,
      booking_status: { $in: ACTIVE_STATUSES },
    }, '-created_date', 10);

    const activeBooking = bookings.find(b => 
      ACTIVE_STATUSES.includes(b.booking_status) && b.host_id
    );

    if (!activeBooking) {
      return Response.json({ 
        error: 'No active rental found. You can only escalate to a host when you have an active booking.',
        no_active_booking: true,
      }, { status: 404 });
    }

    // Resolve the host
    const hosts = await base44.entities.Host.filter({ id: activeBooking.host_id }, '-created_date', 1);
    const host = hosts[0];
    if (!host) {
      return Response.json({ error: 'Host not found for your booking' }, { status: 404 });
    }

    // Check for an existing open support thread for this booking to avoid duplicates
    const existingThreads = await base44.entities.CommunicationThread.filter({
      booking_request_id: activeBooking.id,
      thread_type: 'support_ticket',
      customer_id: user.email,
      status: { $in: ['open', 'awaiting_host', 'awaiting_customer', 'awaiting_admin'] },
    }, '-created_date', 5);

    const now = new Date().toISOString();
    const slaHours = priority === 'urgent' ? 2 : priority === 'high' ? 4 : 24;
    const threadSubject = subject?.trim() || `Support request — ${activeBooking.vehicle_name || 'your rental'}`;

    let thread;
    if (existingThreads.length > 0) {
      // Reuse existing thread — just add a new message
      thread = existingThreads[0];
    } else {
      // Create new thread
      thread = await base44.entities.CommunicationThread.create({
        thread_type: 'support_ticket',
        subject: threadSubject,
        priority,
        status: 'open',
        booking_request_id: activeBooking.id,
        vehicle_id: activeBooking.vehicle_id || '',
        host_id: host.id,
        customer_id: user.email,
        last_message_at: now,
        unread_count_host: 1,
        unread_count_customer: 0,
        unread_count_admin: 1,
        escalation_flag: priority === 'urgent',
        archived: false,
        frozen: false,
        sla_response_due_at: new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString(),
        attachment_count: 0,
      });
    }

    // Send the customer's message
    await base44.entities.CommunicationMessage.create({
      thread_id: thread.id,
      sender_role: 'customer',
      sender_id: user.id,
      sender_name: user.full_name || user.email,
      sender_email: user.email,
      message_type: 'text',
      body: message.trim(),
      internal_note: false,
      visible_to_customer: true,
      visible_to_host: true,
      visible_to_admin: true,
      created_at: now,
    });

    // Update thread metadata
    await base44.entities.CommunicationThread.update(thread.id, {
      last_message_at: now,
      status: 'awaiting_host',
      unread_count_host: (thread.unread_count_host || 0) + 1,
      unread_count_admin: (thread.unread_count_admin || 0) + 1,
    });

    // Notify the host via in-app + push
    await base44.asServiceRole.functions.invoke('routePlatformNotification', {
      event_type: 'host_support_escalation',
      severity: priority === 'urgent' ? 'critical' : 'warning',
      category: 'system',
      title: `📨 ${user.full_name || user.email} needs help`,
      message: `${user.full_name || 'A customer'} escalated a support issue from the AI chat about ${activeBooking.vehicle_name || 'their rental'}: "${message.trim().slice(0, 120)}${message.length > 120 ? '…' : ''}" — Please respond in your Messages.`,
      booking_id: activeBooking.id,
      host_id: host.id,
      vehicle_id: activeBooking.vehicle_id || '',
      action_url: '/host/communications',
      metadata: { thread_id: thread.id, customer_name: user.full_name, vehicle_name: activeBooking.vehicle_name },
      source_function: 'escalateToHost',
    }).catch(e => console.error('[escalateToHost] host notification failed:', e.message));

    // Direct email to host
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: host.email,
        subject: `Support request from ${user.full_name || user.email}`,
        body: `${user.full_name || 'A customer'} escalated a support issue from the AI chat about ${activeBooking.vehicle_name || 'their rental'}.\n\nTheir message: "${message.trim()}"\n\nPlease respond in your uRide Messages to help them.`,
        from_name: 'uRide Support',
      });
    } catch (e) {
      console.error('[escalateToHost] host email failed:', e.message);
    }

    // Log the escalation
    await base44.entities.ActivityEvent.create({
      event_type: 'admin.note_added',
      actor_email: user.email,
      actor_role: 'customer',
      target_entity: 'CommunicationThread',
      target_id: thread.id,
      target_label: threadSubject,
      host_id: host.id,
      customer_id: user.email,
      booking_request_id: activeBooking.id,
      vehicle_id: activeBooking.vehicle_id || '',
      summary: `Customer escalated to host from AI chat: ${threadSubject}`,
      source: 'customer_app',
      event_status: 'warning',
      metadata: { communication_action: 'host_escalation', thread_id: thread.id, priority },
    }).catch(() => {});

    return Response.json({
      ok: true,
      thread_id: thread.id,
      host_name: host.full_name || host.business_name || 'your host',
      host_email: host.email,
      vehicle_name: activeBooking.vehicle_name || 'your rental',
      booking_id: activeBooking.id,
      reused_existing: existingThreads.length > 0,
    });
  } catch (error) {
    console.error('[escalateToHost] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});