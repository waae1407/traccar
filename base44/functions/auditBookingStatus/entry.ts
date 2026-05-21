import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Entity automation handler: writes ActivityEvent when BookingRequest.booking_status changes.
 *
 * Scope — only logs frontend/admin-driven transitions. Automation-driven transitions
 * (payment_due, grace_period, suspended) are intentionally excluded here to prevent
 * duplicate writes with processGracePeriod's explicit ActivityEvent logging.
 *
 * Trigger: BookingRequest UPDATE where changed_fields contains "booking_status"
 */

// Statuses managed by backend automations — they write their own rich ActivityEvents
const AUTOMATION_MANAGED_STATUSES = new Set([
  "payment_due", "grace_period", "suspended",
]);

// Map status → specific event_type. Everything else → booking.status_changed
const STATUS_EVENT_MAP = {
  approved:    "booking.approved",
  rejected:    "booking.rejected",
  active:      "booking.activated",
  completed:   "booking.completed",
  cancelled:   "booking.cancelled",
};

// Statuses that are too noisy or not meaningful to audit individually
const SKIP_STATUSES = new Set([
  "draft", "pending_verification", "pending_contract",
  "pending_payment", "pending_review",
]);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const bookingId = payload.event?.entity_id;
    let data = payload.data;
    const oldData = payload.old_data;

    if (!bookingId) return Response.json({ ok: true, skipped: 'no_booking_id' });

    // Fetch if payload was too large
    if (!data) {
      const records = await base44.asServiceRole.entities.BookingRequest.filter({ id: bookingId });
      data = records[0];
    }
    if (!data) return Response.json({ ok: true, skipped: 'booking_not_found' });

    const newStatus = data.booking_status;
    const oldStatus = oldData?.booking_status;

    // Dedup: skip if status didn't actually change (edge case with missing trigger conditions)
    if (newStatus === oldStatus) {
      return Response.json({ ok: true, skipped: 'status_unchanged' });
    }

    // Skip automation-managed states — processGracePeriod handles their audit trail
    if (AUTOMATION_MANAGED_STATUSES.has(newStatus)) {
      return Response.json({ ok: true, skipped: `automation_managed_status:${newStatus}` });
    }

    // Skip noisy/intermediate statuses
    if (SKIP_STATUSES.has(newStatus)) {
      return Response.json({ ok: true, skipped: `low_signal_status:${newStatus}` });
    }

    const eventType = STATUS_EVENT_MAP[newStatus] || "booking.status_changed";
    const dedupeKey = `${eventType}_${bookingId}_${newStatus}`;

    // Lightweight dedup: check if same event was logged in last 90 seconds
    const recentEvents = await base44.asServiceRole.entities.ActivityEvent.list('-created_date', 10);
    const isDuplicate = recentEvents.some(e =>
      e.dedupe_key === dedupeKey &&
      (Date.now() - new Date(e.created_date).getTime()) < 90_000
    );
    if (isDuplicate) {
      console.log(`[AuditBooking] Dedup blocked: ${dedupeKey}`);
      return Response.json({ ok: true, skipped: 'duplicate_within_90s' });
    }

    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: eventType,
      actor_id: data.reviewed_by_user_id || data.assigned_admin_user_id || 'admin',
      actor_email: data.reviewed_by_user_id || 'admin',
      actor_role: 'admin',
      target_entity: 'BookingRequest',
      target_id: bookingId,
      target_label: data.vehicle_name || bookingId,
      host_id: data.host_id || '',
      booking_id: bookingId,
      vehicle_id: data.vehicle_id || '',
      customer_id: data.user_email || '',
      summary: `Booking ${eventType.split('.')[1]}: ${data.customer_full_name || data.user_email} — ${data.vehicle_name} (${oldStatus || '?'} → ${newStatus})`,
      metadata: {
        old_status: oldStatus,
        new_status: newStatus,
        vehicle_name: data.vehicle_name,
        customer_email: data.user_email,
        approval_notes: data.approval_notes,
      },
      source: 'admin_panel',
      user_email: data.user_email || '',
      booking_request_id: bookingId,
      event_title: `Booking ${newStatus}`,
      event_status: ['rejected', 'cancelled', 'suspended'].includes(newStatus) ? 'warning' : 'success',
      dedupe_key: dedupeKey,
    });

    console.log(`[AuditBooking] Logged ${eventType} for booking ${bookingId} (${oldStatus} → ${newStatus})`);
    return Response.json({ ok: true, event_type: eventType, booking_id: bookingId });
  } catch (error) {
    console.error('[AuditBooking] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});