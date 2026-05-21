import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Entity automation handler: writes ActivityEvent when Dispute.status changes.
 *
 * Note: Stripe-driven dispute creation/resolution is handled by stripeWebhook with
 * explicit ActivityEvent writes. This automation covers admin-driven status changes
 * (e.g. via AdminDisputes UI). Dedup protection prevents double-writes when Stripe
 * webhook + entity update fire for the same transition.
 *
 * Trigger: Dispute UPDATE where changed_fields contains "status"
 */

const STATUS_EVENT_MAP = {
  under_review:           "dispute.status_changed",
  evidence_requested:     "dispute.evidence_requested",
  payout_held:            "dispute.status_changed",
  resolved_host_favor:    "dispute.resolved",
  resolved_customer_favor:"dispute.resolved",
  resolved_split:         "dispute.resolved",
  closed_no_action:       "dispute.closed",
  chargeback:             "dispute.chargeback_received",
  open:                   "dispute.status_changed",
};

const RESOLVED_STATUSES = new Set([
  "resolved_host_favor", "resolved_customer_favor", "resolved_split",
]);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const disputeId = payload.event?.entity_id;
    let data = payload.data;
    const oldData = payload.old_data;

    if (!disputeId) return Response.json({ ok: true, skipped: 'no_dispute_id' });

    // Fetch if payload too large
    if (!data) {
      const records = await base44.asServiceRole.entities.Dispute.filter({ id: disputeId });
      data = records[0];
    }
    if (!data) return Response.json({ ok: true, skipped: 'dispute_not_found' });

    const newStatus = data.status;
    const oldStatus = oldData?.status;

    // Skip if status didn't change
    if (newStatus === oldStatus) {
      return Response.json({ ok: true, skipped: 'status_unchanged' });
    }

    const eventType = STATUS_EVENT_MAP[newStatus] || "dispute.status_changed";
    const dedupeKey = `${eventType}_${disputeId}_${newStatus}`;

    // Dedup: Stripe webhooks may have already written the same event — check last 2 minutes
    const recentEvents = await base44.asServiceRole.entities.ActivityEvent.list('-created_date', 10);
    const isDuplicate = recentEvents.some(e =>
      e.dedupe_key === dedupeKey &&
      (Date.now() - new Date(e.created_date).getTime()) < 120_000
    );
    if (isDuplicate) {
      console.log(`[AuditDispute] Dedup blocked: ${dedupeKey}`);
      return Response.json({ ok: true, skipped: 'duplicate_within_2min' });
    }

    const isResolved = RESOLVED_STATUSES.has(newStatus);
    const statusLabel = newStatus.replace(/_/g, ' ');

    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: eventType,
      actor_id: data.assigned_admin_id || data.resolved_by || 'admin',
      actor_email: data.resolved_by || 'admin',
      actor_role: 'admin',
      target_entity: 'Dispute',
      target_id: disputeId,
      target_label: `${data.dispute_type} — ${data.customer_email || ''}`,
      host_id: data.host_id || '',
      booking_id: data.booking_request_id || '',
      vehicle_id: data.vehicle_id || '',
      customer_id: data.customer_email || '',
      summary: `Dispute ${statusLabel}: ${data.dispute_type} — ${data.vehicle_name || ''} (${oldStatus || '?'} → ${newStatus})`,
      metadata: {
        old_status: oldStatus,
        new_status: newStatus,
        dispute_type: data.dispute_type,
        customer_email: data.customer_email,
        vehicle_name: data.vehicle_name,
        stripe_dispute_id: data.stripe_dispute_id,
        resolution_to_host: data.resolution_amount_to_host,
        resolution_to_customer: data.resolution_amount_to_customer,
        admin_notes: data.admin_notes,
      },
      source: 'admin_panel',
      user_email: data.customer_email || '',
      booking_request_id: data.booking_request_id || '',
      event_title: `Dispute: ${statusLabel}`,
      event_status: isResolved ? 'success' : newStatus === 'chargeback' ? 'error' : 'pending',
      dedupe_key: dedupeKey,
    });

    console.log(`[AuditDispute] Logged ${eventType} for dispute ${disputeId} (${oldStatus} → ${newStatus})`);
    return Response.json({ ok: true, event_type: eventType, dispute_id: disputeId });
  } catch (error) {
    console.error('[AuditDispute] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});