import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ACTIVE_BOOKING_STATUSES = ['approved', 'confirmed', 'active', 'payment_due', 'grace_period', 'return_pending_host_review', 'under_review'];

function todayDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !bStart) return true;
  const a1 = new Date(`${aStart}T00:00:00`);
  const a2 = new Date(`${aEnd || aStart}T23:59:59`);
  const b1 = new Date(`${bStart}T00:00:00`);
  const b2 = new Date(`${bEnd || bStart}T23:59:59`);
  return a1 <= b2 && b1 <= a2;
}

function fail(reason, status = 'blocked') {
  return { ok: false, status, reason };
}

async function validateVehicleCompliance(base44, vehicle) {
  if (!vehicle) return fail('Vehicle not found.', 'rejected');
  if (!vehicle.host_id) return fail('Vehicle is missing host assignment.', 'blocked');
  if (vehicle.status === 'Compliance Hold') return fail('Vehicle is on compliance hold.', 'blocked');
  if (!['Available', 'Booked', 'Reserved', 'Active Rental'].includes(vehicle.status)) return fail('Vehicle is not available for this booking.', 'blocked');

  const compliance = await base44.asServiceRole.entities.HostVehicleCompliance.filter({ vehicle_id: vehicle.id });
  const expired = compliance.filter(c => c.status === 'expired');
  if (expired.length) return fail(`Expired compliance documents: ${expired.map(c => c.doc_type).join(', ')}.`, 'blocked');

  const required = ['insurance', 'registration'];
  const uploaded = compliance.map(c => c.doc_type);
  const missing = required.filter(type => !uploaded.includes(type));
  if (missing.length) return fail(`Missing required compliance documents: ${missing.join(', ')}.`, 'blocked');

  return { ok: true };
}

function rtoInitialsComplete(contractInitials) {
  if (!contractInitials) return false;
  try {
    const initials = typeof contractInitials === 'string' ? JSON.parse(contractInitials) : contractInitials;
    return !!initials?.rto_forfeiture?.initials;
  } catch (_error) {
    return false;
  }
}

function validateRtoAutoApprovalMinimums(booking, vehicle) {
  if (booking.booking_type !== 'Rent-to-Own') return { ok: true };
  if (vehicle?.rent_to_own_eligible !== true) return fail('Vehicle is not eligible for rent-to-own.', 'blocked');
  if (booking.contract_status !== 'signed') return fail('Rent-to-own contract must be signed.', 'review_required');
  if (booking.payment_status !== 'paid') return fail('Rent-to-own payment must be paid.', 'review_required');
  if (booking.verification_status !== 'verified') return fail('Customer identity verification is complete.', 'review_required');
  if (!rtoInitialsComplete(booking.contract_initials)) return fail('Required rent-to-own contract initials are completed.', 'review_required');
  if (vehicle?.status === 'Compliance Hold') return fail('Vehicle is on compliance hold.', 'blocked');
  return { ok: true };
}

async function restoreStarterIfNeeded(base44, booking) {
  if (!(booking.starter_disabled || booking.moovetrax_kill_active) || !booking.vehicle_id) return false;
  try {
    await base44.asServiceRole.functions.invoke('sendTelematicsCommand', {
      vehicle_id: booking.vehicle_id,
      booking_id: booking.id,
      command_type: 'restore_starter',
      service_context: 'payment_enforcement',
      source: 'processGracePeriod',
      reason: 'Payment recovered and booking auto-approved; restoring starter access.',
      confirm_starter_command: true
    });
    return true;
  } catch (_error) {
    return false;
  }
}

async function writeOutcome(base44, booking, outcome, bookingStatus = 'under_review') {
  const now = new Date().toISOString();
  const updated = await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
    booking_status: bookingStatus,
    auto_approval_status: outcome.status,
    auto_approval_reason: outcome.reason,
    auto_approval_checked_at: now,
    pending_review_alert_active: outcome.status === 'review_required'
  });
  await base44.asServiceRole.entities.ActivityEvent.create({
    event_type: 'booking.auto_approval_checked',
    actor_id: 'auto_approval_system',
    actor_email: 'system',
    actor_role: 'automation',
    target_entity: 'BookingRequest',
    target_id: booking.id,
    booking_id: booking.id,
    vehicle_id: booking.vehicle_id || '',
    host_id: booking.host_id || '',
    customer_id: booking.user_email || '',
    user_email: booking.user_email || 'system',
    event_title: 'Auto Approval Checked',
    event_description: outcome.reason,
    event_status: outcome.status === 'approved' ? 'success' : 'warning',
    summary: outcome.reason,
    source: 'autoApproveBooking'
  }).catch(() => {});
  return updated;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const { booking_request_id, source = 'system' } = await req.json().catch(() => ({}));
    if (!booking_request_id) return Response.json({ error: 'Missing booking_request_id' }, { status: 400 });

    const booking = await base44.asServiceRole.entities.BookingRequest.get(booking_request_id).catch(() => null);
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });
    if (user && user.role !== 'admin' && booking.user_email !== user.email && booking.user_id !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (booking.auto_approval_status === 'approved' && ['approved', 'active', 'confirmed'].includes(booking.booking_status)) {
      return Response.json({ ok: true, auto_approval_status: 'approved', booking, idempotent: true });
    }

    const vehicle = booking.vehicle_id ? await base44.asServiceRole.entities.Vehicle.get(booking.vehicle_id).catch(() => null) : null;
    const hostId = booking.host_id || vehicle?.host_id || '';
    const host = hostId ? await base44.asServiceRole.entities.Host.get(hostId).catch(() => null) : null;
    const commerceProfiles = hostId ? await base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id: hostId }, '-updated_date', 1) : [];
    const commerce = commerceProfiles[0] || null;

    const checks = [
      [!!booking.id, 'Booking request exists.'],
      [!!vehicle, 'Vehicle exists.'],
      [!!hostId, 'Vehicle has valid host assignment.'],
      [!!host && host.status === 'approved' && host.booking_blocked !== true, 'Host is active and can receive bookings.'],
      [!commerce || commerce.booking_enabled !== false, 'Host commerce profile allows booking.'],
      [booking.verification_status === 'verified', 'Customer identity verification is complete.'],
      [booking.contract_status === 'signed', 'Contract is signed.'],
      [!!booking.contract_initials, 'Required contract initials are completed.'],
      [booking.consent_terms === true && booking.consent_esign === true && booking.consent_verification === true, 'Required terms consents are completed.'],
      [booking.payment_status === 'paid', 'Payment is paid.'],
      [booking.autopay_enabled === true || booking.consent_autopay === true || booking.payment_accepted_recurring_notice === true, 'Autopay authorization is accepted.']
    ];

    for (const [passed, message] of checks) {
      if (!passed) {
        const updated = await writeOutcome(base44, booking, fail(message, 'review_required'), 'under_review');
        return Response.json({ ok: false, auto_approval_status: 'review_required', auto_approval_reason: message, booking: updated });
      }
    }

    const rtoValidation = validateRtoAutoApprovalMinimums(booking, vehicle);
    if (!rtoValidation.ok) {
      const updated = await writeOutcome(base44, booking, rtoValidation, rtoValidation.status === 'blocked' ? 'rejected' : 'under_review');
      return Response.json({ ok: false, auto_approval_status: rtoValidation.status, auto_approval_reason: rtoValidation.reason, booking: updated });
    }

    const compliance = await validateVehicleCompliance(base44, vehicle);
    if (!compliance.ok) {
      const updated = await writeOutcome(base44, booking, compliance, compliance.status === 'rejected' ? 'rejected' : 'under_review');
      return Response.json({ ok: false, auto_approval_status: compliance.status, auto_approval_reason: compliance.reason, booking: updated });
    }

    const customers = booking.user_email ? await base44.asServiceRole.entities.Customer.filter({ email: booking.user_email }) : [];
    if (customers.some(c => String(c.status || '').toLowerCase() === 'blocked')) {
      const reason = 'Customer account requires fraud or safety review.';
      const updated = await writeOutcome(base44, booking, fail(reason, 'review_required'), 'under_review');
      return Response.json({ ok: false, auto_approval_status: 'review_required', auto_approval_reason: reason, booking: updated });
    }

    const vehicleBookings = await base44.asServiceRole.entities.BookingRequest.filter({ vehicle_id: vehicle.id });
    const conflict = vehicleBookings.find(other => other.id !== booking.id && ACTIVE_BOOKING_STATUSES.includes(other.booking_status) && overlaps(booking.start_date, booking.end_date, other.start_date, other.end_date));
    if (conflict) {
      const reason = 'Vehicle is already booked by another customer for this rental window.';
      const updated = await writeOutcome(base44, booking, fail(reason, 'blocked'), 'under_review');
      return Response.json({ ok: false, auto_approval_status: 'blocked', auto_approval_reason: reason, booking: updated });
    }

    const start = booking.start_date ? new Date(`${booking.start_date}T00:00:00`) : todayDate();
    const contactlessReady = !!(vehicle.contactless_pickup && (vehicle.moovetrax_device_id || vehicle.telematics_device_id));
    const shouldActivate = contactlessReady && start <= todayDate();
    const newStatus = shouldActivate ? 'active' : 'approved';
    const now = new Date().toISOString();
    const starterRestored = await restoreStarterIfNeeded(base44, booking);
    const nextBillingDate = booking.next_billing_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const updated = await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
      host_id: hostId,
      booking_status: newStatus,
      payment_status: 'paid',
      auto_approval_status: 'approved',
      auto_approval_reason: shouldActivate ? 'Booking auto-approved and activated for contactless pickup.' : 'Booking auto-approved. Pickup details are now available.',
      auto_approval_checked_at: now,
      pending_review_alert_active: false,
      viewed_by_admin: true,
      payment_failure_attempts: 0,
      payment_failure_reason: null,
      last_payment_failure_at: null,
      last_retry_at: null,
      payment_failure_started_at: null,
      starter_disable_scheduled_at: null,
      starter_disabled: false,
      moovetrax_kill_active: false,
      grace_period_started_at: null,
      grace_period_ends_at: null,
      suspension_triggered_at: null,
      suspended_at: null,
      next_billing_date: nextBillingDate
    });

    await base44.asServiceRole.entities.Vehicle.update(vehicle.id, { status: shouldActivate ? 'Active Rental' : 'Booked' }).catch(() => {});

    const existingEvents = await base44.asServiceRole.entities.ActivityEvent.filter({ booking_id: booking.id }, '-created_date', 20).catch(() => []);
    const alreadyNotified = existingEvents.some(e => e.event_type === 'booking.auto_approved');
    if (!alreadyNotified) {
      await base44.asServiceRole.entities.Notification.create({
        user_email: booking.user_email,
        title: shouldActivate ? 'Your rental is active' : 'Booking Approved',
        body: shouldActivate ? `Your ${booking.vehicle_name} is approved and active. Pickup details are now available.` : `Your ${booking.vehicle_name} booking is approved. Pickup details are now available.`,
        type: 'booking',
        booking_request_id: booking.id
      }).catch(() => {});
      await base44.asServiceRole.entities.ActivityEvent.create({
        event_type: 'booking.auto_approved',
        actor_id: 'auto_approval_system',
        actor_email: 'system',
        actor_role: 'automation',
        target_entity: 'BookingRequest',
        target_id: booking.id,
        booking_id: booking.id,
        vehicle_id: vehicle.id,
        host_id: hostId,
        customer_id: booking.user_email || '',
        user_email: booking.user_email || 'system',
        event_title: shouldActivate ? 'Rental Active' : 'Booking Approved',
        event_description: starterRestored ? 'Booking approved and starter access restored.' : 'Booking approved automatically.',
        event_status: 'success',
        summary: `Auto-approved booking ${booking.id} from ${source}`,
        metadata: { source, starter_restored: starterRestored, booking_status: newStatus },
        source: 'autoApproveBooking'
      }).catch(() => {});
    }

    return Response.json({ ok: true, auto_approval_status: 'approved', booking_status: newStatus, starter_restored: starterRestored, booking: updated });
  } catch (error) {
    console.error('[autoApproveBooking] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});