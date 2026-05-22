import React from "react";

export default function ExecutionReadinessPanel({ readiness = {}, recommendation = "" }) {
  const cards = [
    ["Overall readiness", `${readiness.overall || 0}%`],
    ["Remediation completeness", `${readiness.remediationCompleteness || 0}%`],
    ["Rollback safety", `${readiness.rollbackSafety || 0}%`],
    ["Reviewer coverage", `${readiness.reviewerCoverage || 0}%`],
    ["Unresolved blockers", readiness.unresolvedBlockerCount || 0],
    ["Payout execution readiness", `${readiness.payoutExecutionReadiness || 0}%`],
    ["Stripe reconciliation readiness", `${readiness.stripeReconciliationReadiness || 0}%`],
    ["Accounting confidence", `${readiness.accountingConfidence || 0}%`],
  ];
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Execution Readiness Scoring</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(([label, value]) => <div key={label} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="text-2xl font-black text-white mt-1">{value}</p></div>)}
      </div>
      <p className="text-sm text-white/55 mt-4">{recommendation}</p>
    </div>
  );
}