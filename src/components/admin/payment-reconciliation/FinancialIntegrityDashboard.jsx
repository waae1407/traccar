import React from "react";

function money(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function FinancialIntegrityDashboard({ summary = {} }) {
  const items = [
    ["Total collected payments", money((summary.authoritativeCollectedTotal || 0) + (summary.nonAuthoritativeCollectedTotal || 0)), "All successful PaymentLog rows"],
    ["Trusted collected revenue", money(summary.authoritativeCollectedTotal), "Authoritative"],
    ["Partially trusted revenue", money(summary.manualBackfillTotal), "Non-authoritative"],
    ["Unresolved revenue", money(summary.unresolvedTotal), "Non-authoritative"],
    ["Excluded revenue", money(summary.excludedRevenueTotal), "Excluded"],
    ["Stripe-reconciled revenue", money(summary.stripeReconciledTotal), "Authoritative evidence"],
    ["Manual/backfill revenue", money(summary.manualBackfillTotal), "Needs review"],
    ["Payout coverage", `${Number(summary.payoutCoveragePercent || 0).toFixed(1)}%`, "Coverage"],
    ["Unresolved payout liabilities", money(summary.unresolvedPayoutLiabilities), "Preview only"],
    ["Booking mismatches", summary.bookingMismatchCount || 0, "Blocks promotion"],
    ["Duplicate risk", summary.duplicateRiskCount || 0, "Blocks promotion"],
    ["Unresolved host attribution", summary.unresolvedHostAttributionCount || 0, "Needs review"],
    ["Unresolved customer attribution", summary.unresolvedCustomerAttributionCount || 0, "Needs review"],
  ];

  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Financial Integrity Dashboard</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {items.map(([label, value, note]) => (
          <div key={label} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-xl font-bold text-white mt-1">{value}</p>
            <p className="text-xs text-white/40 mt-1">{note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}