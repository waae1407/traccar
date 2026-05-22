import React from "react";

const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function DeltaBlock({ preview }) {
  const before = preview?.before || {};
  const after = preview?.after || {};
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      {["integrityScore", "payoutCoverage", "authoritativeRevenuePercent", "unresolvedExposure"].map((key) => (
        <div key={key} className="rounded-lg bg-white/[0.04] p-2">
          <p className="text-white/35 capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
          <p className="text-white/70">{Number(before[key] || 0).toFixed(1)} → {Number(after[key] || 0).toFixed(1)}</p>
        </div>
      ))}
    </div>
  );
}

export default function RemediationSimulationTools({ scenarios = [], readinessScore = 0, recommendation = "" }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold">Planning Tools</p>
          <p className="text-sm text-white/45 mt-1">Review projected cleanup outcomes and operational impact.</p>
        </div>
        <div className="rounded-xl bg-primary/10 border border-primary/20 px-4 py-2 text-right">
          <p className="text-xs text-primary font-bold uppercase">Readiness</p>
          <p className="text-2xl font-black text-white">{Math.round(readinessScore)}%</p>
        </div>
      </div>
      <p className="text-sm text-white/55 mb-4">{recommendation}</p>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {scenarios.slice(0, 9).map((scenario) => (
          <div key={scenario.id} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 space-y-3">
            <div>
              <p className="text-sm font-bold text-white">{scenario.scenario}</p>
              <p className="text-xs text-primary mt-1">{scenario.action.replaceAll("_", " ")}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><p className="text-white/35">Financial</p><p className="text-white/70">{money(scenario.financialImpact)}</p></div>
              <div><p className="text-white/35">Payout</p><p className="text-white/70">{money(scenario.payoutImpact)}</p></div>
              <div><p className="text-white/35">Profit</p><p className="text-white/70">{money(scenario.profitabilityImpact)}</p></div>
            </div>
            <DeltaBlock preview={scenario.integrityDeltaPreview} />
            <p className="text-xs text-white/45">{scenario.recommendation}</p>
            {scenario.conflicts.length > 0 && <p className="text-xs text-red-300">Conflicts: {scenario.conflicts.join(", ")}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}