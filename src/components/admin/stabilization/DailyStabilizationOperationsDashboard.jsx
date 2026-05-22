import React from "react";

const ITEMS = [
  ["blockersBySeverity", "Unresolved blockers"],
  ["trustedRevenueGrowth", "Trusted revenue growth"],
  ["payoutExposureTrend", "Payout exposure trend"],
  ["reviewerWorkload", "Reviewer workload"],
  ["reviewerCompletion", "Reviewer completion"],
  ["legacyExposureTrend", "Legacy exposure trend"],
  ["payoutReconciliation", "Payout reconciliation"],
  ["stripeReconciliation", "Stripe reconciliation"],
  ["rollbackReadiness", "Rollback readiness"],
  ["pilotReadiness", "Expansion readiness"],
];

export default function DailyStabilizationOperationsDashboard({ metrics = {} }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Daily Operations Health</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {ITEMS.map(([key, label]) => (
          <div key={key} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-xl font-black text-white mt-1">{metrics[key]?.value || "—"}</p>
            <p className="text-xs text-white/35 mt-2">{metrics[key]?.note || "Monitor daily"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}