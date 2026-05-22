import React from "react";

const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function PayoutReadinessPanel({ metrics = {} }) {
  const cards = [
    ["Payout coverage", `${Number(metrics.payoutCoveragePercent || 0).toFixed(1)}%`],
    ["Payout confidence", `${Number(metrics.payoutConfidencePercent || 0).toFixed(1)}%`],
    ["Unresolved payout liability", money(metrics.unresolvedPayoutLiability)],
    ["Historical payout exposure", money(metrics.estimatedHistoricalPayoutExposure)],
    ["Externally unreconcilable revenue", money(metrics.externallyUnreconcilableRevenue)],
  ];

  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Historical Payout Readiness</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-xl font-bold text-white mt-1">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {[['Payout gaps by host', metrics.payoutGapsByHost || []], ['Payout gaps by booking', metrics.payoutGapsByBooking || []]].map(([title, rows]) => (
          <div key={title} className="rounded-xl border border-white/[0.06] overflow-hidden">
            <div className="px-3 py-2 bg-white/[0.03] text-xs font-bold uppercase tracking-wider text-white/40">{title}</div>
            {rows.slice(0, 8).map((row) => (
              <div key={row.id} className="px-3 py-2 border-t border-white/[0.05] flex justify-between gap-3 text-sm">
                <span className="text-white/60 truncate">{row.name || row.id}</span>
                <span className="text-white/70 whitespace-nowrap">{row.count} · {money(row.exposure)}</span>
              </div>
            ))}
            {rows.length === 0 && <div className="px-3 py-6 text-center text-white/35 text-sm">No payout gaps detected.</div>}
          </div>
        ))}
      </div>
    </div>
  );
}