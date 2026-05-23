export const BADGE_DEFINITIONS = {
  verified_host: {
    label: "Verified Host",
    entity: "host",
    internalOnly: true,
    description: "Host is approved and verification is complete.",
  },
  top_host: {
    label: "Top Host",
    entity: "host",
    internalOnly: true,
    description: "High trust host with strong reliability and low risk.",
  },
  clean_fleet: {
    label: "Clean Fleet",
    entity: "host",
    internalOnly: true,
    description: "Fleet cleanliness signals are consistently strong.",
  },
  well_maintained: {
    label: "Well Maintained",
    entity: "vehicle",
    internalOnly: true,
    description: "Vehicle has strong maintenance confidence.",
  },
  trusted_vehicle: {
    label: "Trusted Vehicle",
    entity: "vehicle",
    internalOnly: true,
    description: "Vehicle quality and reliability signals are strong.",
  },
};

export function evaluateHostBadges(host, summary) {
  const badges = [];
  if (host.status === "approved" && host.verification_status === "verified") badges.push("verified_host");
  if ((summary?.host_trust_score || 0) >= 90 && (summary?.review_count || 0) >= 3) badges.push("top_host");
  if ((summary?.cleanliness_score || 0) >= 85 && (summary?.fleet_reliability_score || 0) >= 85) badges.push("clean_fleet");
  return badges;
}

export function evaluateVehicleBadges(vehicle, summary) {
  const badges = [];
  if ((summary?.maintenance_confidence_score || 0) >= 85 && vehicle.last_service_date) badges.push("well_maintained");
  if ((summary?.vehicle_quality_score || 0) >= 85) badges.push("trusted_vehicle");
  return badges;
}