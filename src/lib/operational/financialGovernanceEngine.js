import { loadManualRemediationWorkspaceData } from "@/lib/operational/manualRemediationWorkspaceEngine";

const toNumber = (value) => Number(value || 0);
const pct = (value) => Math.max(0, Math.min(100, Math.round(value)));

function classifyEscalation(caseItem) {
  const blockers = caseItem.blockers || [];
  if (blockers.length || caseItem.stagedActions?.[0]?.status === "blocked") return "blocking";
  if (caseItem.severity === "critical") return "critical";
  if (caseItem.severity === "warning" || toNumber(caseItem.confidenceScore) < 75) return "warning";
  return "informational";
}

function buildGovernance(workspace) {
  const cases = workspace.cases || [];
  const blockingCases = cases.filter((item) => classifyEscalation(item) === "blocking");
  const criticalCases = cases.filter((item) => classifyEscalation(item) === "critical");
  const reviewerCoverageGaps = cases.filter((item) => item.reviewer === "pending assignment");
  const byType = (type) => cases.filter((item) => item.caseType === type);
  const exposure = (rows) => rows.reduce((total, item) => total + toNumber(item.estimatedExposure), 0);
  const accountingConfidence = cases.length ? cases.reduce((sum, item) => sum + toNumber(item.confidenceScore), 0) / cases.length : 100;
  const rollbackSafety = workspace.executionReadiness?.rollbackSafety || 0;
  return {
    reviewedCoveragePercent: pct(((cases.length - reviewerCoverageGaps.length) / Math.max(1, cases.length)) * 100),
    reviewerCoverageGaps: reviewerCoverageGaps.length,
    unresolvedCriticalFinancialIssues: criticalCases.length + blockingCases.length,
    unresolvedPayoutExposure: exposure(byType("payout_gap")),
    unresolvedStripeReconciliationExposure: exposure(byType("stripe_reconciliation_failure")),
    unresolvedDisputeExposure: exposure(cases.filter((item) => item.blockers?.some((blocker) => String(blocker).toLowerCase().includes("dispute")))),
    unresolvedHostAttributionExposure: exposure(byType("unresolved_host_attribution")),
    unresolvedBookingPaymentMismatches: byType("booking_mismatch").length,
    unresolvedDuplicateRisks: byType("duplicate_risk").length,
    scores: {
      operationalIntegrityScore: pct(workspace.executionReadiness?.overall || 0),
      payoutReadinessScore: blockingCases.length ? 0 : pct(workspace.executionReadiness?.payoutExecutionReadiness || 0),
      stripeReconciliationScore: blockingCases.length ? 0 : pct(workspace.executionReadiness?.stripeReconciliationReadiness || 0),
      rollbackSafetyScore: pct(rollbackSafety),
      accountingConfidenceScore: pct(accountingConfidence),
      promotionReadinessScore: blockingCases.length ? 0 : pct((workspace.executionReadiness?.overall || 0) * 0.9),
    },
  };
}

function buildReadinessMatrix(workspace, governance) {
  const blocking = governance.unresolvedCriticalFinancialIssues > 0;
  const base = workspace.executionReadiness || {};
  const modules = [
    ["AdminExpenses", 92, "Promote after export parity review"],
    ["AdminRecurringExpenses", 88, "Promote after recurring projection review"],
    ["AdminMaintenanceV2", 90, "Ready for continued read-only operation"],
    ["Payment Reconciliation", base.accountingConfidence || 0, "Keep as source of truth for remediation review"],
    ["AdminPayoutsV2", blocking ? 0 : base.payoutExecutionReadiness || 0, "Do not promote until payout blockers are zero"],
    ["AdminPnLV2", blocking ? 0 : governance.scores.promotionReadinessScore, "Do not promote until reconciliation and payout readiness are cleared"],
    ["Profitability Reporting", Math.min(90, governance.scores.accountingConfidenceScore), "Use with unresolved exposure disclosures"],
    ["Financial Exports", 95, "Standardized preview export layer ready"],
  ];
  return modules.map(([module, readiness, recommendation]) => ({
    module,
    currentReadiness: pct(readiness),
    blockers: blocking && ["AdminPayoutsV2", "AdminPnLV2", "Payment Reconciliation"].includes(module) ? ["Blocking financial exceptions remain"] : [],
    unresolvedRisks: governance.unresolvedCriticalFinancialIssues,
    rollbackReadiness: governance.scores.rollbackSafetyScore,
    reconciliationConfidence: governance.scores.accountingConfidenceScore,
    promotionRecommendation: recommendation,
  }));
}

function buildRollbackGovernance(workspace) {
  return (workspace.bundles || []).map((bundle) => ({
    bundleId: bundle.id,
    bundleLabel: bundle.label,
    rollbackDependencyMap: bundle.stagedActionIds.map((id) => ({ stagedActionId: id, dependsOn: ["rollback_snapshot", "reviewer_approval", "conflict_clearance"] })),
    affectedEntityPreview: bundle.affectedRecordsPreview,
    rollbackConfidence: bundle.rollbackConfidence,
    reversibilityClassification: bundle.reversibilityClassification,
    rollbackBlockers: bundle.blockers,
    rollbackAuditSnapshot: {
      generatedAt: workspace.generatedAt,
      generatedBy: workspace.simulatedBy,
      projectedRollbackImpact: bundle.projectedRollbackImpact,
      executionTracePlaceholder: "future_execution_trace_not_enabled",
    },
  }));
}

function buildAuditReadiness(workspace) {
  return (workspace.cases || []).slice(0, 30).map((item) => ({
    stagedRemediationSnapshotId: `snapshot-${item.id}`,
    caseId: item.id,
    beforeSimulationState: item.simulationImpact?.before,
    afterSimulationState: item.simulationImpact?.after,
    projectedFinancialDeltaSnapshot: item.stagedActions?.[0]?.financialDeltaLock,
    reviewerApproverTimeline: item.auditTimeline,
    futureExecutionTracePlaceholder: "reserved_not_enabled",
  }));
}

function buildSafeguards() {
  return [
    ["Dry-run requirement", "blocking", "Every future execution must pass dry-run first"],
    ["Multi-reviewer requirement", "blocking", "Reviewer and approver must be different users"],
    ["Conflict locks", "blocking", "Any unresolved conflict blocks approval"],
    ["Payout duplication locks", "blocking", "Duplicate payout risk blocks payout readiness"],
    ["Stripe reconciliation requirement", "critical", "Stripe-linked actions require a single verified match"],
    ["Rollback snapshot requirement", "blocking", "Rollback snapshot must exist before execution"],
    ["Minimum confidence thresholds", "critical", "Low confidence cases cannot be approved"],
    ["Critical severity escalation rules", "blocking", "Critical or blocking cases halt P&L and payout promotion"],
  ].map(([name, escalation, rule]) => ({ name, escalation, rule, enabledForFutureExecution: true, executingNow: false }));
}

function buildExposure(workspace) {
  const cases = workspace.cases || [];
  const byType = (type) => cases.filter((item) => item.caseType === type).reduce((sum, item) => sum + toNumber(item.estimatedExposure), 0);
  return {
    unresolvedPayoutExposure: byType("payout_gap"),
    unresolvedRevenueExposure: byType("unresolved_payment"),
    unresolvedDisputeExposure: cases.filter((item) => item.blockers?.some((blocker) => String(blocker).toLowerCase().includes("dispute"))).reduce((sum, item) => sum + toNumber(item.estimatedExposure), 0),
    unresolvedStripeReconciliationExposure: byType("stripe_reconciliation_failure"),
    unresolvedProfitabilityExposure: cases.reduce((sum, item) => sum + Math.abs(toNumber(item.stagedActions?.[0]?.financialDeltaLock?.projectedProfitabilityDelta)), 0),
    unresolvedAttributionExposure: byType("unresolved_host_attribution") + byType("unresolved_customer_attribution"),
    unresolvedLegacyExposure: byType("legacy_backfill_payment_row"),
  };
}

export async function loadFinancialGovernanceData() {
  const workspace = await loadManualRemediationWorkspaceData();
  const governance = buildGovernance(workspace);
  const readinessMatrix = buildReadinessMatrix(workspace, governance);
  const blockingCount = governance.unresolvedCriticalFinancialIssues;
  return {
    workspace,
    governance,
    readinessMatrix,
    rollbackGovernance: buildRollbackGovernance(workspace),
    immutableAuditReadiness: buildAuditReadiness(workspace),
    executionSafeguards: buildSafeguards(),
    escalationSummary: ["informational", "warning", "critical", "blocking"].map((level) => ({ level, count: (workspace.cases || []).filter((item) => classifyEscalation(item) === level).length })),
    exposure: buildExposure(workspace),
    exportStandard: ["standardized_source_label", "confidence_label", "synthesized_flag", "legacy_flag", "reconciliation_status", "rollback_classification", "severity", "blocker_state", "remediation_recommendation"],
    finalBlockers: [
      blockingCount ? `${blockingCount} blocking/critical financial issues remain` : null,
      governance.reviewerCoverageGaps ? `${governance.reviewerCoverageGaps} cases still need reviewer assignment` : null,
      governance.unresolvedPayoutExposure ? "Unresolved payout exposure remains" : null,
      governance.unresolvedStripeReconciliationExposure ? "Unresolved Stripe reconciliation exposure remains" : null,
    ].filter(Boolean),
    recommendation: blockingCount === 0 && governance.reviewerCoverageGaps === 0
      ? "A future controlled execution pilot can eventually begin after admin sign-off and dry-run policy approval."
      : "Future controlled execution pilot should remain blocked until critical issues, reviewer gaps, payout exposure, and Stripe reconciliation exposure are cleared.",
  };
}