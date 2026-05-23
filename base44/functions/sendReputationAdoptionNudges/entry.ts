import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const [bookings, reviews, hosts, vehicles, maintenance, compliance, notifications] = await Promise.all([
      base44.asServiceRole.entities.BookingRequest.list('-updated_date', 1000),
      base44.asServiceRole.entities.HostReview.list('-created_date', 1000),
      base44.asServiceRole.entities.Host.list('-created_date', 500),
      base44.asServiceRole.entities.Vehicle.list('-created_date', 500),
      base44.asServiceRole.entities.HostMaintenanceLog.list('-created_date', 1000),
      base44.asServiceRole.entities.HostVehicleCompliance.list('-created_date', 1000),
      base44.asServiceRole.entities.Notification.list('-created_date', 1000),
    ]);

    const existingNudgeKeys = new Set(notifications.map((n) => `${n.user_email}:${n.title}:${n.booking_request_id || n.action_link || ''}`));

    const reviewedBookingIds = new Set(reviews.map((r) => r.booking_request_id));
    const renterTargets = bookings.filter((b) => b.booking_status === 'completed' && b.user_email && !reviewedBookingIds.has(b.id));

    let renterNudges = 0;
    for (const booking of renterTargets.slice(0, 100)) {
      const key = `${booking.user_email}:Quick post-trip review:${booking.id}`;
      if (existingNudgeKeys.has(key)) continue;
      await base44.asServiceRole.entities.Notification.create({
        user_email: booking.user_email,
        title: 'Quick post-trip review',
        body: `Tell us how your ${booking.vehicle_name || 'rental'} went. Your feedback stays internal for now and helps improve fleet quality.`,
        type: 'system',
        action_link: '/my-bookings',
        booking_request_id: booking.id,
      });
      renterNudges += 1;
    }

    let hostNudges = 0;
    for (const host of hosts.filter((h) => h.email).slice(0, 200)) {
      const hostVehicles = vehicles.filter((v) => v.host_id === host.id);
      const hostMaintenance = maintenance.filter((m) => m.host_id === host.id || hostVehicles.some((v) => v.id === m.vehicle_id));
      const hostCompliance = compliance.filter((c) => c.host_id === host.id || hostVehicles.some((v) => v.id === c.vehicle_id));

      if (hostVehicles.length > 0 && hostMaintenance.length < hostVehicles.length) {
        const key = `${host.email}:Add maintenance evidence:/host/maintenance`;
        if (!existingNudgeKeys.has(key)) {
          await base44.asServiceRole.entities.Notification.create({
            user_email: host.email,
            title: 'Add maintenance evidence',
            body: 'Upload service logs and receipts so your fleet records have stronger internal evidence coverage.',
            type: 'system',
            action_link: '/host/maintenance',
          });
          hostNudges += 1;
        }
      }

      if (hostVehicles.length > 0 && hostCompliance.length < hostVehicles.length * 2) {
        const key = `${host.email}:Complete compliance records:/host/compliance`;
        if (!existingNudgeKeys.has(key)) {
          await base44.asServiceRole.entities.Notification.create({
            user_email: host.email,
            title: 'Complete compliance records',
            body: 'Upload current insurance and registration documents for each vehicle to improve operational readiness.',
            type: 'system',
            action_link: '/host/compliance',
          });
          hostNudges += 1;
        }
      }
    }

    return Response.json({
      ok: true,
      mode: 'operational_reputation_adoption_only',
      public_scores: false,
      public_badges: false,
      ranking_changes: false,
      suppression_changes: false,
      payment_changes: false,
      renter_review_nudges_created: renterNudges,
      host_evidence_nudges_created: hostNudges,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});