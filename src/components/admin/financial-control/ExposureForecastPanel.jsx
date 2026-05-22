import React from "react";

const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function ExposureForecastPanel({ forecast = {}, conflicts = [] }) {
  const cards = [
    ["Unresolved payout exposure", money(forecast.unresolvedPayoutExposure)],
    ["Potential host liabilities", money(forecast.potentialHostLiabilities)],
    ["Unreconciled revenue", money(forecast.unreconciledRevenue)],
    ["Untrusted revenue %", `${Number(forecast.untrustedRevenuePercent || 0).toFixed(1)}%`],
    ["Unresolved disputes", forecast.unresolvedDisputes || 0],
    ["Payout recovery workload", forecast.estimatedPayoutRecoveryWorkload || 0],
  ];
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Financial Exposure Forecasting</p>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        {cards.map(([label, value]) => <div key={label} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="text-xl font-bold text-white mt-1">{value}</p></div>)}
      </div>
      <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
        <p className="text-xs uppercase tracking-wider text-red-300 font-bold mb-2">Conflict detection categories</p>
        <div className="flex flex-wrap gap-2">{conflicts.map((item) => <span key={item} className="rounded-full bg-red-500/10 border border-red-500/20 px-2 py-1 text-xs text-red-200">{item}</span>)}{conflicts.length === 0 && <span className="text-sm text-white/45">No simulation conflicts detected.</span>}</div>
      </div>
    </div>
  );
}