import React from "react";

function money(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function ReconciliationTotals({ summary = {} }) {
  const items = [
    ["Authoritative total", money(summary.authoritativeCollectedTotal)],
    ["Non-authoritative total", money(summary.nonAuthoritativeCollectedTotal)],
    ["Stripe-reconciled total", money(summary.stripeReconciledTotal)],
    ["Manual/backfill total", money(summary.manualBackfillTotal)],
    ["Unresolved total", money(summary.unresolvedTotal)],
    ["Payout coverage", `${Number(summary.payoutCoveragePercent || 0).toFixed(1)}%`],
    ["Reconciliation confidence", `${Number(summary.reconciliationConfidencePercent || 0).toFixed(1)}%`],
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-white mt-1">{value}</p>
        </div>
      ))}
    </div>
  );
}