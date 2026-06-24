/**
 * checkOverdueAndIncompleteBookings — Daily scan for booking issues
 *
 * Scans for:
 *   1. Pickup inspection incomplete (start_date passed, no pickup_photos)
 *   2. Rental overdue (end_date passed, booking not completed)
 *   3. Return review pending >24 hours
 *
 * Sends alerts to hosts and admins via sendBookingAlertNotifications
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Fetch all active bookings
    const allBookings = await base44.asServiceRole.entities.BookingRequest.filter({});
    
    const overdue = [];
    const pickupIncomplete = [];
    const returnReviewPending = [];

    for (const booking of allBookings) {
      // Skip completed/cancelled bookings
      if (['completed', 'cancelled'].includes(booking.booking_status)) continue;

      // Check 1: Pickup inspection incomplete
      if (booking.start_date && new Date(booking.start_date + 'T00:00:00') <= today && 
          (!booking.pickup_photos || booking.pickup_photos.length === 0) &&
          ['approved', 'confirmed', 'active'].includes(booking.booking_status)) {
        pickupIncomplete.push(booking);
      }

      // Check 2: Rental overdue
      if (booking.end_date && new Date(booking.end_date + 'T23:59:59') < today &&
          !['completed', 'cancelled', 'return_pending_host_review'].includes(booking.booking_status)) {
        overdue.push(booking);
      }

      // Check 3: Return review pending >24 hours
      if (booking.booking_status === 'return_pending_host_review' && booking.dropoff_submitted_at) {
        const submittedAt = new Date(booking.dropoff_submitted_at);
        const hoursSinceReturn = (Date.now() - submittedAt.getTime()) / (1000 * 60 * 60);
        if (hoursSinceReturn > 24) {
          returnReviewPending.push(booking);
        }
      }
    }

    console.log(`[OverdueCheck] Found: ${overdue.length} overdue, ${pickupIncomplete.length} pickup incomplete, ${returnReviewPending.length} return review pending`);

    const results = { overdue: [], pickupIncomplete: [], returnReviewPending: [] };

    // Send overdue alerts
    for (const booking of overdue) {
      try {
        const dedupeKey = `overdue_alert:${booking.id}:${todayStr}`;
        const existing = await base44.asServiceRole.entities.ActivityEvent.filter({ dedupe_key: dedupeKey }, '-created_date', 1);
        if (existing.length > 0) {
          console.log(`[OverdueCheck] Skipped ${booking.id} — already alerted today`);
          continue;
        }

        await base44.asServiceRole.functions.invoke('sendBookingAlertNotifications', {
          event_type: 'rental_overdue',
          booking: {
            id: booking.id,
            host_id: booking.host_id,
            vehicle_id: booking.vehicle_id,
            vehicle_name: booking.vehicle_name,
            customer_full_name: booking.customer_full_name,
            user_email: booking.user_email,
            end_date: booking.end_date,
            booking_status: booking.booking_status,
            weekly_rate: booking.weekly_rate,
          },
        });

        await base44.asServiceRole.entities.ActivityEvent.create({
          event_type: 'notification.rental_overdue.sent',
          actor_id: 'checkOverdueAndIncompleteBookings',
          actor_email: 'automation@uridehub.com',
          actor_role: 'automation',
          target_entity: 'BookingRequest',
          target_id: booking.id,
          host_id: booking.host_id || '',
          booking_id: booking.id,
          vehicle_id: booking.vehicle_id || '',
          summary: `Overdue alert sent to host for ${booking.vehicle_name}`,
          dedupe_key: dedupeKey,
          source: 'automation',
          event_status: 'success',
        });

        results.overdue.push({ id: booking.id, vehicle: booking.vehicle_name, status: 'alert_sent' });
      } catch (e) {
        console.error(`[OverdueCheck] Failed to alert for ${booking.id}:`, e.message);
      }
    }

    // Send pickup incomplete alerts
    for (const booking of pickupIncomplete) {
      try {
        const dedupeKey = `pickup_incomplete_alert:${booking.id}:${todayStr}`;
        const existing = await base44.asServiceRole.entities.ActivityEvent.filter({ dedupe_key: dedupeKey }, '-created_date', 1);
        if (existing.length > 0) continue;

        await base44.asServiceRole.functions.invoke('sendBookingAlertNotifications', {
          event_type: 'pickup_inspection_incomplete',
          booking: {
            id: booking.id,
            host_id: booking.host_id,
            vehicle_id: booking.vehicle_id,
            vehicle_name: booking.vehicle_name,
            customer_full_name: booking.customer_full_name,
            user_email: booking.user_email,
            start_date: booking.start_date,
            booking_status: booking.booking_status,
          },
        });

        await base44.asServiceRole.entities.ActivityEvent.create({
          event_type: 'notification.pickup_inspection_incomplete.sent',
          actor_id: 'checkOverdueAndIncompleteBookings',
          actor_email: 'automation@uridehub.com',
          actor_role: 'automation',
          target_entity: 'BookingRequest',
          target_id: booking.id,
          host_id: booking.host_id || '',
          booking_id: booking.id,
          vehicle_id: booking.vehicle_id || '',
          summary: `Pickup incomplete alert sent to host for ${booking.vehicle_name}`,
          dedupe_key: dedupeKey,
          source: 'automation',
          event_status: 'success',
        });

        results.pickupIncomplete.push({ id: booking.id, vehicle: booking.vehicle_name, status: 'alert_sent' });
      } catch (e) {
        console.error(`[OverdueCheck] Failed to alert for ${booking.id}:`, e.message);
      }
    }

    // Send return review pending alerts
    for (const booking of returnReviewPending) {
      try {
        const dedupeKey = `return_review_alert:${booking.id}:${todayStr}`;
        const existing = await base44.asServiceRole.entities.ActivityEvent.filter({ dedupe_key: dedupeKey }, '-created_date', 1);
        if (existing.length > 0) continue;

        await base44.asServiceRole.functions.invoke('sendBookingAlertNotifications', {
          event_type: 'return_review_required',
          booking: {
            id: booking.id,
            host_id: booking.host_id,
            vehicle_id: booking.vehicle_id,
            vehicle_name: booking.vehicle_name,
            customer_full_name: booking.customer_full_name,
            user_email: booking.user_email,
            booking_status: booking.booking_status,
            dropoff_submitted_at: booking.dropoff_submitted_at,
          },
        });

        await base44.asServiceRole.entities.ActivityEvent.create({
          event_type: 'notification.return_review_required.sent',
          actor_id: 'checkOverdueAndIncompleteBookings',
          actor_email: 'automation@uridehub.com',
          actor_role: 'automation',
          target_entity: 'BookingRequest',
          target_id: booking.id,
          host_id: booking.host_id || '',
          booking_id: booking.id,
          vehicle_id: booking.vehicle_id || '',
          summary: `Return review alert sent to host for ${booking.vehicle_name}`,
          dedupe_key: dedupeKey,
          source: 'automation',
          event_status: 'success',
        });

        results.returnReviewPending.push({ id: booking.id, vehicle: booking.vehicle_name, status: 'alert_sent' });
      } catch (e) {
        console.error(`[OverdueCheck] Failed to alert for ${booking.id}:`, e.message);
      }
    }

    // Create admin summary alert if any issues found
    const totalIssues = overdue.length + pickupIncomplete.length + returnReviewPending.length;
    if (totalIssues > 0) {
      await base44.asServiceRole.entities.PaymentOperationalAlert.create({
        alert_type: 'booking_issues_detected',
        severity: totalIssues > 5 ? 'critical' : 'warning',
        status: 'new',
        billing_context: 'booking_monitor',
        title: `Daily Booking Monitor: ${totalIssues} issues detected`,
        message: `Overdue: ${overdue.length}, Pickup Incomplete: ${pickupIncomplete.length}, Return Review Pending: ${returnReviewPending.length}`,
        recommended_action: 'Review bookings in admin dashboard and follow up with hosts/customers as needed.',
        financial_impact_amount: overdue.reduce((sum, b) => sum + (b.weekly_rate || 0), 0),
        currency: 'usd',
        requires_admin_action: true,
        source: 'checkOverdueAndIncompleteBookings',
        metadata: {
          scan_date: todayStr,
          overdue_count: overdue.length,
          pickup_incomplete_count: pickupIncomplete.length,
          return_review_count: returnReviewPending.length,
        },
      });
    }

    return Response.json({ ok: true, scan_date: todayStr, results });
  } catch (error) {
    console.error('[OverdueCheck] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});