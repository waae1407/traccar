import React from "react";

const QUEUES = [
  ["Booking/payment mismatches", ["booking_state_mismatch", "successful_payment_booking_not_paid", "booking_paid_no_successful_paymentlog"]],
  ["Missing payout linkage", ["missing_host_payout", "host_payout_without_source_paymentlog"]],
  ["Manual/backfill rows", ["manual_payment", "backfill"]],
  ["Missing Stripe identifiers", ["missing_stripe_id"]],
  ["Unresolved confidence", []],
];

export default function AdminReviewQueue({ rows = [] }) {
  const queueRows = (types) => rows.filter((row) => {
    if (types.length === 0) return row.confidence === "unresolved";
    return types.some((type) => row.issueTypes?.includes(type));
  });

  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Admin Review Queue</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        {QUEUES.map(([label, types]) => {
          const matches = queueRows(types);
          return (
            <div key={label} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold text-white mt-1">{matches.length}</p>
              <p className="text-xs text-white/40 mt-1">Read-only review</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}