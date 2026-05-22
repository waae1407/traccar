import React from "react";

export default function GovernanceScorePanel({ governance = {} }) {
  const scores = governance.scores || {};
  const cards = [
    ["Operational integrity", scores.operationalIntegrityScore],
    ["Payout readiness", scores.payoutReadinessScore],
    ["Stripe reconciliation", scores.stripeReconciliationReadinessScore],
    ["Rollback safety", scores.rollbackSafetyScore],
    ["Accounting confidence", scores.accountingConfidenceScore],
    ["Remediation completeness", scores.remediationCompletenessScore],
    ["Execution readiness", scores.executionReadinessScore],
    ["Promotion readiness", scores.promotionReadinessScore],
  ];
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Financial Governance Layer</p>
      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        {cards.map(([label, value]) => <div key={label} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="text-2xl font-black text-white mt-1">{Math.round(value || 0)}%</p></div>)}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3 text-sm text-white/55">
        <p>Reviewer gaps: {governance.reviewerCoverageGaps || 0}</p>
        <p>Critical issues: {governance.unresolvedCriticalFinancialIssues || 0}</p>
        <p>Booking mismatches: {governance.unresolvedBookingPaymentMismatches || 0}</p>
        <p>Duplicate risks: {governance.unresolvedDuplicateRisks || 0}</p>
      </div>
    </div>
  );
}