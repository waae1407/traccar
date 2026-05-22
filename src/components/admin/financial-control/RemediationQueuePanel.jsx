import React from "react";

const LABELS = {
  payout_gaps: "Payout gaps",
  unresolved_payments: "Unresolved payments",
  booking_mismatches: "Booking mismatches",
  duplicate_risks: "Duplicate risks",
  missing_stripe_ids: "Missing Stripe IDs",
  unresolved_host_attribution: "Unresolved host attribution",
  unresolved_customer_attribution: "Unresolved customer attribution",
};

export default function RemediationQueuePanel({ queue = {} }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Read-only Remediation Queue</p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {Object.entries(LABELS).map(([key, label]) => {
          const items = queue[key] || [];
          return (
            <div key={key} className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-3 py-2 bg-white/[0.03] flex justify-between text-xs font-bold uppercase tracking-wider text-white/40"><span>{label}</span><span>{items.length}</span></div>
              {items.slice(0, 5).map((item) => (
                <div key={item.id} className="px-3 py-2 border-t border-white/[0.05] text-sm">
                  <div className="flex justify-between gap-2"><span className="text-white/70">{item.scenario}</span><span className="text-primary">{item.severity}</span></div>
                  <p className="text-xs text-white/45 mt-1">Impact: ${Number(item.financialImpact || 0).toLocaleString()} · Confidence: {item.confidence} / {Math.round(item.confidenceScore)}</p>
                  <p className="text-xs text-white/35 mt-1">Path: {item.recommendation}</p>
                  {item.blockers?.length > 0 && <p className="text-xs text-red-300 mt-1">Blockers: {item.blockers.slice(0, 2).join("; ")}</p>}
                </div>
              ))}
              {items.length === 0 && <div className="px-3 py-6 text-center text-white/35 text-sm">No items.</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}