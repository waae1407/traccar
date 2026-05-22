import React from "react";

const CARDS = [
  ["totalPaymentRows", "Total Payment Rows"],
  ["trustedRows", "Trusted"],
  ["partiallyTrustedRows", "Partially Trusted"],
  ["unresolvedRows", "Unresolved"],
  ["duplicateRiskRows", "Duplicate Risk"],
  ["missingStripeIdRows", "Missing Stripe IDs"],
  ["bookingMismatchRows", "Booking Mismatch"],
  ["payoutMissingRows", "Missing Payouts"],
];

export default function PaymentReconciliationKpis({ summary = {} }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARDS.map(([key, label]) => (
        <div key={key} className="glass rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-white mt-1">{Number(summary[key] || 0).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}