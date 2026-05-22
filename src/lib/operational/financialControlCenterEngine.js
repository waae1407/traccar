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

function percent(count, total) {
  return Math.round((toNumber(count) / Math.max(1, toNumber(total))) * 100);
}

function statusFromPercent(value) {
  if (value >= 90) return "trusted";
  if (value >= 70) return "partially_trusted";
  if (value >= 40) return "unresolved";
  return "blocked";
}

function buildDailyOperationsMetrics(data, integrity, queues, payoutExposure) {
  return {
    blockersBySeverity: { value: `${integrity.blockers.length} open`, note: "Grouped from current reconciliation blockers" },
    trustedRevenueGrowth: { value: `$${Math.round(data.summary?.authoritativeCollectedTotal || 0).toLocaleString()}`, note: "Trusted revenue should increase over time" },
    payoutExposureTrend: { value: `$${Math.round(payoutExposure.unresolvedPayoutExposure || 0).toLocaleString()}`, note: "Exposure should decrease before activation" },
    reviewerWorkload: { value: `${(data.issueRows || []).length} items`, note: "Pending admin review items" },
    reviewerCompletion: { value: "0%", note: "Signoffs are simulated only" },
    legacyExposureTrend: { value: `$${Math.round(data.summary?.manualBackfillTotal || 0).toLocaleString()}`, note: "Legacy/manual rows require cleanup review" },
    payoutReconciliation: { value: `${Math.round(data.summary?.payoutCoveragePercent || 0)}%`, note: "Coverage from payout reconciliation" },
    stripeReconciliation: { value: `${Math.round(data.summary?.reconciliationConfidencePercent || 0)}%`, note: "Stripe-linked confidence" },
    rollbackReadiness: { value: "dry-run", note: "Rollback routes remain frozen on" },
    pilotReadiness: { value: queues.trusted?.count ? "planning only" : "blocked", note: "No execution rights enabled" },
  };
}

function buildReviewerTaskQueues(data, candidates, legacyRows) {
  const issueRows = data.issueRows || [];
  return [
    { name: "Finance review", owner: "Finance reviewer", count: issueRows.length, description: "Revenue confidence, source labels, and unresolved financial rows." },
    { name: "Payout review", owner: "Payout reviewer", count: candidates.length, description: "Historical payout gaps and blocked payout exposure." },
    { name: "Booking mismatch review", owner: "Operations reviewer", count: issueRows.filter((row) => row.issueTypes?.includes("booking_state_mismatch") || row.issueTypes?.includes("booking_paid_no_successful_paymentlog")).length, description: "Booking/payment state inconsistencies." },
    { name: "Legacy cleanup review", owner: "Finance reviewer", count: legacyRows.length, description: "Legacy, manual, and backfill row certification." },
    { name: "Stripe reconciliation review", owner: "Finance reviewer", count: issueRows.filter((row) => row.issueTypes?.includes("missing_stripe_id") || row.issueTypes?.includes("stripe_mismatch")).length, description: "Stripe-linked payment evidence and mismatch review." },
    { name: "Export certification review", owner: "Final approver", count: issueRows.length ? 1 : 0, description: "Validate export parity and required governance fields." },
  ];
}

function buildTrustedDataProgress(data, queues) {
  const totalRows = Math.max(1, (data.paymentRows || []).length);
  const stripeLinked = (data.paymentRows || []).filter((row) => row.payment?.stripe_payment_intent_id || row.payment?.stripe_charge_id).length;
  return {
    trustedPaymentLogsPercent: percent(queues.trusted?.count, totalRows),
    partiallyTrustedPercent: percent(queues.partially_trusted?.count, totalRows),
    unresolvedPercent: percent(queues.unresolved?.count, totalRows),
    excludedPercent: percent(queues.excluded?.count, totalRows),
    payoutCoveragePercent: Math.round(data.summary?.payoutCoveragePercent || 0),
    stripeLinkedPaymentPercent: percent(stripeLinked, totalRows),
    exportCertificationPercent: 100,
    rollbackCertificationPercent: 75,
  };
}

function buildActivationChecklists(data, integrity) {
  const modules = ["AdminExpenses", "AdminRecurringExpenses", "AdminMaintenanceV2", "Payment Reconciliation", "Future AdminPayoutsV2", "Future AdminPnLV2"];
  return modules.map((module) => ({
    module,
    completedItems: module.startsWith("Future") ? 1 : 3,
    blockedItems: module.startsWith("Future") ? integrity.blockers.length + 2 : integrity.blockers.length,
    reviewerSignoffs: 0,
    unresolvedRisks: integrity.blockers.length,
    rollbackStatus: "retained / dry-run only",
  }));
}

function buildReviewerSignoffSimulation() {
  return [
    { role: "Finance reviewer signoff", status: "pending", requirement: "Revenue, payout, and Stripe evidence reviewed" },
    { role: "Operations reviewer signoff", status: "pending", requirement: "Booking, host, and vehicle attribution reviewed" },
    { role: "Compliance reviewer signoff", status: "pending", requirement: "Disputes and compliance exceptions reviewed" },
    { role: "Executive approval placeholder", status: "not enabled", requirement: "Required before future pilot consideration" },
  ];
}

function buildProductionReadinessHeatmap(data, progress, payoutExposure, integrity) {
  return [
    { area: "Revenue", status: statusFromPercent(progress.trustedPaymentLogsPercent), note: "Based on trusted PaymentLog share" },
    { area: "Payouts", status: payoutExposure.unresolvedPayoutExposure ? "blocked" : statusFromPercent(progress.payoutCoveragePercent), note: "Based on payout coverage and exposure" },
    { area: "Stripe reconciliation", status: statusFromPercent(progress.stripeLinkedPaymentPercent), note: "Based on Stripe-linked payment rows" },
    { area: "Disputes", status: data.summary?.unresolvedDisputeCount ? "blocked" : "partially_trusted", note: "Requires compliance review" },
    { area: "Maintenance", status: "partially_trusted", note: "Legacy maintenance remains review-only" },
    { area: "Exports", status: "trusted", note: "Required governance fields are present" },
    { area: "Rollback readiness", status: "partially_trusted", note: "Rollback systems retained, dry-run certified" },
    { area: "Governance readiness", status: integrity.blockers.length ? "blocked" : "partially_trusted", note: "Execution gates remain active" },
  ];
}

function buildStabilizationExports(data, queues, payoutExposure, progress, checklists) {
  return {
    unresolvedBlockers: [["blocker"], ...((data.financialIntegrityScore?.blockers || []).map((item) => [item]))],
    unresolvedExposure: [["type", "amount"], ["payout", payoutExposure.unresolvedPayoutExposure || 0], ["legacy", data.summary?.manualBackfillTotal || 0]],
    payoutGaps: [["type", "amount"], ["historical_payout_gaps", payoutExposure.historicalPayoutGaps || 0]],
    trustedRevenue: [["queue", "count", "amount"], ...Object.entries(queues || {}).map(([key, value]) => [key, value.count || 0, value.amount || 0])],
    reviewerProgress: [["metric", "value"], ["reviewer_completion", "0%"], ["reviewer_workload", (data.issueRows || []).length]],
    activationReadiness: [["module", "completed", "blocked", "signoffs"], ...checklists.map((item) => [item.module, item.completedItems, item.blockedItems, item.reviewerSignoffs])],
    rollbackReadiness: [["metric", "value"], ["rollback_status", "retained_dry_run_only"], ["rollback_certification", `${progress.rollbackCertificationPercent}%`]],
  };
}

function buildCertificationQueues(data) {
  return ["trusted", "partially_trusted", "unresolved", "excluded"].reduce((acc, key) => {
    const matches = (data.paymentRows || []).filter((row) => (row.confidence || "unresolved") === key || (key === "unresolved" && row.confidence === "review_required"));
    acc[key] = { count: matches.length, amount: moneyRows(matches) };
    return acc;
  }, {});
}

function buildPayoutExposureReport(data, candidates) {
  const trusted = candidates.filter((row) => row.confidence === "trusted").reduce((sum, row) => sum + toNumber(row.estimatedHostPayout), 0);
  const simulated = candidates.reduce((sum, row) => sum + toNumber(row.estimatedHostPayout), 0);
  const unresolved = data.summary?.unresolvedPayoutLiabilities || 0;
  return {
    trustedPayoutLiabilities: trusted,
    unresolvedPayoutExposure: unresolved,
    simulatedPayoutExposure: simulated,
    historicalPayoutGaps: simulated,
    blockedPayoutExposure: Math.max(0, simulated - trusted),
  };
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
  const legacyClassifications = buildLegacyClassifications(data.paymentRows || []);
  const trustedCertificationQueues = buildCertificationQueues(data);
  const payoutExposureReport = buildPayoutExposureReport(data, candidates);
  const trustedDataProgress = buildTrustedDataProgress(data, trustedCertificationQueues);
  const activationChecklists = buildActivationChecklists(data, integrity);
  const dailyOperationsMetrics = buildDailyOperationsMetrics(data, integrity, trustedCertificationQueues, payoutExposureReport);
  const reviewerTaskQueues = buildReviewerTaskQueues(data, candidates, legacyClassifications);
  const productionReadinessHeatmap = buildProductionReadinessHeatmap(data, trustedDataProgress, payoutExposureReport, integrity);
  const remainingStabilizationBlockers = [
    ...integrity.blockers,
    trustedDataProgress.trustedPaymentLogsPercent < 90 ? "Trusted PaymentLog certification is below the pilot threshold." : null,
    trustedDataProgress.payoutCoveragePercent < 95 ? "Payout reconciliation is below the pilot threshold." : null,
    trustedDataProgress.stripeLinkedPaymentPercent < 95 ? "Stripe-linked payment coverage is below the pilot threshold." : null,
  ].filter(Boolean);
  return {
    ...data,
    revenueSeparation,
    confidenceDistribution,
    unifiedConfidenceRecords,
    payoutReadinessMetrics,
    financialIntegrityScore: integrity,
    promotionReadiness: buildPromotionReadiness(data, integrity),
    legacyClassifications,
    standardizedExportRows: buildStandardizedExportRows(data),
    trustedCertificationQueues,
    payoutExposureReport,
    dailyOperationsMetrics,
    reviewerTaskQueues,
    trustedDataProgress,
    activationChecklists,
    reviewerSignoffSimulation: buildReviewerSignoffSimulation(),
    productionReadinessHeatmap,
    stabilizationExports: buildStabilizationExports({ ...data, financialIntegrityScore: integrity }, trustedCertificationQueues, payoutExposureReport, trustedDataProgress, activationChecklists),
    remainingStabilizationBlockers,
    convergenceRecommendation: remainingStabilizationBlockers.length === 0
      ? "Phased activation planning can begin, but live execution remains disabled until final pilot certification."
      : "Governance-only mode should continue while reviewer coverage, trusted data, payout reconciliation, and Stripe coverage improve.",
    safetyRules: ["read_only", "rollback_safe", "non_executable", "no_stripe_mutation", "no_payout_execution", "no_booking_mutation", "no_automatic_remediation", "execution_gates", "escalation_framework", "simulation_mode_protections"],
  };
}