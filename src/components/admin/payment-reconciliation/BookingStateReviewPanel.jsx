import React from "react";

const REVIEW_TYPES = [
  ["Payment on failed/suspended booking", "booking_state_mismatch"],
  ["Paid booking without payment", "booking_paid_no_successful_paymentlog"],
  ["Amount mismatch", "amount_mismatch"],
  ["Duplicate risk", "duplicate_risk"],
];

export default function BookingStateReviewPanel({ rows = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Booking State Review</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {REVIEW_TYPES.map(([label, type]) => {
          const matches = rows.filter((row) => row.issueTypes?.includes(type));
          return (
            <div key={type} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold text-white mt-1">{matches.length}</p>
              <p className="text-xs text-white/40 mt-1">Requires evidence before any correction</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}