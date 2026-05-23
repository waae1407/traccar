import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function confidence(score) {
  if (score >= 75) return 'high';
  if (score >= 45) return 'moderate';
  return 'low';
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function avg(values) {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!clean.length) return 0;
  return Math.round(clean.reduce((s, v) => s + v, 0) / clean.length);
}

function repeatStats(bookings) {
  const renterCounts = {};
  for (const b of bookings.filter((x) => x.user_email)) renterCounts[b.user_email] = (renterCounts[b.user_email] || 0) + 1;
  const repeatRenters = Object.values(renterCounts).filter((count) => count > 1).length;
  const repeatBookings = bookings.filter((b) => renterCounts[b.user_email] > 1).length;
  return { repeatRenters, repeatBookings };
}

function inspectionStats(bookings) {
  const completed = bookings.filter((b) => b.booking_status === 'completed');
  const pickupDone = completed.filter((b) => (b.pickup_photos || []).length > 0).length;
  const dropoffDone = completed.filter((b) => (b.return_exterior_photos || []).length > 0 || (b.return_interior_photos || []).length > 0).length;
  const timestamps = completed.filter((b) => b.pickup_submitted_at || b.dropoff_submitted_at).length;
  const gps = completed.filter((b) => b.pickup_location_lat || b.dropoff_location_lat).length;
  const coverage = completed.map((b) => Math.min(1, ((b.pickup_photos || []).length + (b.return_exterior_photos || []).length + (b.return_interior_photos || []).length) / 6));
  return {
    pickupRate: pct(pickupDone, completed.length),
    dropoffRate: pct(dropoffDone, completed.length),
    timestampRate: pct(timestamps, completed.length),
    gpsRate: pct(gps, completed.length),
    coverageRate: coverage.length ? Math.round(avg(coverage.map((v) => v * 100))) : 0,
  };
}

function gpsStats(vehicle, gpsEvents, activeBookings) {
  const gpsRequired = !!vehicle.moovetrax_device_id && vehicle.telematics_provider !== 'none';
  const events = gpsEvents.filter((e) => e.device_id === vehicle.moovetrax_device_id || e.vehicle_id === vehicle.id);
  const online = events.filter((e) => e.event_type === 'device_online' || e.event_type === 'location_ping').length;
  const offline = events.filter((e) => e.event_type === 'device_offline').length;
  const uptime = events.length ? pct(online, online + offline || events.length) : 0;
  const activeForVehicle = activeBookings.some((b) => b.vehicle_id === vehicle.id);
  return { gpsRequired, eventCount: events.length, uptime, availableDuringActiveRentals: !gpsRequired || (!activeForVehicle || uptime > 0) };
}

function completeness(parts) {
  const values = Object.values(parts).map((v) => !!v);
  return pct(values.filter(Boolean).length, values.length);
}

async function writeSnapshot(base44, snapshot) {
  await base44.asServiceRole.entities.ReputationSignalSnapshot.create(snapshot);
  await base44.asServiceRole.entities.ReputationEventLog.create({
    event_type: 'signal_collected',
    entity_type: snapshot.entity_type,
    entity_id: snapshot.entity_id,
    host_id: snapshot.host_id,
    vehicle_id: snapshot.vehicle_id,
    source_entity: 'ReputationSignalSnapshot',
    score_impact: 0,
    subscores_affected: ['reviews', 'maintenance', 'inspection', 'communication', 'gps', 'compliance', 'repeat_renter'],
    reason: 'Internal Phase 3 reputation signal snapshot collected. No public scoring or workflow mutation performed.',
    processed_by: 'reputation_signal_collector',
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const today = new Date().toISOString().slice(0, 10);
    const [hosts, vehicles, bookings, reviews, maintenance, compliance, gpsEvents, disputes, threads] = await Promise.all([
      base44.asServiceRole.entities.Host.list('-created_date', 500),
      base44.asServiceRole.entities.Vehicle.list('-created_date', 500),
      base44.asServiceRole.entities.BookingRequest.list('-created_date', 1000),
      base44.asServiceRole.entities.HostReview.list('-created_date', 1000),
      base44.asServiceRole.entities.HostMaintenanceLog.list('-created_date', 1000),
      base44.asServiceRole.entities.HostVehicleCompliance.list('-created_date', 1000),
      base44.asServiceRole.entities.GPSEvent.list('-created_date', 1000),
      base44.asServiceRole.entities.Dispute.list('-created_date', 500),
      base44.asServiceRole.entities.CommunicationThread.list('-created_date', 1000),
    ]);

    const activeBookings = bookings.filter((b) => ['active', 'confirmed', 'approved'].includes(b.booking_status));
    const hostSnapshots = [];
    const vehicleSnapshots = [];

    for (const host of hosts) {
      const hostVehicles = vehicles.filter((v) => v.host_id === host.id);
      const vehicleIds = new Set(hostVehicles.map((v) => v.id));
      const hostBookings = bookings.filter((b) => b.host_id === host.id || vehicleIds.has(b.vehicle_id));
      const completed = hostBookings.filter((b) => b.booking_status === 'completed');
      const hostReviews = reviews.filter((r) => r.host_id === host.id);
      const verifiedReviews = hostReviews.filter((r) => r.verified_booking && r.booking_request_id);
      const hostMaintenance = maintenance.filter((m) => m.host_id === host.id || vehicleIds.has(m.vehicle_id));
      const verifiedMaintenance = hostMaintenance.filter((m) => m.receipt_verification_status === 'verified' || !!m.receipt_url);
      const hostCompliance = compliance.filter((c) => c.host_id === host.id || vehicleIds.has(c.vehicle_id));
      const hostThreads = threads.filter((t) => t.host_id === host.id);
      const repeat = repeatStats(hostBookings);
      const inspections = inspectionStats(hostBookings);
      const activeRentalComplianceGaps = hostCompliance.filter((c) => ['expired', 'expiring_soon'].includes(c.status) && activeBookings.some((b) => b.vehicle_id === c.vehicle_id)).length;
      const firstResponses = hostThreads.map((t) => t.first_response_minutes).filter((v) => Number.isFinite(v));
      const unreadAging = hostThreads.filter((t) => (t.unread_age_hours || 0) >= 24).length;
      const wouldRentAgain = verifiedReviews.length ? pct(verifiedReviews.filter((r) => r.would_rent_again).length, verifiedReviews.length) : 0;
      const parts = {
        completedBookings: completed.length >= 3,
        reviews: verifiedReviews.length >= 3,
        maintenance: verifiedMaintenance.length >= Math.min(2, hostVehicles.length || 1),
        inspections: inspections.pickupRate >= 70 && inspections.dropoffRate >= 70,
        compliance: hostCompliance.length > 0 && activeRentalComplianceGaps === 0,
        communication: hostThreads.length > 0,
        repeatRenters: repeat.repeatRenters > 0,
      };
      const score = completeness(parts);
      const missing = Object.entries(parts).filter(([, ok]) => !ok).map(([key]) => key);
      const snapshot = {
        entity_type: 'host', entity_id: host.id, host_id: host.id, signal_date: today,
        completed_bookings_count: completed.length,
        review_count: hostReviews.length,
        verified_review_count: verifiedReviews.length,
        would_rent_again_rate: wouldRentAgain,
        repeat_renter_count: repeat.repeatRenters,
        repeat_booking_count: repeat.repeatBookings,
        maintenance_logs_count: hostMaintenance.length,
        verified_maintenance_count: verifiedMaintenance.length,
        service_cadence_status: hostMaintenance.some((m) => m.service_cadence_status === 'overdue') ? 'overdue' : hostMaintenance.some((m) => m.service_cadence_status === 'due_soon') ? 'due_soon' : hostMaintenance.length ? 'on_track' : 'unknown',
        compliance_docs_count: hostCompliance.length,
        expired_compliance_count: hostCompliance.filter((c) => c.status === 'expired').length,
        expiring_compliance_count: hostCompliance.filter((c) => c.status === 'expiring_soon').length,
        active_rental_compliance_gap_count: activeRentalComplianceGaps,
        pickup_inspection_completion_rate: inspections.pickupRate,
        dropoff_inspection_completion_rate: inspections.dropoffRate,
        required_photo_coverage_rate: inspections.coverageRate,
        inspection_timestamp_rate: inspections.timestampRate,
        inspection_gps_rate: inspections.gpsRate,
        communication_threads_count: hostThreads.length,
        first_response_avg_minutes: avg(firstResponses),
        sla_breach_count: hostThreads.filter((t) => t.sla_breached).length,
        unread_aging_count: unreadAging,
        signal_completeness_score: score,
        confidence_level: confidence(score),
        missing_signals: missing,
        threshold_results: parts,
        public_badge_threshold_met: score >= 75 && completed.length >= 5 && verifiedReviews.length >= 3 && inspections.pickupRate >= 70,
        notes: 'Internal-only signal collection. Not public and not used for ranking or suppression.',
      };
      await writeSnapshot(base44, snapshot);
      hostSnapshots.push(snapshot);
    }

    for (const vehicle of vehicles.filter((v) => v.host_id)) {
      const vehicleBookings = bookings.filter((b) => b.vehicle_id === vehicle.id);
      const completed = vehicleBookings.filter((b) => b.booking_status === 'completed');
      const vehicleReviews = reviews.filter((r) => r.vehicle_id === vehicle.id);
      const verifiedReviews = vehicleReviews.filter((r) => r.verified_booking && r.booking_request_id);
      const vehicleMaintenance = maintenance.filter((m) => m.vehicle_id === vehicle.id);
      const verifiedMaintenance = vehicleMaintenance.filter((m) => m.receipt_verification_status === 'verified' || !!m.receipt_url);
      const vehicleCompliance = compliance.filter((c) => c.vehicle_id === vehicle.id);
      const vehicleThreads = threads.filter((t) => t.vehicle_id === vehicle.id);
      const repeat = repeatStats(vehicleBookings);
      const inspections = inspectionStats(vehicleBookings);
      const gps = gpsStats(vehicle, gpsEvents, activeBookings);
      const activeRentalComplianceGaps = vehicleCompliance.filter((c) => ['expired', 'expiring_soon'].includes(c.status) && activeBookings.some((b) => b.vehicle_id === c.vehicle_id)).length;
      const parts = {
        completedBookings: completed.length >= 2,
        reviews: verifiedReviews.length >= 2,
        maintenance: verifiedMaintenance.length >= 1 || !!vehicle.last_service_date,
        inspections: inspections.pickupRate >= 70 && inspections.dropoffRate >= 70,
        compliance: vehicleCompliance.length > 0 && activeRentalComplianceGaps === 0,
        gps: !gps.gpsRequired || gps.uptime >= 75,
        repeatRenters: repeat.repeatRenters > 0,
      };
      const score = completeness(parts);
      const missing = Object.entries(parts).filter(([, ok]) => !ok).map(([key]) => key);
      const snapshot = {
        entity_type: 'vehicle', entity_id: vehicle.id, host_id: vehicle.host_id, vehicle_id: vehicle.id, signal_date: today,
        completed_bookings_count: completed.length,
        review_count: vehicleReviews.length,
        verified_review_count: verifiedReviews.length,
        would_rent_again_rate: verifiedReviews.length ? pct(verifiedReviews.filter((r) => r.would_rent_again).length, verifiedReviews.length) : 0,
        repeat_renter_count: repeat.repeatRenters,
        repeat_booking_count: repeat.repeatBookings,
        maintenance_logs_count: vehicleMaintenance.length,
        verified_maintenance_count: verifiedMaintenance.length,
        service_cadence_status: vehicleMaintenance.some((m) => m.service_cadence_status === 'overdue') ? 'overdue' : vehicleMaintenance.some((m) => m.service_cadence_status === 'due_soon') ? 'due_soon' : vehicleMaintenance.length || vehicle.last_service_date ? 'on_track' : 'unknown',
        compliance_docs_count: vehicleCompliance.length,
        expired_compliance_count: vehicleCompliance.filter((c) => c.status === 'expired').length,
        expiring_compliance_count: vehicleCompliance.filter((c) => c.status === 'expiring_soon').length,
        active_rental_compliance_gap_count: activeRentalComplianceGaps,
        pickup_inspection_completion_rate: inspections.pickupRate,
        dropoff_inspection_completion_rate: inspections.dropoffRate,
        required_photo_coverage_rate: inspections.coverageRate,
        inspection_timestamp_rate: inspections.timestampRate,
        inspection_gps_rate: inspections.gpsRate,
        communication_threads_count: vehicleThreads.length,
        first_response_avg_minutes: avg(vehicleThreads.map((t) => t.first_response_minutes)),
        sla_breach_count: vehicleThreads.filter((t) => t.sla_breached).length,
        unread_aging_count: vehicleThreads.filter((t) => (t.unread_age_hours || 0) >= 24).length,
        gps_required: gps.gpsRequired,
        gps_event_count: gps.eventCount,
        gps_uptime_pct: gps.uptime,
        gps_available_during_active_rentals: gps.availableDuringActiveRentals,
        signal_completeness_score: score,
        confidence_level: confidence(score),
        missing_signals: missing,
        threshold_results: parts,
        public_badge_threshold_met: score >= 75 && completed.length >= 3 && verifiedReviews.length >= 2 && inspections.pickupRate >= 70,
        notes: 'Internal-only signal collection. Not public and not used for ranking or suppression.',
      };
      await writeSnapshot(base44, snapshot);
      vehicleSnapshots.push(snapshot);
    }

    return Response.json({
      ok: true,
      mode: 'phase_3_signal_collection_only',
      safety: { public_scores: false, public_badges: false, ranking_changes: false, suppression: false, payment_changes: false },
      host_snapshots: hostSnapshots.length,
      vehicle_snapshots: vehicleSnapshots.length,
      confidence_distribution: {
        host_high: hostSnapshots.filter((s) => s.confidence_level === 'high').length,
        host_moderate: hostSnapshots.filter((s) => s.confidence_level === 'moderate').length,
        host_low: hostSnapshots.filter((s) => s.confidence_level === 'low').length,
        vehicle_high: vehicleSnapshots.filter((s) => s.confidence_level === 'high').length,
        vehicle_moderate: vehicleSnapshots.filter((s) => s.confidence_level === 'moderate').length,
        vehicle_low: vehicleSnapshots.filter((s) => s.confidence_level === 'low').length,
      },
      public_badge_ready: {
        hosts: hostSnapshots.filter((s) => s.public_badge_threshold_met).length,
        vehicles: vehicleSnapshots.filter((s) => s.public_badge_threshold_met).length,
      }
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});