import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * processRentalLifecycleTransitions — Runs every 15-30 minutes.
 *
 * A. Moves ended rentals without return photos to return_required / post_inspection_required.
 * B. Notifies/escalates overdue returns.
 * C. Auto-completes return_pending_host_review after 24 hours.
 * D. Checks vehicle movement after return. If moved >5 miles, disables dispute eligibility.
 * E. Creates OperationalAlerts for stuck lifecycle states.
 */

const ACTIVE_LIFECYCLE_STATUSES = [
  'active', 'approved', 'confirmed', 'checked_out',
  'return_required', 'post_inspection_required', 'overdue_return',
  'return_pending_host_review'
];

const BLOCKING_STATUSES = [
  'active', 'confirmed', 'checked_out',
  'return_required', 'post_inspection_required', 'overdue_return',
  'return_pending_host_review',
  'pending_payment', 'pending_review', 'approved', 'grace_period', 'payment_retry'
];

function getDistanceMiles(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

async function logActivityEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: data.actor_id || 'automation',
      actor_email: data.actor_email || 'automation@uridehub.com',
      actor_role: 'automation',
      target_entity: 'BookingRequest',
      target_id: data.booking_id || '',
      host_id: data.host_id || '',
      booking_id: data.booking_id || '',
      vehicle_id: data.vehicle_id || '',
      customer_id: data.user_email || '',
      summary: data.summary,
      metadata: data.metadata || {},
      source: 'processRentalLifecycleTransitions',
      event_status: data.event_status || 'success',
      dedupe_key: data.dedupe_key,
    });
  } catch (e) {
    console.error('[LifecycleTransition] ActivityEvent error:', e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const results = { return_required: [], overdue: [], auto_completed: [], vehicle_moved: [], alerts: [] };

    // ── TASK A: Move ended rentals without return photos to return_required ──
    const activeBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      booking_status: { $in: ['active', 'approved', 'confirmed', 'checked_out'] }
    });

    for (const booking of activeBookings) {
      if (!booking.end_date) continue;
      const endDate = new Date(booking.end_date + 'T23:59:59');
      if (endDate >= now) continue; // Not ended yet

      // Skip if already has return photos
      if (booking.return_exterior_photos?.length > 0 || booking.dropoff_submitted_at) {
        // Return photos exist — should be in return_pending_host_review already
        continue;
      }

      const dedupeKey = `return_required:${booking.id}:${todayStr}`;
      const existing = await base44.asServiceRole.entities.ActivityEvent.filter({ dedupe_key: dedupeKey }, '-created_date', 1);
      if (existing.length > 0) continue;

      const hasPickupPhotos = booking.pickup_photos?.length > 0;
      const newStatus = hasPickupPhotos ? 'post_inspection_required' : 'return_required';

      await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
        booking_status: newStatus,
        rental_lifecycle_phase: 'return_required',
        return_required_at: booking.return_required_at || now.toISOString(),
        scheduled_end_at: booking.scheduled_end_at || endDate.toISOString(),
      });

      // Notify customer
      await base44.asServiceRole.functions.invoke('routePlatformNotification', {
        event_type: 'return_inspection_required',
        severity: 'warning',
        category: 'bookings',
        title: 'Return Inspection Required',
        message: `Your rental for ${booking.vehicle_name} has reached its scheduled end time. Please complete the return inspection to close your rental.`,
        booking_id: booking.id,
        customer_id: booking.user_id || '',
        user_email: booking.user_email,
        action_url: '/my-vehicle',
      }).catch(e => console.error('[Lifecycle] customer notification failed:', e.message));

      // Notify host
      await base44.asServiceRole.functions.invoke('routePlatformNotification', {
        event_type: 'rental_end_reached',
        severity: 'warning',
        category: 'bookings',
        title: 'Rental End Time Reached',
        message: `Rental for ${booking.vehicle_name} (${booking.customer_full_name}) has reached its scheduled end. Renter has not completed return inspection.`,
        booking_id: booking.id,
        host_id: booking.host_id || '',
        vehicle_id: booking.vehicle_id || '',
        action_url: '/host/vehicles',
      }).catch(e => console.error('[Lifecycle] host notification failed:', e.message));

      // Create OperationalAlert
      await base44.asServiceRole.entities.OperationalAlert.create({
        alert_type: 'return_review_required',
        severity: 'warning',
        status: 'new',
        title: `Return Required — ${booking.vehicle_name}`,
        message: `Booking ${booking.id} end_date passed. Status set to ${newStatus}. Customer must complete return inspection.`,
        recommended_action: 'Monitor customer return. Escalate if not completed within 24 hours.',
        domain: 'fleet',
        vehicle_id: booking.vehicle_id || '',
        host_id: booking.host_id || '',
        related_booking_id: booking.id,
        requires_admin_action: false,
        requires_host_action: false,
        source: 'processRentalLifecycleTransitions',
      }).catch(e => console.error('[Lifecycle] alert creation failed:', e.message));

      await logActivityEvent(base44, {
        event_type: 'lifecycle.return_required',
        booking_id: booking.id,
        host_id: booking.host_id,
        vehicle_id: booking.vehicle_id,
        user_email: booking.user_email,
        summary: `Booking moved to ${newStatus} — end_date passed without return photos`,
        metadata: { end_date: booking.end_date, new_status: newStatus },
        dedupe_key: dedupeKey,
        event_status: 'warning',
      });

      results.return_required.push({ id: booking.id, status: newStatus });
    }

    // ── TASK B: Escalate overdue returns (return_required/post_inspection_required > 24h) ──
    const returnRequiredBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      booking_status: { $in: ['return_required', 'post_inspection_required'] }
    });

    for (const booking of returnRequiredBookings) {
      const requiredAt = booking.return_required_at ? new Date(booking.return_required_at) : null;
      if (!requiredAt) continue;

      const hoursSinceReturn = (now.getTime() - requiredAt.getTime()) / (1000 * 60 * 60);

      // Escalate to overdue_return after 24 hours
      if (hoursSinceReturn > 24 && booking.booking_status !== 'overdue_return') {
        await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
          booking_status: 'overdue_return',
          rental_lifecycle_phase: 'return_required',
        });

        await base44.asServiceRole.functions.invoke('routePlatformNotification', {
          event_type: 'return_overdue',
          severity: 'critical',
          category: 'bookings',
          title: 'Return Overdue — Action Required',
          message: `Your rental for ${booking.vehicle_name} is overdue. Please complete the return inspection immediately.`,
          booking_id: booking.id,
          customer_id: booking.user_id || '',
          user_email: booking.user_email,
          action_url: '/my-vehicle',
        }).catch(e => console.error('[Lifecycle] overdue notification failed:', e.message));

        await base44.asServiceRole.entities.OperationalAlert.create({
          alert_type: 'overdue_return',
          severity: 'critical',
          status: 'new',
          title: `Overdue Return — ${booking.vehicle_name}`,
          message: `Booking ${booking.id} return is overdue by ${Math.round(hoursSinceReturn)} hours. Customer: ${booking.customer_full_name}.`,
          recommended_action: 'Contact customer. Consider starter disable if policy allows.',
          domain: 'fleet',
          vehicle_id: booking.vehicle_id || '',
          host_id: booking.host_id || '',
          related_booking_id: booking.id,
          requires_admin_action: true,
          requires_host_action: true,
          source: 'processRentalLifecycleTransitions',
        }).catch(e => console.error('[Lifecycle] overdue alert failed:', e.message));

        results.overdue.push({ id: booking.id, hours: Math.round(hoursSinceReturn) });
      }
    }

    // ── TASK C: Auto-complete return_pending_host_review after 24 hours ──
    const pendingReviewBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      booking_status: 'return_pending_host_review'
    });

    for (const booking of pendingReviewBookings) {
      const returnCompletedAt = booking.return_completed_at || booking.dropoff_submitted_at;
      if (!returnCompletedAt) continue;

      const reviewDueAt = booking.host_review_due_at
        ? new Date(booking.host_review_due_at)
        : new Date(new Date(returnCompletedAt).getTime() + 24 * 60 * 60 * 1000);

      if (now < reviewDueAt) continue; // Window not expired yet

      // Auto-complete the booking
      await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
        booking_status: 'completed',
        rental_lifecycle_phase: 'completed',
        auto_completed_at: now.toISOString(),
        completed_at: now.toISOString(),
        completion_reason: 'host_review_window_expired',
        host_review_status: 'auto_completed',
        rental_ended_at: booking.rental_ended_at || now.toISOString(),
        rental_ended_by: 'system_auto_complete',
        autopay_enabled: false,
        pending_review_alert_active: false,
        clean_return_status: booking.clean_return_status === 'not_returned' ? 'approved_clean' : booking.clean_return_status,
      });

      // Check if vehicle can become available
      if (booking.vehicle_id) {
        const conflictingBookings = await base44.asServiceRole.entities.BookingRequest.filter({
          vehicle_id: booking.vehicle_id,
          booking_status: { $in: BLOCKING_STATUSES },
          id: { $ne: booking.id },
        });

        if (conflictingBookings.length === 0) {
          await base44.asServiceRole.entities.Vehicle.update(booking.vehicle_id, {
            status: 'Available',
          });
        }
      }

      // Notify host
      await base44.asServiceRole.functions.invoke('routePlatformNotification', {
        event_type: 'host_review_auto_completed',
        severity: 'warning',
        category: 'bookings',
        title: 'Return Auto-Completed — Review Window Expired',
        message: `The 24-hour review window for ${booking.vehicle_name} has expired. The return has been auto-completed. You may still open a damage dispute if the vehicle has not moved.`,
        booking_id: booking.id,
        host_id: booking.host_id || '',
        vehicle_id: booking.vehicle_id || '',
        action_url: '/host/vehicles',
        metadata: {
          auto_completed_at: now.toISOString(),
          damage_dispute_deadline_at: booking.damage_dispute_deadline_at,
          damage_dispute_allowed: booking.damage_dispute_allowed_after_auto_complete !== false,
        },
      }).catch(e => console.error('[Lifecycle] host auto-complete notification failed:', e.message));

      // Notify customer
      await base44.asServiceRole.functions.invoke('routePlatformNotification', {
        event_type: 'rental_auto_completed',
        severity: 'info',
        category: 'bookings',
        title: 'Rental Completed',
        message: `Your rental for ${booking.vehicle_name} has been completed. Thank you for using uRide!`,
        booking_id: booking.id,
        customer_id: booking.user_id || '',
        user_email: booking.user_email,
        action_url: '/my-bookings',
      }).catch(e => console.error('[Lifecycle] customer auto-complete notification failed:', e.message));

      // Notify admin
      await base44.asServiceRole.entities.OperationalAlert.create({
        alert_type: 'return_review_required',
        severity: 'info',
        status: 'new',
        title: `Auto-Completed — ${booking.vehicle_name}`,
        message: `Booking ${booking.id} auto-completed after 24h host review window expired. Host: ${booking.host_id}.`,
        recommended_action: 'Verify no damage dispute needed. Check vehicle availability.',
        domain: 'fleet',
        vehicle_id: booking.vehicle_id || '',
        host_id: booking.host_id || '',
        related_booking_id: booking.id,
        requires_admin_action: false,
        source: 'processRentalLifecycleTransitions',
      }).catch(e => console.error('[Lifecycle] admin alert failed:', e.message));

      await logActivityEvent(base44, {
        event_type: 'lifecycle.auto_completed',
        booking_id: booking.id,
        host_id: booking.host_id,
        vehicle_id: booking.vehicle_id,
        user_email: booking.user_email,
        summary: `Booking auto-completed — host review window expired (24h)`,
        metadata: { return_completed_at: returnCompletedAt, auto_completed_at: now.toISOString() },
        dedupe_key: `auto_complete:${booking.id}:${todayStr}`,
      });

      results.auto_completed.push({ id: booking.id });
    }

    // ── TASK D: Check vehicle movement after return ──
    const returnedBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      booking_status: 'completed',
      damage_dispute_allowed_after_auto_complete: true,
    });

    for (const booking of returnedBookings) {
      if (!booking.return_photo_lat || !booking.return_photo_lon) continue;
      if (!booking.vehicle_id) continue;

      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
      const vehicle = vehicles[0];
      if (!vehicle) continue;

      // Check telematics device for current location
      if (!vehicle.telematics_device_id) continue;
      const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: vehicle.telematics_device_id });
      const device = devices[0];
      if (!device?.last_latitude || !device?.last_longitude) continue;

      const distanceFromReturn = getDistanceMiles(
        booking.return_photo_lat, booking.return_photo_lon,
        device.last_latitude, device.last_longitude
      );

      if (distanceFromReturn !== null && distanceFromReturn > 5) {
        await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
          damage_dispute_allowed_after_auto_complete: false,
          vehicle_moved_after_return_at: now.toISOString(),
          vehicle_distance_from_return_miles: distanceFromReturn,
        });

        await base44.asServiceRole.functions.invoke('routePlatformNotification', {
          event_type: 'vehicle_moved_after_return',
          severity: 'warning',
          category: 'bookings',
          title: 'Vehicle Moved After Return — Dispute Restricted',
          message: `Vehicle ${booking.vehicle_name} has moved ${distanceFromReturn} miles from the return photo location. Host damage dispute privilege has been disabled. Admin exception required.`,
          booking_id: booking.id,
          host_id: booking.host_id || '',
          vehicle_id: booking.vehicle_id || '',
          action_url: '/host/vehicles',
        }).catch(e => console.error('[Lifecycle] vehicle moved notification failed:', e.message));

        results.vehicle_moved.push({ id: booking.id, distance: distanceFromReturn });
      }
    }

    return Response.json({ ok: true, ...results });
  } catch (error) {
    console.error('[LifecycleTransition] Fatal error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});