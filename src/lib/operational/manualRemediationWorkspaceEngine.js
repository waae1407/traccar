import { loadRemediationSimulationData } from "@/lib/operational/remediationSimulationEngine";

const toNumber = (value) => Number(value || 0);
const money = (value) => Math.round(toNumber(value) * 100) / 100;

const ACTION_LABELS = {
  payout_backfill_simulation: "Create historical payout",
  confidence_upgrade: "Mark partially trusted",
  duplicate_exclusion_simulation: "Exclude duplicate",
  stripe_reconciliation_match_simulation: "Link Stripe payment",
  booking_state_correction_simulation: "Correct booking state",
  host_attribution_resolution: "Assign host attribution",
  customer_attribution_resolution: "Resolve customer linkage",
  legacy_row_classification_simulation: "Classify legacy/backfill row",
};

function categoryForScenario(scenario) {
  if (scenario.action === "payout_backfill_simulation") return "payout_gap";
  if (scenario.action === "duplicate_exclusion_simulation") return "duplicate_risk";
  if (scenario.action === "stripe_reconciliation_match_simulation") return "stripe_reconciliation_failure";
  if (scenario.action === "booking_state_correction_simulation") return "booking_mismatch";
  if (scenario.conflicts?.includes("conflicting host attribution")) return "unresolved_host_attribution";
  if (scenario.recommendation?.toLowerCase().includes("customer")) return "unresolved_customer_attribution";
  if (scenario.action === "legacy_row_classification_simulation") return "legacy_backfill_payment_row";
  return "unresolved_payment";
}

function approvalLocks(scenario) {
  const locks = [];
  const conflicts = scenario.conflicts || [];
  if (conflicts.includes("duplicate payout creation risk")) locks.push("duplicate payout risk exists");
  if (conflicts.includes("conflicting booking states")) locks.push("unresolved booking conflict exists");
  if (scenario.recommendation?.toLowerCase().includes("dispute")) locks.push("unresolved dispute exists");
  if (conflicts.includes("conflicting host attribution")) locks.push("conflicting host attribution exists");
  if (scenario.recommendation?.toLowerCase().includes("multiple stripe")) locks.push("multiple candidate Stripe matches exist");
  if (conflicts.includes("payout already handled externally")) locks.push("payout already externally handled");
  if (toNumber(scenario.confidenceScore) < 70) locks.push("insufficient confidence");
  return locks;
}

function stagedActionForScenario(scenario) {
  const locks = approvalLocks(scenario);
  return {
    id: `staged-${scenario.id}`,
    label: ACTION_LABELS[scenario.action] || "Review proposed correction",
    actionType: scenario.action,
    executable: false,
    status: locks.length ? "blocked" : "draft",
    approvalSimulation: locks.length ? "approval_blocked" : "eligible_for_review_only",
    rejectionSimulation: "proposal_removed_from_future_execution_queue",
    financialDeltaLock: {
      projectedIntegrityScoreDelta: money(scenario.integrityDeltaPreview?.delta?.integrityScore),
      projectedPayoutDelta: money(scenario.payoutImpact),
      projectedLiabilityDelta: money(-toNumber(scenario.payoutImpact || scenario.financialImpact)),
      projectedProfitabilityDelta: money(scenario.profitabilityImpact),
      projectedUnresolvedExposureDelta: money(scenario.integrityDeltaPreview?.delta?.unresolvedExposure),
    },
    conflictLocks: locks,
  };
}

function caseForScenario(scenario, simulatedBy, generatedAt) {
  const stagedAction = stagedActionForScenario(scenario);
  return {
    id: `case-${scenario.id}`,
    caseType: categoryForScenario(scenario),
    severity: scenario.severity,
    confidence: scenario.confidence,
    confidenceScore: scenario.confidenceScore,
    affectedEntities: scenario.affectedEntities,
    estimatedExposure: money(Math.abs(toNumber(scenario.financialImpact)) + Math.abs(toNumber(scenario.payoutImpact))),
    recommendedAction: stagedAction.label,
    simulationImpact: scenario.integrityDeltaPreview,
    blockers: [...new Set([...(scenario.blockers || []), ...stagedAction.conflictLocks])],
    reviewNotes: "Draft placeholder — no notes saved and no data mutation performed.",
    approvalStatus: "draft",
    reviewer: "pending assignment",
    approver: "pending assignment",
    reviewedAt: null,
    approvalNotes: "Read-only placeholder for future approval notes.",
    stagedActions: [stagedAction],
    auditTimeline: [
      { actor: simulatedBy, at: generatedAt, event: "simulation_created", detail: scenario.scenario },
      { actor: "system", at: generatedAt, event: "staged_proposal_created", detail: `${stagedAction.label} prepared as non-executable draft.` },
    ],
  };
}

function buildBundles(cases) {
  const definitions = [
    ["payout_recovery_bundle", "Payout recovery bundle", ["payout_gap"]],
    ["stripe_reconciliation_bundle", "Stripe reconciliation bundle", ["stripe_reconciliation_failure"]],
    ["legacy_cleanup_bundle", "Legacy cleanup bundle", ["legacy_backfill_payment_row", "duplicate_risk"]],
    ["booking_mismatch_bundle", "Booking mismatch bundle", ["booking_mismatch"]],
  ];
  return definitions.map(([id, label, types]) => {
    const bundleCases = cases.filter((item) => types.includes(item.caseType));
    const blockers = [...new Set(bundleCases.flatMap((item) => item.blockers || []))];
    const payoutDelta = bundleCases.reduce((total, item) => total + toNumber(item.stagedActions?.[0]?.financialDeltaLock?.projectedPayoutDelta), 0);
    const exposureDelta = bundleCases.reduce((total, item) => total + toNumber(item.stagedActions?.[0]?.financialDeltaLock?.projectedUnresolvedExposureDelta), 0);
    return {
      id,
      label,
      simulationOnly: true,
      nonExecutable: true,
      caseCount: bundleCases.length,
      stagedActionIds: bundleCases.flatMap((item) => item.stagedActions.map((action) => action.id)),
      blockers,
      approvalStatus: blockers.length ? "blocked" : "draft",
      projectedRollbackImpact: money(-(payoutDelta + exposureDelta)),
      rollbackConfidence: blockers.length ? "medium" : "high",
      affectedRecordsPreview: bundleCases.slice(0, 8).map((item) => item.affectedEntities),
      reversibilityClassification: blockers.length ? "review_required_before_reversible" : "rollback-safe simulation",
    };
  });
}

function scoreReadiness(cases, bundles) {
  const total = Math.max(1, cases.length);
  const blocked = cases.filter((item) => item.blockers?.length).length;
  const reviewerCoverage = cases.filter((item) => item.reviewer !== "pending assignment").length / total;
  const completeness = (total - blocked) / total;
  const rollbackSafety = bundles.filter((bundle) => bundle.rollbackConfidence === "high").length / Math.max(1, bundles.length);
  const accountingConfidence = cases.reduce((sum, item) => sum + toNumber(item.confidenceScore), 0) / total;
  return {
    remediationCompleteness: Math.round(completeness * 100),
    rollbackSafety: Math.round(rollbackSafety * 100),
    reviewerCoverage: Math.round(reviewerCoverage * 100),
    unresolvedBlockerCount: blocked,
    payoutExecutionReadiness: Math.max(0, Math.round(completeness * 100 - blocked * 3)),
    stripeReconciliationReadiness: Math.max(0, Math.round(accountingConfidence - blocked * 2)),
    accountingConfidence: Math.round(accountingConfidence),
    overall: Math.max(0, Math.round((completeness * 35) + (rollbackSafety * 25) + (reviewerCoverage * 10) + (accountingConfidence * 0.3) - blocked * 2)),
  };
}

export async function loadManualRemediationWorkspaceData() {
  const simulation = await loadRemediationSimulationData();
  const cases = (simulation.scenarios || []).map((scenario) => caseForScenario(scenario, simulation.simulatedBy, simulation.generatedAt));
  const bundles = buildBundles(cases);
  const executionReadiness = scoreReadiness(cases, bundles);
  return {
    generatedAt: simulation.generatedAt,
    simulatedBy: simulation.simulatedBy,
    cases,
    bundles,
    executionReadiness,
    approvalStatuses: ["draft", "under_review", "approved_for_future_execution", "rejected", "blocked"],
    safetyBanners: [
      "Simulation / staging only",
      "No financial actions executed",
      "No Stripe transfers executed",
      "No booking/payment records mutated",
    ],
    recommendation: executionReadiness.overall >= 90 && executionReadiness.unresolvedBlockerCount === 0
      ? "Controlled execution can eventually begin after reviewer assignment, final approval policy, and execution runbooks are completed."
      : "Controlled execution phase should remain blocked until staged cases are reviewed, blockers are cleared, and reviewer coverage is complete.",
  };
}