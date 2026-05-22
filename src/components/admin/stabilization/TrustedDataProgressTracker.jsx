import React from "react";

const ITEMS = [
  ["trustedPaymentLogsPercent", "Trusted PaymentLogs"],
  ["partiallyTrustedPercent", "Partially trusted"],
  ["unresolvedPercent", "Unresolved"],
  ["excludedPercent", "Excluded"],
  ["payoutCoveragePercent", "Payout coverage"],
  ["stripeLinkedPaymentPercent", "Stripe-linked payments"],
  ["exportCertificationPercent", "Export certification"],
  ["rollbackCertificationPercent", "Rollback certification"],
];

export default function TrustedDataProgressTracker({ progress = {} }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Trusted Data Progress Tracking</p>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {ITEMS.map(([key, label]) => (
          <div key={key} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-black text-white mt-1">{Math.round(progress[key] || 0)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}