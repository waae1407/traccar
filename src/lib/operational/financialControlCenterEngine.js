import { loadPaymentReconciliationData } from "@/lib/operational/sharedPaymentReconciliationEngine";

const toNumber = (value) => Number(value || 0);
const avg = (items, selector) => items.length ? items.reduce((total, item) => total + selector(item), 0) / items.length : 0;

function moneyRows(rows = []) {
  return rows.reduce((total, row) => total + toNumber(row.collectedAmount), 0);
}

function labelFromScore(score) {
  if (score >= 85) return "trusted";
  if (score >= 60) return "partially_trusted";
  if (score >= 35) return "review_required";
  if (score >= 15) return "unresolved";
  return "excluded";
}

function buildPayoutGapGroups(candidates = [], key) {
  const map = new Map();
  candidates.forEach((candidate) => {
    const id = candidate[key] || "unassigned";
    const current = map.get(id) || { id, count: 0, exposure: 0, confidenceTotal: 0 };
    current.count += 1;
    current.exposure += toNumber(candidate.estimatedHostPayout);
    current.confidenceTotal += toNumber(candidate.confidenceScore);
    current.name = candidate.hostName || id;
    map.set(id, current);
  });
  return Array.from(map.values()).map((item) => ({ ...item, confidencePercent: item.count ? item.confidenceTotal / item.count : 0 }));
}

function buildIntegrityScore(data) {
  const summary = data.summary || {};
  const paymentIntegrity = Math.max(0, 100 - ((summary.duplicateRiskRows || 0) + (summary.missingStripeIdRows || 0)) * 4);
  const payoutIntegrity = Math.max(0, summary.payoutCoveragePercent || 0);
  const reconciliationIntegrity = Math.max(0, summary.reconciliationConfidencePercent || 0);
  const attributionIntegrity = Math.max(0, 100 - ((summary.unresolvedHostAttributionCount || 0) + (summary.unresolvedCustomerAttributionCount || 0)) * 3);
  const exportIntegrity = data.issueRows?.length ? 82 : 100;
  const components = { paymentIntegrity, payoutIntegrity, reconciliationIntegrity, attributionIntegrity, exportIntegrity };
  const score = avg(Object.values(components), (value) => value);
  const blockers = [
    summary.duplicateRiskCount ? "Duplicate payment risks must be excluded or resolved." : null,
    summary.bookingMismatchCount ? "Booking/payment state mismatches need review." : null,
    summary.unresolvedPayoutLiabilities ? "Unresolved payout liability remains open." : null,
    summary.unresolvedHostAttributionCount ? "Host attribution gaps remain." : null,
    summary.unresolvedCustomerAttributionCount ? "Customer linkage gaps remain." : null,
  ].filter(Boolean);
  const remediationCategories = ["recover_stripe_ids", "review_manual_payment", "create_historical_payout_candidate", "exclude_duplicate", "verify_booking_state", "verify_host_attribution", "verify_customer_linkage"];
  return { score, components, blockers, remediationCategories };
}

function buildPromotionReadiness(data, integrity) {
  const score = Math.round(integrity.score);
  const payoutReady = Math.max(0, Math.min(100, Math.round((data.summary?.payoutCoveragePercent || 0) * 0.55 + score * 0.45)));
  const common = {
    rollbackReadiness: "ready",
    reconciliationStatus: data.issueRows?.length ? "review_required" : "clear",
    blockers: integrity.blockers,
    unresolvedRisks: data.recommendedCleanupActions || [],
  };
  return [
    { area: "AdminExpenses", readiness: Math.min(92, score + 8), ...common },
    { area: "AdminRecurringExpenses", readiness: Math.min(90, score + 6), ...common },
    { area: "AdminMaintenanceV2", readiness: Math.min(88, score + 4), ...common },
    { area: "AdminPayoutsV2", readiness: payoutReady, ...common, blockers: [...integrity.blockers, "Payout execution remains disabled until remediation is approved."] },
    { area: "AdminPnLV2", readiness: Math.max(0, score - 8), ...common, blockers: [...integrity.blockers, "P&L promotion requires authoritative revenue separation validation."] },
  ];
}

function buildUnifiedConfidenceRecords(data) {
  const payments = (data.paymentRows || []).map((row) => ({
    entityType: "payment",
    entityId: row.payment?.id,
    confidenceLabel: row.confidence,
    confidenceScore: row.confidenceScore || 0,
    explanation: row.confidenceFactors?.join(" ") || row.recommendedAction,
    authoritative: !!row.authoritative,
  }));
  const payouts = (data.payoutBackfillCandidates || []).map((row) => ({
    entityType: "payout_candidate",
    entityId: row.sourcePaymentId,
    confidenceLabel: row.confidence,
    confidenceScore: row.confidenceScore || 0,
    explanation: row.safetyReason,
    authoritative: row.confidence === "trusted" && row.candidateStatus === "safe_candidate",
  }));
  const disputes = (data.exceptionRegistry || []).filter((item) => item.category === "unresolved_dispute_linkage").map((item) => ({
    entityType: "dispute",
    entityId: item.linkedEntities?.disputeIds?.join(",") || item.id,
    confidenceLabel: item.confidence,
    confidenceScore: item.confidenceScore || 0,
    explanation: item.recommendedAction,
    authoritative: false,
  }));
  const exports = (data.issueRows || []).map((row) => ({
    entityType: "export_review_queue",
    entityId: row.id,
    confidenceLabel: row.confidence,
    confidenceScore: row.confidenceScore || 0,
    explanation: "Export row includes confidence, review state, authoritative flag, source labels, and linked entity references.",
    authoritative: !!row.authoritative,
  }));
  return [...payments, ...payouts, ...disputes, ...exports];
}

function buildLegacyClassifications(paymentRows = []) {
  return paymentRows
    .filter((row) => row.payment?.legacy_flag || row.payment?.source_type === "backfill" || row.payment?.recorded_by === "backfill" || row.issueTypes?.includes("manual_payment"))
    .map((row) => ({
      id: row.payment?.id,
      classification: row.confidence === "partially_trusted" && row.issues?.length ? "review_required" : row.confidence,
      confidenceLabel: row.confidence,
      confidenceScore: row.confidenceScore || 0,
      rationale: row.recommendedAction,
      evidenceSummary: row.confidenceFactors?.join(" ") || "Legacy/manual row requires source evidence review.",
      sourceHistory: [row.payment?.source_type, row.payment?.recorded_by, row.payment?.payment_method].filter(Boolean).join(" / "),
      externalReconcilability: row.payment?.external_reconcilable ? "reconcilable" : "not_marked_reconcilable",
      authoritative: !!row.authoritative,
    }));
}

function buildStandardizedExportRows(data) {
  const headers = ["entity_type", "entity_id", "authoritative_flag", "confidence_label", "confidence_score", "confidence_explanation", "review_state", "payout_candidate_state", "issue_severity", "source_label", "reconciliation_status", "payment_log_id", "booking_request_id", "host_id", "vehicle_id", "customer_id", "recommended_remediation"];
  const rows = (data.issueRows || []).map((row) => [
    row.payment ? "PaymentLog" : row.payout ? "HostPayout" : "BookingRequest",
    row.payment?.id || row.payout?.id || row.booking?.id || row.id,
    row.authoritative ? "true" : "false",
    row.confidence || "unresolved",
    row.confidenceScore || 0,
    row.confidenceFactors?.join(" | ") || row.recommendedAction || "",
    row.reviewState || "pending_review",
    row.payoutCandidateStatus || "",
    row.severity || "warning",
    row.payment?.source_type || row.payment?.payment_method || "system_review",
    row.issues?.length ? "review_required" : "reconciled",
    row.payment?.id || "",
    row.payment?.booking_request_id || row.booking?.id || row.payout?.booking_request_id || "",
    row.payment?.host_id || row.booking?.host_id || row.payout?.host_id || "",
    row.payment?.vehicle_id || row.booking?.vehicle_id || "",
    row.payment?.customer_id || row.booking?.user_id || "",
    row.recommendedAction || "",
  ]);
  return [headers, ...rows];
}

export async function loadFinancialControlCenterData() {
  const data = await loadPaymentReconciliationData();
  const successfulRows = data.paymentRows?.filter((row) => row.payment?.status === "paid") || [];
  const excludedRows = data.paymentRows?.filter((row) => row.confidence === "excluded") || [];
  const projectedRows = data.issueRows?.filter((row) => row.issueTypes?.includes("booking_paid_no_successful_paymentlog")) || [];
  const candidates = data.payoutBackfillCandidates || [];
  const unifiedConfidenceRecords = buildUnifiedConfidenceRecords(data);
  const confidenceDistribution = unifiedConfidenceRecords.reduce((acc, row) => {
    acc[row.confidenceLabel] = (acc[row.confidenceLabel] || 0) + 1;
    return acc;
  }, {});
  const payoutReadinessMetrics = {
    payoutCoveragePercent: data.summary?.payoutCoveragePercent || 0,
    payoutGapsByHost: buildPayoutGapGroups(candidates, "hostId"),
    payoutGapsByBooking: buildPayoutGapGroups(candidates, "bookingId"),
    payoutConfidencePercent: avg(candidates, (row) => toNumber(row.confidenceScore)),
    unresolvedPayoutLiability: data.summary?.unresolvedPayoutLiabilities || 0,
    estimatedHistoricalPayoutExposure: candidates.reduce((total, row) => total + toNumber(row.estimatedHostPayout), 0),
    externallyUnreconcilableRevenue: moneyRows(successfulRows.filter((row) => row.payment?.external_reconcilable === false || row.issueTypes?.includes("missing_stripe_id"))),
  };
  const revenueSeparation = {
    authoritativeRevenue: data.summary?.authoritativeCollectedTotal || 0,
    partiallyTrustedRevenue: moneyRows(successfulRows.filter((row) => row.confidence === "partially_trusted")),
    unresolvedRevenue: data.summary?.unresolvedTotal || 0,
    excludedRevenue: moneyRows(excludedRows),
    projectedRevenue: projectedRows.reduce((total, row) => total + toNumber(row.expectedAmount), 0),
    manualOfflineRevenue: data.summary?.manualBackfillTotal || 0,
    stripeReconciledRevenue: data.summary?.stripeReconciledTotal || 0,
  };
  const integrity = buildIntegrityScore(data);
  return {
    ...data,
    revenueSeparation,
    confidenceDistribution,
    unifiedConfidenceRecords,
    payoutReadinessMetrics,
    financialIntegrityScore: integrity,
    promotionReadiness: buildPromotionReadiness(data, integrity),
    legacyClassifications: buildLegacyClassifications(data.paymentRows || []),
    standardizedExportRows: buildStandardizedExportRows(data),
    convergenceRecommendation: integrity.score >= 85 && integrity.blockers.length === 0
      ? "Controlled remediation can begin with admin approval and scoped runbooks."
      : "Do not begin controlled remediation yet; resolve blockers and review unresolved exposure first.",
    safetyRules: ["read_only", "rollback_safe", "non_executable", "no_stripe_mutation", "no_payout_execution", "no_booking_mutation", "no_automatic_remediation"],
  };
}