import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function confidence(score, activityCount) {
  if (activityCount < 2 || score < 25) return 'insufficient_evidence';
  if (score >= 75 && activityCount >= 10) return 'high';
  if (score >= 45 && activityCount >= 5) return 'moderate';
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

function daysSince(dateString) {
  if (!dateString) return null;
  const time = new Date(dateString).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 86400000));
}

function repeatStats(bookings) {
  const renterCounts = {};
  for (const b of bookings.filter((x) => x.user_email)) renterCounts[b.user_email] = (renterCounts[b.user_email] || 0) + 1;
  const repeatRenters = Object.values(renterCounts).filter((count) => count > 1).length;
  const repeatBookings = bookings.filter((b) => renterCounts[b.user_email] > 1).length;
  return { repeatRenters, repeatBookings, retentionPct: pct(repeatBookings, bookings.filter((b) => b.user_email).length) };
}

function inspectionStats(bookings) {
  const completed = bookings.filter((b) => b.booking_status === 'completed');
  const pickupDone = completed.filter((b) => (b.pickup_photos || []).length > 0).length;
  const dropoffDone = completed.filter((b) => (b.return_exterior_photos || []).length > 0 || (b.return_interior_photos || []).length > 0).length;
  const timestamps = completed.filter((b) => b.pickup_submitted_at || b.dropoff_submitted_at).length;
  const gps = completed.filter((b) => b.pickup_location_lat || b.dropoff_location_lat).length;
  const missing = completed.filter((b) => !(b.pickup_photos || []).length || (!((b.return_exterior_photos || []).length) && !((b.return_interior_photos || []).length))).length;
  const coverage = completed.map((b) => Math.min(1, ((b.pickup_photos || []).length + (b.return_exterior_photos || []).length + (b.return_interior_photos || []).length) / 6));
  const pickupRate = pct(pickupDone, completed.length);
  const dropoffRate = pct(dropoffDone, completed.length);
  const timestampRate = pct(timestamps, completed.length);
  const gpsRate = pct(gps, completed.length);
  const coverageRate = coverage.length ? avg(coverage.map((v) => v * 100)) : 0;
  return { pickupRate, dropoffRate, timestampRate, gpsRate, coverageRate, missing, completenessPct: Math.round((pickupRate + dropoffRate + timestampRate + coverageRate) / 4) };
}

function gpsStats(vehicle, gpsEvents, activeBookings) {
  const gpsRequired = !!vehicle.moovetrax_device_id && vehicle.telematics_provider !== 'none';
  if (!gpsRequired) return { gpsRequired: false, eventCount: 0, uptime: 0, availableDuringActiveRentals: true, stale: false };
  const events = gpsEvents.filter((e) => e.device_id === vehicle.moovetrax_device_id || e.vehicle_id === vehicle.id);
  const online = events.filter((e) => e.event_type === 'device_online' || e.event_type === 'location_ping').length;
  const offline = events.filter((e) => e.event_type === 'device_offline').length;
  const uptime = events.length ? pct(online, online + offline || events.length) : 0;
  const latest = events.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
  const stale = !!latest && daysSince(latest.created_date) > 3;
  const activeForVehicle = activeBookings.some((b) => b.vehicle_id === vehicle.id);
  return { gpsRequired, eventCount: events.length, uptime, availableDuringActiveRentals: !activeForVehicle || uptime > 0, stale };
}

function completeness(parts) {
  const values = Object.values(parts).map((v) => !!v);
  return pct(values.filter(Boolean).length, values.length);
}

function evidenceCoverage(parts) {
  return completeness(parts);
}

function confidenceAdjustedScore(score, level) {
  const caps = { insufficient_evidence: 25, low: 50, moderate: 75, high: 100 };
  return Math.min(score, caps[level] || 25);
}

async function writeSnapshot(base44, snapshot) {
  await base44.asServiceRole.entities.ReputationSignalSnapshot.create(snapshot);
  await base44.asServiceRole.entities.ReputationEventLog.create({
    event_type: 'signal_collected', entity_type: snapshot.entity_type, entity_id: snapshot.entity_id,
    host_id: snapshot.host_id, vehicle_id: snapshot.vehicle_id, source_entity: 'ReputationSignalSnapshot',
    score_impact: 0,
    subscores_affected: ['reviews', 'maintenance', 'inspection', 'communication', 'gps', 'compliance', 'repeat_renter'],
    reason: 'Internal Phase 3 reputation signal snapshot collected. No public scoring, ranking, suppression, booking, payment, payout, or Stripe mutation performed.',
    processed_by: 'reputation_signal_collector',
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const today = new Date().toISOString().slice(0, 10);
    const [hosts, vehicles, bookings, reviews, maintenance, compliance, gpsEvents, threads, evidencePackets, disputes] = await Promise.all([
      base44.asServiceRole.entities.Host.list('-created_date', 500),
      base44.asServiceRole.entities.Vehicle.list('-created_date', 500),
      base44.asServiceRole.entities.BookingRequest.list('-created_date', 1000),
      base44.asServiceRole.entities.HostReview.list('-created_date', 1000),
      base44.asServiceRole.entities.HostMaintenanceLog.list('-created_date', 1000),
      base44.asServiceRole.entities.HostVehicleCompliance.list('-created_date', 1000),
      base44.asServiceRole.entities.GPSEvent.list('-created_date', 1000),
      base44.asServiceRole.entities.CommunicationThread.list('-created_date', 1000),
      base44.asServiceRole.entities.InspectionEvidencePacket.list('-created_date', 1000),
      base44.asServiceRole.entities.Dispute.list('-created_date', 1000),
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
      const verifiedReviews = hostReviews.filter((r) => r.verified_booking && r.booking_request_id && r.review_submitted_at);
      const hostMaintenance = maintenance.filter((m) => m.host_id === host.id || vehicleIds.has(m.vehicle_id));
      const verifiedMaintenance = hostMaintenance.filter((m) => m.receipt_verification_status === 'verified' && !!m.receipt_url);
      const selfReportedMaintenance = hostMaintenance.filter((m) => m.receipt_verification_status !== 'verified' || !m.receipt_url);
      const hostCompliance = compliance.filter((c) => c.host_id === host.id || vehicleIds.has(c.vehicle_id));
      const hostThreads = threads.filter((t) => t.host_id === host.id);
      const repeat = repeatStats(hostBookings);
      const inspections = inspectionStats(hostBookings);
      const hostEvidence = evidencePackets.filter((p) => p.host_id === host.id || vehicleIds.has(p.vehicle_id));
      const pickupPackets = hostEvidence.filter((p) => p.inspection_type === 'pickup');
      const problematicPickupCount = pickupPackets.filter((p) => p.issue_grade === 'problematic').length;
      const gpsConflictCount = hostEvidence.filter((p) => p.gps_tolerance_status === 'outside_5_miles').length;
      const hostFaultDisputes = disputes.filter((d) => d.host_id === host.id && d.status === 'resolved_customer_favor').length;
      const activeRentalComplianceGaps = hostCompliance.filter((c) => ['expired', 'expiring_soon'].includes(c.status) && activeBookings.some((b) => b.vehicle_id === c.vehicle_id)).length;
      const firstResponses = hostThreads.map((t) => t.first_response_minutes).filter((v) => Number.isFinite(v));
      const wouldRentAgain = verifiedReviews.length ? pct(verifiedReviews.filter((r) => r.would_rent_again).length, verifiedReviews.length) : 0;
      const recencies = hostCompliance.map((c) => daysSince(c.verified_at)).filter((v) => v !== null);
      const thresholdResults = {
        minimum_completed_bookings: completed.length >= 5,
        minimum_review_count: verifiedReviews.length >= 3,
        minimum_inspection_history: inspections.completenessPct >= 70,
        minimum_operational_activity: hostBookings.length + hostMaintenance.length + hostThreads.length >= 10,
        maintenance_evidence: verifiedMaintenance.length >= Math.min(2, hostVehicles.length || 1),
        compliance_consistency: hostCompliance.length > 0 && activeRentalComplianceGaps === 0,
        repeat_renter_signal: repeat.repeatRenters > 0,
      };
      const score = completeness(thresholdResults);
      const level = confidence(score, hostBookings.length + verifiedReviews.length + verifiedMaintenance.length + hostThreads.length);
      const coverage = evidenceCoverage({ reviews: verifiedReviews.length > 0, maintenance: verifiedMaintenance.length > 0, inspections: inspections.completenessPct > 0, communication: hostThreads.length > 0, compliance: hostCompliance.length > 0, repeat: repeat.repeatRenters > 0 });
      const snapshot = {
        entity_type: 'host', entity_id: host.id, host_id: host.id, signal_date: today,
        completed_bookings_count: completed.length, review_count: hostReviews.length, verified_review_count: verifiedReviews.length,
        would_rent_again_rate: wouldRentAgain, repeat_renter_count: repeat.repeatRenters, repeat_booking_count: repeat.repeatBookings, repeat_renter_retention_pct: repeat.retentionPct,
        maintenance_logs_count: hostMaintenance.length, verified_maintenance_count: verifiedMaintenance.length, self_reported_maintenance_count: selfReportedMaintenance.length,
        service_cadence_status: hostMaintenance.some((m) => m.service_cadence_status === 'overdue') ? 'overdue' : hostMaintenance.some((m) => m.service_cadence_status === 'due_soon') ? 'due_soon' : hostMaintenance.length ? 'on_track' : 'unknown',
        compliance_docs_count: hostCompliance.length, expired_compliance_count: hostCompliance.filter((c) => c.status === 'expired').length, expiring_compliance_count: hostCompliance.filter((c) => c.status === 'expiring_soon').length,
        active_rental_compliance_gap_count: activeRentalComplianceGaps, compliance_streak_days: avg(hostCompliance.map((c) => c.compliance_streak_days)), admin_verification_recency_days: avg(recencies),
        pickup_inspection_completion_rate: inspections.pickupRate, dropoff_inspection_completion_rate: inspections.dropoffRate, required_photo_coverage_rate: inspections.coverageRate, inspection_completeness_pct: inspections.completenessPct,
        inspection_timestamp_rate: inspections.timestampRate, inspection_gps_rate: inspections.gpsRate, missing_inspection_count: inspections.missing,
        communication_threads_count: hostThreads.length, first_response_avg_minutes: avg(firstResponses), sla_breach_count: hostThreads.filter((t) => t.sla_breached).length,
        unread_aging_count: hostThreads.filter((t) => (t.unread_age_hours || 0) >= 24).length, response_consistency_avg: avg(hostThreads.map((t) => t.response_consistency_score)), escalation_count: hostThreads.filter((t) => t.escalation_flag).length,
        signal_completeness_score: score, evidence_coverage_pct: coverage, confidence_level: level, confidence_adjusted_score: confidenceAdjustedScore(score, level),
        missing_signals: Object.entries(thresholdResults).filter(([, ok]) => !ok).map(([key]) => key), threshold_results: { ...thresholdResults, pickup_problematic_count: problematicPickupCount, gps_conflict_count: gpsConflictCount, host_fault_dispute_count: hostFaultDisputes },
        public_badge_threshold_met: level === 'high' && score >= 75 && problematicPickupCount === 0 && hostFaultDisputes === 0, stale_signal_flag: false,
        notes: 'Internal-only Phase 3 signal collection. Pickup evidence informs host/vehicle readiness only after repeated or confirmed issues. Dropoff evidence is private renter/return accountability and does not directly penalize host trust.',
      };
      await writeSnapshot(base44, snapshot);
      hostSnapshots.push(snapshot);
    }

    for (const vehicle of vehicles.filter((v) => v.host_id)) {
      const vehicleBookings = bookings.filter((b) => b.vehicle_id === vehicle.id);
      const completed = vehicleBookings.filter((b) => b.booking_status === 'completed');
      const vehicleReviews = reviews.filter((r) => r.vehicle_id === vehicle.id);
      const verifiedReviews = vehicleReviews.filter((r) => r.verified_booking && r.booking_request_id && r.review_submitted_at);
      const vehicleMaintenance = maintenance.filter((m) => m.vehicle_id === vehicle.id);
      const verifiedMaintenance = vehicleMaintenance.filter((m) => m.receipt_verification_status === 'verified' && !!m.receipt_url);
      const selfReportedMaintenance = vehicleMaintenance.filter((m) => m.receipt_verification_status !== 'verified' || !m.receipt_url);
      const vehicleCompliance = compliance.filter((c) => c.vehicle_id === vehicle.id);
      const vehicleThreads = threads.filter((t) => t.vehicle_id === vehicle.id);
      const repeat = repeatStats(vehicleBookings);
      const inspections = inspectionStats(vehicleBookings);
      const vehicleEvidence = evidencePackets.filter((p) => p.vehicle_id === vehicle.id);
      const pickupPackets = vehicleEvidence.filter((p) => p.inspection_type === 'pickup');
      const problematicPickupCount = pickupPackets.filter((p) => p.issue_grade === 'problematic').length;
      const dropoffPackets = vehicleEvidence.filter((p) => p.inspection_type === 'dropoff');
      const renterFaultDisputes = disputes.filter((d) => d.vehicle_id === vehicle.id && d.status === 'resolved_host_favor').length;
      const gpsConflictCount = vehicleEvidence.filter((p) => p.gps_tolerance_status === 'outside_5_miles').length;
      const gps = gpsStats(vehicle, gpsEvents, activeBookings);
      const activeRentalComplianceGaps = vehicleCompliance.filter((c) => ['expired', 'expiring_soon'].includes(c.status) && activeBookings.some((b) => b.vehicle_id === c.vehicle_id)).length;
      const recencies = vehicleCompliance.map((c) => daysSince(c.verified_at)).filter((v) => v !== null);
      const thresholdResults = {
        minimum_completed_bookings: completed.length >= 3,
        minimum_review_count: verifiedReviews.length >= 2,
        minimum_inspection_history: inspections.completenessPct >= 70,
        minimum_operational_activity: vehicleBookings.length + vehicleMaintenance.length + vehicleThreads.length >= 5,
        maintenance_evidence: verifiedMaintenance.length >= 1,
        compliance_consistency: vehicleCompliance.length > 0 && activeRentalComplianceGaps === 0,
        gps_reliability: !gps.gpsRequired || (gps.uptime >= 75 && !gps.stale),
      };
      const score = completeness(thresholdResults);
      const level = confidence(score, vehicleBookings.length + verifiedReviews.length + verifiedMaintenance.length + vehicleThreads.length + (gps.gpsRequired ? gps.eventCount : 0));
      const coverage = evidenceCoverage({ reviews: verifiedReviews.length > 0, maintenance: verifiedMaintenance.length > 0, inspections: inspections.completenessPct > 0, communication: vehicleThreads.length > 0, compliance: vehicleCompliance.length > 0, gps: !gps.gpsRequired || gps.eventCount > 0 });
      const snapshot = {
        entity_type: 'vehicle', entity_id: vehicle.id, host_id: vehicle.host_id, vehicle_id: vehicle.id, signal_date: today,
        completed_bookings_count: completed.length, review_count: vehicleReviews.length, verified_review_count: verifiedReviews.length,
        would_rent_again_rate: verifiedReviews.length ? pct(verifiedReviews.filter((r) => r.would_rent_again).length, verifiedReviews.length) : 0,
        repeat_renter_count: repeat.repeatRenters, repeat_booking_count: repeat.repeatBookings, repeat_renter_retention_pct: repeat.retentionPct,
        maintenance_logs_count: vehicleMaintenance.length, verified_maintenance_count: verifiedMaintenance.length, self_reported_maintenance_count: selfReportedMaintenance.length,
        service_cadence_status: vehicleMaintenance.some((m) => m.service_cadence_status === 'overdue') ? 'overdue' : vehicleMaintenance.some((m) => m.service_cadence_status === 'due_soon') ? 'due_soon' : vehicleMaintenance.length ? 'on_track' : 'unknown',
        compliance_docs_count: vehicleCompliance.length, expired_compliance_count: vehicleCompliance.filter((c) => c.status === 'expired').length, expiring_compliance_count: vehicleCompliance.filter((c) => c.status === 'expiring_soon').length,
        active_rental_compliance_gap_count: activeRentalComplianceGaps, compliance_streak_days: avg(vehicleCompliance.map((c) => c.compliance_streak_days)), admin_verification_recency_days: avg(recencies),
        pickup_inspection_completion_rate: inspections.pickupRate, dropoff_inspection_completion_rate: inspections.dropoffRate, required_photo_coverage_rate: inspections.coverageRate, inspection_completeness_pct: inspections.completenessPct,
        inspection_timestamp_rate: inspections.timestampRate, inspection_gps_rate: inspections.gpsRate, missing_inspection_count: inspections.missing,
        communication_threads_count: vehicleThreads.length, first_response_avg_minutes: avg(vehicleThreads.map((t) => t.first_response_minutes)), sla_breach_count: vehicleThreads.filter((t) => t.sla_breached).length,
        unread_aging_count: vehicleThreads.filter((t) => (t.unread_age_hours || 0) >= 24).length, response_consistency_avg: avg(vehicleThreads.map((t) => t.response_consistency_score)), escalation_count: vehicleThreads.filter((t) => t.escalation_flag).length,
        gps_required: gps.gpsRequired, gps_event_count: gps.eventCount, gps_uptime_pct: gps.uptime, gps_available_during_active_rentals: gps.availableDuringActiveRentals, stale_gps_device_flag: gps.stale,
        signal_completeness_score: score, evidence_coverage_pct: coverage, confidence_level: level, confidence_adjusted_score: confidenceAdjustedScore(score, level),
        missing_signals: Object.entries(thresholdResults).filter(([, ok]) => !ok).map(([key]) => key), threshold_results: { ...thresholdResults, pickup_problematic_count: problematicPickupCount, dropoff_packet_count: dropoffPackets.length, renter_fault_dispute_count: renterFaultDisputes, gps_conflict_count: gpsConflictCount },
        public_badge_threshold_met: level === 'high' && score >= 75 && problematicPickupCount === 0, stale_signal_flag: gps.stale,
        notes: 'Internal-only Phase 3 signal collection. Vehicle quality uses pickup readiness, maintenance, compliance, GPS when required, and confirmed vehicle issues. Renter-caused dropoff damage is not counted as vehicle quality unless admin resolves it as vehicle_issue.',
      };
      await writeSnapshot(base44, snapshot);
      vehicleSnapshots.push(snapshot);
    }

    return Response.json({
      ok: true, mode: 'phase_3_signal_collection_only',
      safety: { public_scores: false, public_badges: false, ranking_changes: false, suppression: false, payment_changes: false },
      host_snapshots: hostSnapshots.length, vehicle_snapshots: vehicleSnapshots.length,
      confidence_distribution: {
        host_high: hostSnapshots.filter((s) => s.confidence_level === 'high').length,
        host_moderate: hostSnapshots.filter((s) => s.confidence_level === 'moderate').length,
        host_low: hostSnapshots.filter((s) => s.confidence_level === 'low').length,
        host_insufficient: hostSnapshots.filter((s) => s.confidence_level === 'insufficient_evidence').length,
        vehicle_high: vehicleSnapshots.filter((s) => s.confidence_level === 'high').length,
        vehicle_moderate: vehicleSnapshots.filter((s) => s.confidence_level === 'moderate').length,
        vehicle_low: vehicleSnapshots.filter((s) => s.confidence_level === 'low').length,
        vehicle_insufficient: vehicleSnapshots.filter((s) => s.confidence_level === 'insufficient_evidence').length,
      },
      evidence_coverage_distribution: {
        host_average: avg(hostSnapshots.map((s) => s.evidence_coverage_pct)),
        vehicle_average: avg(vehicleSnapshots.map((s) => s.evidence_coverage_pct)),
      },
      stale_or_low_confidence_counts: {
        stale: [...hostSnapshots, ...vehicleSnapshots].filter((s) => s.stale_signal_flag).length,
        low_or_insufficient: [...hostSnapshots, ...vehicleSnapshots].filter((s) => ['low', 'insufficient_evidence'].includes(s.confidence_level)).length,
      },
      public_badge_ready: { hosts: hostSnapshots.filter((s) => s.public_badge_threshold_met).length, vehicles: vehicleSnapshots.filter((s) => s.public_badge_threshold_met).length },
      phase_4_recommendation: 'Not ready for public numeric scores. Consider limited public badges only after high-confidence evidence coverage improves and admin validates badge false positives.'
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});