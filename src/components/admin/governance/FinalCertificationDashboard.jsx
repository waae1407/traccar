import React from "react";

const LABELS = {
  payoutIntegrity: "Payout safety",
  accountingConfidence: "Accounting confidence",
  rollbackSafety: "Rollback readiness",
  reconciliationCompleteness: "Reconciliation completeness",
  exportConsistency: "Export consistency",
  reviewerReadiness: "Reviewer readiness",
  remediationReadiness: "Remediation readiness",
  executionSafety: "Execution readiness",
};

function statusClass(status) {
  if (status === "certified") return "bg-green-500/10 border-green-500/20 text-green-200";
  if (status === "conditionally_certified") return "bg-yellow-500/10 border-yellow-500/20 text-yellow-100";
  return "bg-red-500/10 border-red-500/20 text-red-200";
}

export default function FinalCertificationDashboard({ certification = {}, exposure = {}, governance = {} }) {
  const scores = certification.certificationScores || {};
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold">Final Readiness Certification Dashboard</p>
          <p className="text-sm text-white/45 mt-1">Dry-run validation only — no financial actions or data mutations executed.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-sm font-bold ${statusClass(certification.status)}`}>{String(certification.status || "blocked").replaceAll("_", " ")}</span>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {Object.entries(LABELS).map(([key, label]) => (
          <div key={key} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-black text-white mt-1">{Math.round(scores[key] || 0)}%</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-sm">
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-white/60">Operational integrity: {Math.round(governance.scores?.operationalIntegrityScore || 0)}%</div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-white/60">Unresolved exposure: ${Math.round((exposure.unresolvedPayoutExposure || 0) + (exposure.unresolvedStripeReconciliationExposure || 0)).toLocaleString()}</div>
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-white/60">Governance confidence: {certification.averageScore || 0}%</div>
      </div>
    </div>
  );
}