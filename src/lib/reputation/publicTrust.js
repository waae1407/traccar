export const PUBLIC_TRUST_LABELS = {
  verified_host: "Verified Host",
  well_maintained: "Well Maintained",
  clean_vehicle: "Clean Vehicle",
  fast_responder: "Fast Responder",
  repeat_favorite: "Repeat Renter Favorite",
  compliance_verified: "Compliance Verified",
};

export function approvedVerifiedReviews(reviews = []) {
  return reviews.filter((r) =>
    r.verified_booking &&
    r.moderation_status === "approved" &&
    r.visibility_status === "public" &&
    !r.fake_review_flag
  );
}

export function publicRating(reviews = []) {
  const approved = approvedVerifiedReviews(reviews);
  if (!approved.length) return { rating: 0, count: 0 };
  const rating = approved.reduce((sum, r) => sum + Number(r.overall_rating || r.rating || 0), 0) / approved.length;
  return { rating: Number(rating.toFixed(1)), count: approved.length };
}

export function latestSnapshotFor(snapshots = [], entityType, entityId) {
  return snapshots
    .filter((s) => s.entity_type === entityType && s.entity_id === entityId)
    .sort((a, b) => new Date(b.created_date || b.signal_date) - new Date(a.created_date || a.signal_date))[0] || null;
}

export function isPublicEligible(snapshot) {
  if (!snapshot) return false;
  if (["low", "insufficient_evidence"].includes(snapshot.confidence_level)) return false;
  if ((snapshot.evidence_coverage_pct || 0) < 60) return false;
  if ((snapshot.completed_bookings_count || 0) < 3) return false;
  if (snapshot.public_badge_threshold_met === false && (snapshot.signal_completeness_score || 0) < 60) return false;
  if (snapshot.stale_signal_flag || snapshot.stale_gps_device_flag) return false;
  return true;
}

export function publicHostLabels(snapshot, host) {
  if (!isPublicEligible(snapshot)) return [];
  const labels = [];
  const thresholds = snapshot.threshold_results || {};
  if (host?.status === "approved" && thresholds.minimum_completed_bookings) labels.push("verified_host");
  if ((snapshot.communication_threads_count || 0) > 0 && (snapshot.sla_breach_count || 0) === 0 && (snapshot.first_response_avg_minutes || 9999) <= 120) labels.push("fast_responder");
  if ((snapshot.repeat_renter_count || 0) > 0 && (snapshot.repeat_renter_retention_pct || 0) >= 30) labels.push("repeat_favorite");
  if ((snapshot.compliance_docs_count || 0) > 0 && (snapshot.expired_compliance_count || 0) === 0 && (snapshot.active_rental_compliance_gap_count || 0) === 0) labels.push("compliance_verified");
  return labels;
}

export function publicVehicleLabels(snapshot) {
  if (!isPublicEligible(snapshot)) return [];
  const labels = [];
  if ((snapshot.verified_maintenance_count || 0) > 0 && snapshot.service_cadence_status !== "overdue") labels.push("well_maintained");
  if ((snapshot.inspection_completeness_pct || 0) >= 80 && (snapshot.missing_inspection_count || 0) === 0) labels.push("clean_vehicle");
  if ((snapshot.compliance_docs_count || 0) > 0 && (snapshot.expired_compliance_count || 0) === 0 && (snapshot.active_rental_compliance_gap_count || 0) === 0) labels.push("compliance_verified");
  if ((snapshot.repeat_renter_count || 0) > 0 && (snapshot.repeat_renter_retention_pct || 0) >= 30) labels.push("repeat_favorite");
  return labels;
}

export function badgeExplanation(snapshot, labelKey) {
  const reasons = {
    verified_host: "Approved host with enough completed-trip evidence.",
    well_maintained: "Receipt-backed maintenance evidence is current.",
    clean_vehicle: "Inspection and cleanliness evidence meets the public threshold.",
    fast_responder: "Communication response evidence meets the public threshold.",
    repeat_favorite: "Repeat renter behavior supports this label.",
    compliance_verified: "Compliance records are active with no expired-doc gap.",
  };
  if (!isPublicEligible(snapshot)) return "Withheld because confidence or evidence coverage is not high enough.";
  return reasons[labelKey] || "Evidence-gated public label.";
}