import React from "react";

export default function RollbackGovernancePanel({ rollback = [], audit = [], safeguards = [] }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="glass rounded-2xl p-4 xl:col-span-2">
        <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Rollback Readiness</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rollback.map((item) => <div key={item.bundleId} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3"><p className="font-bold text-white">{item.bundleLabel}</p><p className="text-xs text-white/45 mt-1">Confidence: {item.rollbackConfidence} · {item.reversibilityClassification}</p><p className="text-xs text-white/45 mt-1">Dependencies: {item.rollbackDependencyMap.length}</p><p className="text-xs text-red-300 mt-2">{item.rollbackBlockers.join("; ") || "No rollback blockers"}</p></div>)}
        </div>
      </div>
      <div className="glass rounded-2xl p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Audit and Safeguards</p>
        <p className="text-sm text-white/55 mb-3">{audit.length} audit snapshots available.</p>
        <div className="space-y-2 max-h-72 overflow-auto">
          {safeguards.map((item) => <div key={item.name} className="rounded-lg bg-white/[0.04] p-2"><p className="text-sm text-white/75">{item.name}</p><p className="text-xs text-white/40">{item.escalation} · {item.rule}</p></div>)}
        </div>
      </div>
    </div>
  );
}