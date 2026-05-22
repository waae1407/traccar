import React from "react";

const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function RevenueSeparationPanel({ revenue = {} }) {
  const items = [
    ["Authoritative revenue", revenue.authoritativeRevenue, "Trusted only"],
    ["Partially trusted revenue", revenue.partiallyTrustedRevenue, "Evidence incomplete"],
    ["Unresolved revenue", revenue.unresolvedRevenue, "Not reportable"],
    ["Excluded revenue", revenue.excludedRevenue, "Removed from authority"],
    ["Projected revenue", revenue.projectedRevenue, "Booking-state only"],
    ["Manual/offline revenue", revenue.manualOfflineRevenue, "Receipt review needed"],
    ["Stripe-reconciled revenue", revenue.stripeReconciledRevenue, "Stripe evidence present"],
  ];

  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Authoritative vs Non-Authoritative Revenue</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {items.map(([label, value, note]) => (
          <div key={label} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-xl font-bold text-white mt-1">{money(value)}</p>
            <p className="text-xs text-white/40 mt-1">{note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}