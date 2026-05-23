const DEFAULT_SCORE = 70;
const DEFAULT_NEW_SIGNAL_SCORE = 50;

export function clampScore(value, fallback = DEFAULT_SCORE) {
  const numeric = Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

export function getRiskLevel(score) {
  if (score < 50) return "critical";
  if (score < 60) return "high";
  if (score < 70) return "medium";
  return "low";
}

export function calculateHostReputationSummary({ host, vehicles = [], bookings = [], reviews = [], disputes = [], complianceDocs = [] }) {
  const completedBookings = bookings.filter((b) => b.booking_status === "completed").length;
  const cancelledBookings = bookings.filter((b) => b.booking_status === "cancelled").length;
  const totalResolvedBookings = completedBookings + cancelledBookings;
  const bookingReliability = totalResolvedBookings > 0
    ? clampScore((completedBookings / totalResolvedBookings) * 100)
    : DEFAULT_SCORE;

  const publishedReviews = reviews.filter((r) => r.host_id === host.id && r.verified_booking && ["published", "approved"].includes(r.status || r.moderation_status));
  const publicRating = publishedReviews.length > 0
    ? Number((publishedReviews.reduce((sum, r) => sum + (r.overall_rating || r.rating || 0), 0) / publishedReviews.length).toFixed(2))
    : 0;

  const complianceIssues = complianceDocs.filter((d) => d.host_id === host.id && ["expired", "expiring_soon"].includes(d.status)).length;
  const complianceScore = clampScore(DEFAULT_SCORE - complianceIssues * 8);
  const disputeCount = disputes.filter((d) => d.host_id === host.id && !["closed_no_action", "resolved_host_favor"].includes(d.status)).length;
  const disputeScore = clampScore(DEFAULT_SCORE - disputeCount * 10);
  const restrictionPenalty = host.booking_blocked || host.payout_frozen || host.host_under_review || host.status === "suspended" ? 15 : 0;

  const hostTrustScore = clampScore(
    bookingReliability * 0.25 +
    complianceScore * 0.2 +
    disputeScore * 0.2 +
    DEFAULT_SCORE * 0.2 +
    DEFAULT_NEW_SIGNAL_SCORE * 0.15 -
    restrictionPenalty
  );

  const coachingSignals = [];
  if (cancelledBookings > 0) coachingSignals.push("Reduce cancellations to improve booking reliability.");
  if (complianceIssues > 0) coachingSignals.push("Resolve expiring or expired compliance documents.");
  if (disputeCount > 0) coachingSignals.push("Resolve open disputes to protect host trust.");
  if (vehicles.length === 0) coachingSignals.push("Add active vehicles to build fleet reliability.");

  return {
    host_id: host.id,
    host_trust_score: hostTrustScore,
    fleet_reliability_score: clampScore(vehicles.length > 0 ? DEFAULT_SCORE : 50),
    cleanliness_score: DEFAULT_SCORE,
    maintenance_confidence_score: DEFAULT_SCORE,
    communication_reliability_score: DEFAULT_SCORE,
    booking_reliability_score: bookingReliability,
    repeat_renter_score: DEFAULT_NEW_SIGNAL_SCORE,
    compliance_consistency_score: complianceScore,
    dispute_adjusted_risk_score: disputeScore,
    public_rating: publicRating,
    review_count: publishedReviews.length,
    active_badges: [],
    coaching_signals: coachingSignals,
    suppression_recommended: false,
    suppression_reason: "",
    admin_risk_level: getRiskLevel(hostTrustScore),
    last_calculated_at: new Date().toISOString(),
  };
}

export function calculateVehicleReputationSummary({ vehicle, bookings = [], reviews = [], disputes = [], complianceDocs = [] }) {
  const vehicleBookings = bookings.filter((b) => b.vehicle_id === vehicle.id);
  const completedBookings = vehicleBookings.filter((b) => b.booking_status === "completed").length;
  const cancelledBookings = vehicleBookings.filter((b) => b.booking_status === "cancelled").length;
  const totalResolvedBookings = completedBookings + cancelledBookings;
  const bookingReliability = totalResolvedBookings > 0
    ? clampScore((completedBookings / totalResolvedBookings) * 100)
    : DEFAULT_SCORE;

  const publishedReviews = reviews.filter((r) => r.vehicle_id === vehicle.id && r.verified_booking && ["published", "approved"].includes(r.status || r.moderation_status));
  const publicRating = publishedReviews.length > 0
    ? Number((publishedReviews.reduce((sum, r) => sum + (r.vehicle_condition_rating || r.overall_rating || r.rating || 0), 0) / publishedReviews.length).toFixed(2))
    : 0;

  const complianceIssues = complianceDocs.filter((d) => d.vehicle_id === vehicle.id && ["expired", "expiring_soon"].includes(d.status)).length;
  const complianceScore = clampScore(DEFAULT_SCORE - complianceIssues * 10);
  const disputeCount = disputes.filter((d) => d.vehicle_id === vehicle.id && !["closed_no_action", "resolved_host_favor"].includes(d.status)).length;
  const disputeScore = clampScore(DEFAULT_SCORE - disputeCount * 12);
  const maintenanceScore = vehicle.last_service_date ? DEFAULT_SCORE : 60;
  const downtimePenalty = ["Maintenance", "Out of Service", "Compliance Hold", "Suspended"].includes(vehicle.status) ? 15 : 0;

  const vehicleQualityScore = clampScore(
    maintenanceScore * 0.25 +
    bookingReliability * 0.2 +
    complianceScore * 0.2 +
    disputeScore * 0.2 +
    DEFAULT_SCORE * 0.15 -
    downtimePenalty
  );

  const coachingSignals = [];
  if (!vehicle.last_service_date) coachingSignals.push("Add recent maintenance records to improve maintenance confidence.");
  if (complianceIssues > 0) coachingSignals.push("Resolve vehicle compliance issues.");
  if (disputeCount > 0) coachingSignals.push("Resolve vehicle-related disputes.");
  if (downtimePenalty > 0) coachingSignals.push("Return vehicle to reliable active status when safe.");

  return {
    vehicle_id: vehicle.id,
    host_id: vehicle.host_id,
    vehicle_quality_score: vehicleQualityScore,
    cleanliness_score: DEFAULT_SCORE,
    maintenance_confidence_score: maintenanceScore,
    communication_reliability_score: DEFAULT_SCORE,
    booking_reliability_score: bookingReliability,
    repeat_renter_score: DEFAULT_NEW_SIGNAL_SCORE,
    compliance_consistency_score: complianceScore,
    dispute_adjusted_risk_score: disputeScore,
    public_rating: publicRating,
    review_count: publishedReviews.length,
    active_badges: [],
    coaching_signals: coachingSignals,
    suppression_recommended: false,
    suppression_reason: "",
    admin_risk_level: getRiskLevel(vehicleQualityScore),
    last_calculated_at: new Date().toISOString(),
  };
}