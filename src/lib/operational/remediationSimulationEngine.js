import { base44 } from "@/api/base44Client";
import { loadFinancialControlCenterData } from "@/lib/operational/financialControlCenterEngine";

const toNumber = (value) => Number(value || 0);
const money = (value) => Math.round(toNumber(value) * 100) / 100;

function getBaseline(data) {
  const revenue = data.revenueSeparation || {};
  const totalRevenue = toNumber(revenue.authoritativeRevenue) + toNumber(revenue.partiallyTrustedRevenue) + toNumber(revenue.unresolvedRevenue) + toNumber(revenue.excludedRevenue);
  return {
    integrityScore: toNumber(data.financialIntegrityScore?.score),
    payoutCoverage: toNumber(data.payoutReadinessMetrics?.payoutCoveragePercent),
    authoritativeRevenuePercent: totalRevenue ? (toNumber(revenue.authoritativeRevenue) / totalRevenue) * 100 : 0,
    unresolvedExposure: toNumber(data.payoutReadinessMetrics?.unresolvedPayoutLiability) + toNumber(revenue.unresolvedRevenue),
    authoritativeRevenue: toNumber(revenue.authoritativeRevenue),
    unresolvedRevenue: toNumber(revenue.unresolvedRevenue),
  };
}

function makeDelta(before, changes = {}) {
  const after = {
    integrityScore: Math.min(100, Math.max(0, before.integrityScore + toNumber(changes.integrityScore))),
    payoutCoverage: Math.min(100, Math.max(0, before.payoutCoverage + toNumber(changes.payoutCoverage))),
    authoritativeRevenuePercent: Math.min(100, Math.max(0, before.authoritativeRevenuePercent + toNumber(changes.authoritativeRevenuePercent))),
    unresolvedExposure: Math.max(0, before.unresolvedExposure - toNumber(changes.unresolvedExposureReduction)),
  };
  return { before, after, delta: {
    integrityScore: after.integrityScore - before.integrityScore,
    payoutCoverage: after.payoutCoverage - before.payoutCoverage,
    authoritativeRevenuePercent: after.authoritativeRevenuePercent - before.authoritativeRevenuePercent,
    unresolvedExposure: after.unresolvedExposure - before.unresolvedExposure,
  }};
}

function detectConflicts(row = {}, candidates = []) {
  const issueTypes = row.issueTypes || [];
  const payment = row.payment || {};
  const candidate = candidates.find((item) => item.sourcePaymentId === payment.id || item.bookingId === payment.booking_request_id);
  return [
    issueTypes.includes("duplicate_risk") ? "duplicate payout creation risk" : null,
    issueTypes.includes("booking_state_mismatch") || issueTypes.includes("successful_payment_booking_not_paid") ? "conflicting booking states" : null,
    !payment.host_id && !row.booking?.host_id ? "conflicting host attribution" : null,
    issueTypes.includes("manual_payment") && (payment.stripe_payment_intent_id || payment.stripe_charge_id) ? "overlapping manual/Stripe payments" : null,
    candidate?.likelyAlreadyPaidExternally ? "payout already handled externally" : null,
    issueTypes.includes("duplicate_risk") || !payment.week_number ? "conflicting week assignments" : null,
  ].filter(Boolean);
}

function scenarioForRow(row, before, candidates) {
  const amount = toNumber(row.collectedAmount || row.expectedAmount);
  const payoutCandidate = candidates.find((item) => item.sourcePaymentId === row.payment?.id || item.bookingId === row.payment?.booking_request_id);
  const conflicts = detectConflicts(row, candidates);
  let scenario = "If this PaymentLog became trusted";
  let action = "confidence_upgrade";
  let changes = { integrityScore: 2, authoritativeRevenuePercent: amount ? 1.5 : 0, unresolvedExposureReduction: amount };

  if (row.issueTypes?.includes("missing_host_payout") && payoutCandidate) {
    scenario = "If this payout existed";
    action = "payout_backfill_simulation";
    changes = { integrityScore: 3, payoutCoverage: 2, unresolvedExposureReduction: payoutCandidate.estimatedHostPayout };
  } else if (row.issueTypes?.includes("duplicate_risk")) {
    scenario = "If this duplicate was excluded";
    action = "duplicate_exclusion_simulation";
    changes = { integrityScore: 4, authoritativeRevenuePercent: 1, unresolvedExposureReduction: amount };
  } else if (row.issueTypes?.some((type) => ["booking_state_mismatch", "successful_payment_booking_not_paid", "booking_paid_no_successful_paymentlog"].includes(type))) {
    scenario = "If this booking state was corrected";
    action = "booking_state_correction_simulation";
    changes = { integrityScore: 3, authoritativeRevenuePercent: 1, unresolvedExposureReduction: amount };
  } else if (row.issueTypes?.includes("missing_stripe_id")) {
    scenario = "If Stripe IDs were recovered";
    action = "stripe_reconciliation_match_simulation";
    changes = { integrityScore: 3, authoritativeRevenuePercent: 1.25, unresolvedExposureReduction: amount };
  } else if (row.confidence === "unresolved" || row.confidence === "excluded") {
    scenario = "If this legacy row was unresolved/excluded";
    action = "legacy_row_classification_simulation";
    changes = { integrityScore: 2, authoritativeRevenuePercent: 0.5, unresolvedExposureReduction: amount * 0.5 };
  }

  const deltaPreview = makeDelta(before, changes);
  return {
    id: `sim-${row.id}`,
    scenario,
    action,
    previewOnly: true,
    nonExecutable: true,
    affectedEntities: {
      paymentLogId: row.payment?.id || "",
      bookingRequestId: row.payment?.booking_request_id || row.booking?.id || "",
      hostId: row.payment?.host_id || row.booking?.host_id || "",
      vehicleId: row.payment?.vehicle_id || row.booking?.vehicle_id || "",
      payoutCandidateId: payoutCandidate?.sourcePaymentId || "",
    },
    financialImpact: money(action === "duplicate_exclusion_simulation" ? -amount : amount),
    payoutImpact: money(payoutCandidate?.estimatedHostPayout || 0),
    profitabilityImpact: money(amount - toNumber(payoutCandidate?.estimatedHostPayout)),
    confidenceImpact: { from: row.confidence || "unresolved", to: conflicts.length ? "review_required" : "trusted", scoreDelta: conflicts.length ? 5 : 20 },
    integrityDeltaPreview: deltaPreview,
    conflicts,
    blockers: conflicts.length ? conflicts : row.issues?.map((issue) => issue.message) || [],
    recommendation: row.recommendedAction || "Review evidence before manual remediation.",
    confidence: row.confidence || "unresolved",
    confidenceScore: row.confidenceScore || 0,
    severity: row.severity || "warning",
  };
}

function groupQueue(scenarios = []) {
  const groups = {
    payout_gaps: [], unresolved_payments: [], booking_mismatches: [], duplicate_risks: [], missing_stripe_ids: [], unresolved_host_attribution: [], unresolved_customer_attribution: [],
  };
  scenarios.forEach((scenario) => {
    if (scenario.action === "payout_backfill_simulation") groups.payout_gaps.push(scenario);
    if (["confidence_upgrade", "legacy_row_classification_simulation"].includes(scenario.action)) groups.unresolved_payments.push(scenario);
    if (scenario.action === "booking_state_correction_simulation") groups.booking_mismatches.push(scenario);
    if (scenario.action === "duplicate_exclusion_simulation") groups.duplicate_risks.push(scenario);
    if (scenario.action === "stripe_reconciliation_match_simulation") groups.missing_stripe_ids.push(scenario);
    if (scenario.conflicts.includes("conflicting host attribution")) groups.unresolved_host_attribution.push(scenario);
    if (scenario.affectedEntities.paymentLogId && scenario.recommendation.toLowerCase().includes("customer")) groups.unresolved_customer_attribution.push(scenario);
  });
  return groups;
}

function buildForecast(data, scenarios) {
  const unresolvedDisputes = (data.exceptionRegistry || []).filter((item) => item.category === "unresolved_dispute_linkage").length;
  const potentialHostLiabilities = (data.payoutReadinessMetrics?.payoutGapsByHost || []).reduce((total, item) => total + toNumber(item.exposure), 0);
  const untrustedRevenue = toNumber(data.revenueSeparation?.partiallyTrustedRevenue) + toNumber(data.revenueSeparation?.unresolvedRevenue);
  const totalRevenue = untrustedRevenue + toNumber(data.revenueSeparation?.authoritativeRevenue) + toNumber(data.revenueSeparation?.excludedRevenue);
  return {
    unresolvedPayoutExposure: toNumber(data.payoutReadinessMetrics?.unresolvedPayoutLiability),
    potentialHostLiabilities,
    unreconciledRevenue: toNumber(data.revenueSeparation?.unresolvedRevenue),
    untrustedRevenuePercent: totalRevenue ? (untrustedRevenue / totalRevenue) * 100 : 0,
    unresolvedDisputes,
    estimatedPayoutRecoveryWorkload: scenarios.filter((item) => item.action === "payout_backfill_simulation").length,
  };
}

function expandPromotionReadiness(items = [], simulationConfidence, readinessScore) {
  return items.map((item) => ({
    ...item,
    remediationReadiness: readinessScore,
    simulationConfidence,
    rollbackConfidence: "high",
    payoutRecoveryReadiness: item.area === "AdminPayoutsV2" ? readinessScore : Math.max(70, readinessScore),
    externalReconciliationReadiness: simulationConfidence,
  }));
}

export async function loadRemediationSimulationData() {
  const [data, user] = await Promise.all([
    loadFinancialControlCenterData(),
    base44.auth.me(),
  ]);
  const before = getBaseline(data);
  const scenarios = (data.issueRows || []).map((row) => scenarioForRow(row, before, data.payoutBackfillCandidates || []));
  const payoutBackfillSimulationResults = (data.payoutBackfillCandidates || []).map((candidate) => ({
    ...candidate,
    previewOnly: true,
    nonExecutable: true,
    estimatedOnly: true,
    coverageImprovement: 2,
    hostLiabilityChange: -money(candidate.estimatedHostPayout),
    unresolvedLiabilityReduction: money(candidate.estimatedHostPayout),
  }));
  const simulationConfidence = scenarios.length ? scenarios.reduce((total, item) => total + toNumber(item.confidenceScore), 0) / scenarios.length : 100;
  const conflictCount = scenarios.reduce((total, item) => total + item.conflicts.length, 0);
  const remediationReadinessScore = Math.max(0, Math.min(100, simulationConfidence - conflictCount * 2));
  return {
    generatedAt: new Date().toISOString(),
    simulatedBy: user?.email || "unknown",
    scenarios,
    remediationQueue: groupQueue(scenarios),
    payoutBackfillSimulationResults,
    exposureForecast: buildForecast(data, scenarios),
    conflictCategories: [...new Set(scenarios.flatMap((item) => item.conflicts))],
    simulationAudit: scenarios.slice(0, 30).map((scenario) => ({
      ranBy: user?.email || "unknown",
      ranAt: new Date().toISOString(),
      simulatedAction: scenario.action,
      affectedEntities: scenario.affectedEntities,
      projectedFinancialDeltas: scenario.integrityDeltaPreview.delta,
    })),
    expandedPromotionReadiness: expandPromotionReadiness(data.promotionReadiness || [], simulationConfidence, remediationReadinessScore),
    remediationReadinessScore,
    recommendation: remediationReadinessScore >= 85 && conflictCount === 0
      ? "Controlled manual remediation can begin with admin-approved, item-by-item runbooks."
      : "Do not begin controlled manual remediation yet; resolve simulation conflicts and high-severity blockers first.",
    safetyRules: ["read_only", "simulation_only", "rollback_safe", "non_executable", "no_stripe_mutation", "no_payout_execution", "no_booking_mutation", "no_automatic_cleanup"],
  };
}