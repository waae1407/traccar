import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_SCORE = 70;
const NEW_SIGNAL_SCORE = 50;

function clamp(value, fallback = DEFAULT_SCORE) {
  const numeric = Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function riskLevel(score) {
  if (score < 50) return 'critical';
  if (score < 60) return 'high';
  if (score < 70) return 'medium';
  return 'low';
}

function confidence(points) {
  if (points >= 20) return 'high';
  if (points >= 6) return 'moderate';
  return 'low';
}

function avg(values, fallback = 0) {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!clean.length) return fallback;
  return Number((clean.reduce((s, v) => s + v, 0) / clean.length).toFixed(2));
}

function calcBookingReliability(bookings) {
  const completed = bookings.filter((b) => b.booking_status === 'completed').length;
  const cancelled = bookings.filter((b) => b.booking_status === 'cancelled').length;
  const rejected = bookings.filter((b) => b.booking_status === 'rejected').length;
  const activeGood = bookings.filter((b) => ['active', 'confirmed', 'approved'].includes(b.booking_status)).length;
  const total = completed + cancelled + rejected + activeGood;
  if (!total) return DEFAULT_SCORE;
  return clamp(((completed + activeGood) / total) * 100);
}

function calcRepeatRenter(bookings) {
  const completedOrActive = bookings.filter((b) => ['completed', 'active', 'confirmed', 'approved'].includes(b.booking_status) && b.user_email);
  if (completedOrActive.length < 2) return NEW_SIGNAL_SCORE;
  const counts = {};
  for (const booking of completedOrActive) counts[booking.user_email] = (counts[booking.user_email] || 0) + 1;
  const repeatBookings = completedOrActive.filter((b) => counts[b.user_email] > 1).length;
  return clamp((repeatBookings / completedOrActive.length) * 100, NEW_SIGNAL_SCORE);
}

function calcCompliance(docs) {
  if (!docs.length) return DEFAULT_SCORE;
  const bad = docs.filter((d) => ['expired', 'expiring_soon'].includes(d.status)).length;
  const pending = docs.filter((d) => d.status === 'pending_review').length;
  return clamp(100 - bad * 18 - pending * 6);
}

function calcDisputeRisk(disputes) {
  if (!disputes.length) return DEFAULT_SCORE;
  let penalty = 0;
  for (const dispute of disputes) {
    const severe = ['damage', 'chargeback', 'gps_tampering', 'unauthorized_driver'].includes(dispute.dispute_type);
    const unresolved = ['open', 'under_review', 'evidence_requested', 'payout_held', 'chargeback'].includes(dispute.status);
    const customerFavor = dispute.status === 'resolved_customer_favor';
    penalty += severe ? 14 : 8;
    if (unresolved) penalty += 8;
    if (customerFavor) penalty += 10;
    if (dispute.status === 'resolved_host_favor' || dispute.status === 'closed_no_action') penalty -= 6;
  }
  return clamp(100 - penalty);
}

function calcCleanliness(bookings, reviews, disputes) {
  const cleanReviews = avg(reviews.map((r) => r.cleanliness_rating), 0);
  const cleanSubmitted = bookings.filter((b) => b.clean_return_status === 'photos_submitted' || b.clean_return_status === 'approved_clean').length;
  const cleanIssues = disputes.filter((d) => ['cleaning', 'smoking'].includes(d.dispute_type)).length;
  const inspectionBase = bookings.length ? clamp((cleanSubmitted / bookings.length) * 100, DEFAULT_SCORE) : DEFAULT_SCORE;
  const reviewBase = cleanReviews ? cleanReviews * 20 : DEFAULT_SCORE;
  return clamp(reviewBase * 0.45 + inspectionBase * 0.35 + (100 - cleanIssues * 15) * 0.2);
}

function calcCommunication(bookings, reviews, threads) {
  const communicationReview = avg(reviews.map((r) => r.communication_rating), 0);
  const slaBreaches = threads.filter((t) => t.sla_breached).length;
  const reviewBase = communicationReview ? communicationReview * 20 : DEFAULT_SCORE;
  return clamp(reviewBase - slaBreaches * 10);
}

function calcMaintenance(vehicle, maintenanceLogs) {
  const logs = maintenanceLogs.filter((m) => m.vehicle_id === vehicle.id);
  const hasRecentService = !!vehicle.last_service_date || logs.length > 0;
  const highMileage = (vehicle.mileage || 0) >= 150000;
  let score = hasRecentService ? 78 : 60;
  if (logs.length >= 2) score += 8;
  if (highMileage && hasRecentService) score += 4;
  if (highMileage && !hasRecentService) score -= 12;
  if (['Maintenance', 'Out of Service'].includes(vehicle.status)) score -= 12;
  return clamp(score);
}

function calcGps(vehicle, gpsEvents) {
  if (!vehicle.moovetrax_device_id) return DEFAULT_SCORE;
  const events = gpsEvents.filter((e) => e.device_id === vehicle.moovetrax_device_id);
  if (!events.length) return 55;
  const offline = events.filter((e) => e.event_type === 'device_offline').length;
  return clamp(90 - offline * 12);
}

function hostBadges(host, summary, completedCount) {
  const badges = [];
  const explanations = [];
  if (host.status === 'approved' && host.verification_status === 'verified') {
    badges.push('verified_host'); explanations.push('Verified Host: host is approved and verification is complete.');
  }
  if (summary.host_trust_score >= 90 && completedCount >= 5) {
    badges.push('top_host'); explanations.push('Top Host eligible: high host trust and completed booking history.');
  }
  if (summary.repeat_renter_score >= 75) {
    badges.push('repeat_renter_favorite'); explanations.push('Repeat Renter Favorite eligible: repeat renter behavior is strong.');
  }
  if (summary.cleanliness_score >= 85 && summary.fleet_reliability_score >= 80) {
    badges.push('clean_fleet'); explanations.push('Clean Fleet eligible: cleanliness and fleet reliability signals are strong.');
  }
  return { badges, explanations };
}

function vehicleBadges(vehicle, summary) {
  const badges = [];
  const explanations = [];
  if (summary.maintenance_confidence_score >= 80 && vehicle.last_service_date) {
    badges.push('well_maintained'); explanations.push('Well Maintained eligible: maintenance confidence is strong.');
  }
  if (summary.vehicle_quality_score >= 85) {
    badges.push('trusted_vehicle'); explanations.push('Trusted Vehicle eligible: vehicle quality is strong.');
  }
  if (vehicle.moovetrax_device_id && summary.score_breakdown?.gps_reliability_score >= 75) {
    badges.push('gps_connected'); explanations.push('GPS Connected eligible: device exists and reliability is acceptable.');
  }
  return { badges, explanations };
}

async function saveByUnique(entityApi, existing, uniqueKey, data) {
  const found = existing.find((item) => item[uniqueKey] === data[uniqueKey]);
  if (found) return await entityApi.update(found.id, data);
  return await entityApi.create(data);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const [hosts, vehicles, bookings, reviews, disputes, complianceDocs, maintenanceLogs, threads, gpsEvents, existingHostSummaries, existingVehicleSummaries] = await Promise.all([
      base44.asServiceRole.entities.Host.list('-created_date', 500),
      base44.asServiceRole.entities.Vehicle.list('-created_date', 500),
      base44.asServiceRole.entities.BookingRequest.list('-created_date', 1000),
      base44.asServiceRole.entities.HostReview.list('-created_date', 1000),
      base44.asServiceRole.entities.Dispute.list('-created_date', 500),
      base44.asServiceRole.entities.HostVehicleCompliance.list('-created_date', 1000),
      base44.asServiceRole.entities.HostMaintenanceLog.list('-created_date', 1000),
      base44.asServiceRole.entities.CommunicationThread.list('-created_date', 1000),
      base44.asServiceRole.entities.GPSEvent.list('-created_date', 1000),
      base44.asServiceRole.entities.HostReputationSummary.list('-updated_date', 1000),
      base44.asServiceRole.entities.VehicleReputationSummary.list('-updated_date', 1000),
    ]);

    const hostResults = [];
    const vehicleResults = [];
    const edgeCases = [];
    const volatility = [];

    for (const host of hosts) {
      const hostVehicles = vehicles.filter((v) => v.host_id === host.id);
      const vehicleIds = new Set(hostVehicles.map((v) => v.id));
      const hostBookings = bookings.filter((b) => b.host_id === host.id || vehicleIds.has(b.vehicle_id));
      const hostReviews = reviews.filter((r) => r.host_id === host.id);
      const hostDisputes = disputes.filter((d) => d.host_id === host.id || vehicleIds.has(d.vehicle_id));
      const hostDocs = complianceDocs.filter((d) => d.host_id === host.id || vehicleIds.has(d.vehicle_id));
      const hostThreads = threads.filter((t) => t.host_id === host.id);

      const bookingScore = calcBookingReliability(hostBookings);
      const repeatScore = calcRepeatRenter(hostBookings);
      const complianceScore = calcCompliance(hostDocs);
      const disputeScore = calcDisputeRisk(hostDisputes);
      const cleanlinessScore = calcCleanliness(hostBookings, hostReviews, hostDisputes);
      const communicationScore = calcCommunication(hostBookings, hostReviews, hostThreads);
      const maintenanceScores = hostVehicles.map((v) => calcMaintenance(v, maintenanceLogs));
      const maintenanceScore = maintenanceScores.length ? avg(maintenanceScores, DEFAULT_SCORE) : DEFAULT_SCORE;
      const fleetScore = hostVehicles.length ? clamp(avg(hostVehicles.map((v) => ['Available', 'Booked', 'Active Rental'].includes(v.status) ? 85 : 55), DEFAULT_SCORE)) : 50;
      const publicRating = avg(hostReviews.filter((r) => r.verified_booking && ['published', 'approved'].includes(r.status || r.moderation_status)).map((r) => r.overall_rating || r.rating), 0);
      const restrictionPenalty = host.booking_blocked || host.payout_frozen || host.host_under_review || host.status === 'suspended' ? 12 : 0;
      const hostScore = clamp(
        bookingScore * 0.15 +
        (publicRating ? publicRating * 20 : DEFAULT_SCORE) * 0.15 +
        communicationScore * 0.12 +
        complianceScore * 0.12 +
        disputeScore * 0.12 +
        maintenanceScore * 0.10 +
        cleanlinessScore * 0.08 +
        repeatScore * 0.08 +
        fleetScore * 0.08 - restrictionPenalty
      );

      const points = hostBookings.length + hostReviews.length * 2 + hostVehicles.length + hostDisputes.length + hostDocs.length + hostThreads.length;
      const previous = existingHostSummaries.find((s) => s.host_id === host.id);
      const delta = previous?.host_trust_score !== undefined ? hostScore - previous.host_trust_score : 0;
      const volatile = Math.abs(delta) >= 15;
      if (volatile) volatility.push(`${host.full_name || host.email}: host trust changed ${delta > 0 ? '+' : ''}${delta} points.`);

      if (!hostReviews.length) edgeCases.push(`${host.full_name || host.email}: new/no-review host scored using operational defaults.`);
      if (hostDisputes.length && bookingScore >= 75) edgeCases.push(`${host.full_name || host.email}: disputes present but booking operations remain strong.`);
      if (host.status !== 'approved') edgeCases.push(`${host.full_name || host.email}: inactive or non-approved host retained internally without suppression.`);
      if (repeatScore >= 75) edgeCases.push(`${host.full_name || host.email}: repeat renter strength detected.`);
      if (hostDocs.some((d) => ['expired', 'expiring_soon'].includes(d.status))) edgeCases.push(`${host.full_name || host.email}: compliance expiration scenario detected.`);

      const summary = {
        host_id: host.id,
        host_trust_score: hostScore,
        vehicle_quality_score: avg(hostVehicles.map((v) => calcMaintenance(v, maintenanceLogs)), DEFAULT_SCORE),
        fleet_reliability_score: fleetScore,
        cleanliness_score: cleanlinessScore,
        maintenance_confidence_score: maintenanceScore,
        communication_reliability_score: communicationScore,
        booking_reliability_score: bookingScore,
        repeat_renter_score: repeatScore,
        compliance_consistency_score: complianceScore,
        dispute_adjusted_risk_score: disputeScore,
        public_rating: publicRating,
        review_count: hostReviews.length,
        active_badges: [],
        badge_explanations: [],
        coaching_signals: [
          ...(complianceScore < 70 ? ['Resolve compliance issues to improve trust.'] : []),
          ...(disputeScore < 70 ? ['Resolve disputes to reduce reputation risk.'] : []),
          ...(communicationScore < 70 ? ['Improve communication response reliability.'] : []),
          ...(maintenanceScore < 70 ? ['Add maintenance evidence across the fleet.'] : []),
          ...(bookingScore < 70 ? ['Reduce cancellations and incomplete bookings.'] : []),
        ],
        score_breakdown: { bookingScore, repeatScore, complianceScore, disputeScore, cleanlinessScore, communicationScore, maintenanceScore, fleetScore, restrictionPenalty },
        confidence_level: confidence(points),
        data_points_count: points,
        suppression_recommended: hostScore < 50 || host.status === 'suspended' || !!host.booking_blocked,
        suppression_reason: hostScore < 50 ? 'Preview only: host trust below internal risk threshold.' : host.status === 'suspended' ? 'Preview only: host is suspended.' : host.booking_blocked ? 'Preview only: bookings are blocked.' : '',
        admin_risk_level: riskLevel(hostScore),
        score_volatility_flag: volatile,
        score_volatility_reason: volatile ? `Score changed ${delta > 0 ? '+' : ''}${delta} points since previous summary.` : '',
        previous_score: previous?.host_trust_score,
        score_delta: delta,
        last_calculated_at: now.toISOString(),
      };
      const badgeResult = hostBadges(host, summary, hostBookings.filter((b) => b.booking_status === 'completed').length);
      summary.active_badges = badgeResult.badges;
      summary.badge_explanations = badgeResult.explanations;

      await saveByUnique(base44.asServiceRole.entities.HostReputationSummary, existingHostSummaries, 'host_id', summary);
      await base44.asServiceRole.entities.ReputationEventLog.create({ event_type: 'score_calculated', entity_type: 'host', entity_id: host.id, host_id: host.id, score_impact: delta, subscores_affected: Object.keys(summary.score_breakdown), reason: 'Internal Phase 2 reputation simulation calculated host summary.' });
      await base44.asServiceRole.entities.ReputationHistorySnapshot.create({ entity_type: 'host', entity_id: host.id, host_id: host.id, snapshot_date: today, overall_score: hostScore, subscores: summary.score_breakdown, badges: summary.active_badges, risk_level: summary.admin_risk_level, ranking_score: hostScore });
      hostResults.push(summary);
    }

    for (const vehicle of vehicles.filter((v) => v.host_id)) {
      const vehicleBookings = bookings.filter((b) => b.vehicle_id === vehicle.id);
      const vehicleReviews = reviews.filter((r) => r.vehicle_id === vehicle.id);
      const vehicleDisputes = disputes.filter((d) => d.vehicle_id === vehicle.id);
      const vehicleDocs = complianceDocs.filter((d) => d.vehicle_id === vehicle.id);
      const vehicleGps = gpsEvents.filter((e) => e.device_id && e.device_id === vehicle.moovetrax_device_id);

      const bookingScore = calcBookingReliability(vehicleBookings);
      const repeatScore = calcRepeatRenter(vehicleBookings);
      const complianceScore = calcCompliance(vehicleDocs);
      const disputeScore = calcDisputeRisk(vehicleDisputes);
      const cleanlinessScore = calcCleanliness(vehicleBookings, vehicleReviews, vehicleDisputes);
      const maintenanceScore = calcMaintenance(vehicle, maintenanceLogs);
      const gpsScore = calcGps(vehicle, gpsEvents);
      const publicRating = avg(vehicleReviews.filter((r) => r.verified_booking && ['published', 'approved'].includes(r.status || r.moderation_status)).map((r) => r.vehicle_condition_rating || r.overall_rating || r.rating), 0);
      const downtimePenalty = ['Maintenance', 'Out of Service', 'Compliance Hold', 'Suspended'].includes(vehicle.status) ? 10 : 0;
      const qualityScore = clamp(
        maintenanceScore * 0.20 +
        (publicRating ? publicRating * 20 : DEFAULT_SCORE) * 0.15 +
        bookingScore * 0.15 +
        cleanlinessScore * 0.12 +
        complianceScore * 0.10 +
        disputeScore * 0.10 +
        gpsScore * 0.08 +
        repeatScore * 0.05 +
        DEFAULT_SCORE * 0.05 - downtimePenalty
      );

      const points = vehicleBookings.length + vehicleReviews.length * 2 + vehicleDisputes.length + vehicleDocs.length + vehicleGps.length + (vehicle.last_service_date ? 1 : 0);
      const previous = existingVehicleSummaries.find((s) => s.vehicle_id === vehicle.id);
      const delta = previous?.vehicle_quality_score !== undefined ? qualityScore - previous.vehicle_quality_score : 0;
      const volatile = Math.abs(delta) >= 15;
      if (volatile) volatility.push(`${vehicle.year} ${vehicle.make} ${vehicle.model}: vehicle quality changed ${delta > 0 ? '+' : ''}${delta} points.`);
      if ((vehicle.mileage || 0) >= 150000 && maintenanceScore >= 70) edgeCases.push(`${vehicle.year} ${vehicle.make} ${vehicle.model}: high mileage with maintenance confidence support.`);
      if (vehicleDisputes.some((d) => ['open', 'under_review', 'chargeback'].includes(d.status))) edgeCases.push(`${vehicle.year} ${vehicle.make} ${vehicle.model}: unresolved dispute scenario detected.`);
      if (vehicle.moovetrax_device_id && gpsScore < 70) edgeCases.push(`${vehicle.year} ${vehicle.make} ${vehicle.model}: GPS offline/no-event scenario detected.`);

      const summary = {
        vehicle_id: vehicle.id,
        host_id: vehicle.host_id,
        host_trust_score: DEFAULT_SCORE,
        vehicle_quality_score: qualityScore,
        fleet_reliability_score: DEFAULT_SCORE,
        cleanliness_score: cleanlinessScore,
        maintenance_confidence_score: maintenanceScore,
        communication_reliability_score: DEFAULT_SCORE,
        booking_reliability_score: bookingScore,
        repeat_renter_score: repeatScore,
        compliance_consistency_score: complianceScore,
        dispute_adjusted_risk_score: disputeScore,
        public_rating: publicRating,
        review_count: vehicleReviews.length,
        active_badges: [],
        badge_explanations: [],
        coaching_signals: [
          ...(maintenanceScore < 70 ? ['Add or verify maintenance records.'] : []),
          ...(complianceScore < 70 ? ['Resolve vehicle compliance issues.'] : []),
          ...(disputeScore < 70 ? ['Resolve vehicle disputes.'] : []),
          ...(gpsScore < 70 ? ['Validate GPS device status.'] : []),
        ],
        score_breakdown: { bookingScore, repeatScore, complianceScore, disputeScore, cleanlinessScore, maintenanceScore, gps_reliability_score: gpsScore, downtimePenalty },
        confidence_level: confidence(points),
        data_points_count: points,
        suppression_recommended: qualityScore < 50 || ['Out of Service', 'Compliance Hold'].includes(vehicle.status),
        suppression_reason: qualityScore < 50 ? 'Preview only: vehicle quality below internal risk threshold.' : ['Out of Service', 'Compliance Hold'].includes(vehicle.status) ? 'Preview only: vehicle status would require review.' : '',
        admin_risk_level: riskLevel(qualityScore),
        score_volatility_flag: volatile,
        score_volatility_reason: volatile ? `Score changed ${delta > 0 ? '+' : ''}${delta} points since previous summary.` : '',
        previous_score: previous?.vehicle_quality_score,
        score_delta: delta,
        last_calculated_at: now.toISOString(),
      };
      const badgeResult = vehicleBadges(vehicle, summary);
      summary.active_badges = badgeResult.badges;
      summary.badge_explanations = badgeResult.explanations;

      await saveByUnique(base44.asServiceRole.entities.VehicleReputationSummary, existingVehicleSummaries, 'vehicle_id', summary);
      await base44.asServiceRole.entities.ReputationEventLog.create({ event_type: 'score_calculated', entity_type: 'vehicle', entity_id: vehicle.id, host_id: vehicle.host_id, vehicle_id: vehicle.id, score_impact: delta, subscores_affected: Object.keys(summary.score_breakdown), reason: 'Internal Phase 2 reputation simulation calculated vehicle summary.' });
      await base44.asServiceRole.entities.ReputationHistorySnapshot.create({ entity_type: 'vehicle', entity_id: vehicle.id, host_id: vehicle.host_id, vehicle_id: vehicle.id, snapshot_date: today, overall_score: qualityScore, subscores: summary.score_breakdown, badges: summary.active_badges, risk_level: summary.admin_risk_level, ranking_score: qualityScore });
      vehicleResults.push(summary);
    }

    return Response.json({
      ok: true,
      mode: 'internal_simulation_only',
      safety: {
        public_scores_exposed: false,
        public_badges_exposed: false,
        marketplace_ranking_changed: false,
        automatic_suppression: false,
        booking_approval_changed: false,
        payment_or_payout_changed: false,
      },
      coverage: {
        hosts_processed: hostResults.length,
        vehicles_processed: vehicleResults.length,
        event_logs_created: hostResults.length + vehicleResults.length,
        snapshots_created: hostResults.length + vehicleResults.length,
      },
      edge_case_findings: [...new Set(edgeCases)].slice(0, 40),
      volatility_observations: volatility.slice(0, 40),
      confidence_distribution: {
        host_high: hostResults.filter((s) => s.confidence_level === 'high').length,
        host_moderate: hostResults.filter((s) => s.confidence_level === 'moderate').length,
        host_low: hostResults.filter((s) => s.confidence_level === 'low').length,
        vehicle_high: vehicleResults.filter((s) => s.confidence_level === 'high').length,
        vehicle_moderate: vehicleResults.filter((s) => s.confidence_level === 'moderate').length,
        vehicle_low: vehicleResults.filter((s) => s.confidence_level === 'low').length,
      },
      recommended_weighting_adjustments: [
        'Keep no-review hosts operationally neutral until enough completed bookings exist.',
        'Keep disputes severity-adjusted rather than flat penalties.',
        'Increase maintenance weighting only after receipt verification is introduced.',
        'Keep suppression as preview-only until admin validates false positives.'
      ],
      phase_3_readiness: 'Not ready for public numeric scores. Safe next step is admin validation followed by limited public badge-only rollout.'
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});