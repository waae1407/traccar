import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * escalateToAdmin — Host escalates an AI chat issue to the platform admin team.
 *
 * All escalations are treated as URGENT/CRITICAL.
 * Admins are notified via ALL channels: in-app, email, SMS, and push.
 *
 * Flow:
 *   1. Identify the host from the authenticated user
 *   2. Create a support_ticket CommunicationThread linked to the host
 *   3. Send the host's initial message
 *   4. Notify all admins via routePlatformNotification (critical severity → all channels)
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { subject, message } = await req.json();
    if (!message || !message.trim()) {
      return Response.json({ error: 'A message describing your issue is required' }, { status: 400 });
    }

    // Identify the host
    const hostRecords = await base44.entities.Host.filter({ email: user.email }, '-created_date', 1);
    const host = hostRecords[0];
    if (!host) {
      return Response.json({ error: 'Only host accounts can escalate to admin.' }, { status: 403 });
    }

    // Check for an existing open admin escalation thread for this host
    const existingThreads = await base44.entities.CommunicationThread.filter({
      host_id: host.id,
      thread_type: 'support_ticket',
      customer_id: '', // admin escalation threads have no customer
      status: { $in: ['open', 'awaiting_host', 'awaiting_admin'] },
    }, '-created_date', 5);

    const now = new Date().toISOString();
    const threadSubject = subject?.trim() || `Admin support request — ${host.business_name || host.full_name}`;

    let thread;
    if (existingThreads.length > 0) {
      thread = existingThreads[0];
    } else {
      thread = await base44.entities.CommunicationThread.create({
        thread_type: 'support_ticket',
        subject: threadSubject,
        priority: 'urgent',
        status: 'open',
        host_id: host.id,
        customer_id: '',
        last_message_at: now,
        unread_count_host: 0,
        unread_count_admin: 1,
        escalation_flag: true,
        archived: false,
        frozen: false,
        sla_response_due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2hr SLA for urgent
        attachment_count: 0,
      });
    }

    // Send the host's message
    await base44.entities.CommunicationMessage.create({
      thread_id: thread.id,
      sender_role: 'host',
      sender_id: user.id,
      sender_name: host.full_name || user.full_name,
      sender_email: user.email,
      message_type: 'text',
      body: message.trim(),
      internal_note: false,
      visible_to_customer: false,
      visible_to_host: true,
      visible_to_admin: true,
      created_at: now,
    });

    // Update thread metadata
    await base44.entities.CommunicationThread.update(thread.id, {
      last_message_at: now,
      status: 'awaiting_admin',
      unread_count_admin: (thread.unread_count_admin || 0) + 1,
      escalation_flag: true,
    });

    // Notify ALL admins via ALL channels (critical severity triggers email+SMS+push+in-app)
    await base44.asServiceRole.functions.invoke('routePlatformNotification', {
      event_type: 'host_admin_escalation',
      severity: 'critical',
      category: 'system',
      title: `🚨 ${host.business_name || host.full_name} needs admin help`,
      message: `${host.full_name} (${host.email}) escalated an urgent support issue from the AI chat: "${message.trim().slice(0, 150)}${message.length > 150 ? '…' : ''}" — Please respond in Communications.`,
      host_id: host.id,
      action_url: '/admin/communications',
      metadata: {
        thread_id: thread.id,
        host_name: host.full_name,
        host_email: host.email,
        host_business: host.business_name,
        escalation_source: 'host_ai_chat',
      },
      source_function: 'escalateToAdmin',
    }).catch(e => console.error('[escalateToAdmin] admin notification failed:', e.message));

    // Log the escalation
    await base44.entities.ActivityEvent.create({
      event_type: 'admin.note_added',
      actor_email: user.email,
      actor_role: 'host',
      target_entity: 'CommunicationThread',
      target_id: thread.id,
      target_label: threadSubject,
      host_id: host.id,
      summary: `Host escalated to admin from AI chat: ${threadSubject}`,
      source: 'host_portal',
      event_status: 'warning',
      metadata: { communication_action: 'admin_escalation', thread_id: thread.id, priority: 'urgent' },
    }).catch(() => {});

    return Response.json({
      ok: true,
      thread_id: thread.id,
      reused_existing: existingThreads.length > 0,
    });
  } catch (error) {
    console.error('[escalateToAdmin] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});