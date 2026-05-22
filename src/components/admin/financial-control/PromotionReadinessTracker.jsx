import React from "react";

export default function PromotionReadinessTracker({ items = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Promotion Readiness Tracker</p>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
        {items.map((item) => (
          <div key={item.area} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-white">{item.area}</p>
              <span className="text-xs text-primary font-bold">{item.readiness}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden mt-3"><div className="h-full bg-primary" style={{ width: `${Math.min(100, item.readiness)}%` }} /></div>
            <p className="text-xs text-white/45 mt-3">Rollback: {item.rollbackReadiness} · Confidence: {item.rollbackConfidence || "high"}</p>
            <p className="text-xs text-white/45">Status: {item.reconciliationStatus}</p>
            <p className="text-xs text-white/45">Remediation: {Math.round(item.remediationReadiness || item.readiness)}% · Simulation: {Math.round(item.simulationConfidence || item.readiness)}%</p>
            <p className="text-xs text-white/45">Payout recovery: {Math.round(item.payoutRecoveryReadiness || item.readiness)}% · External recon: {Math.round(item.externalReconciliationReadiness || item.readiness)}%</p>
            <p className="text-xs text-white/35 mt-2">{(item.blockers || []).slice(0, 2).join(" ") || "No active blockers."}</p>
          </div>
        ))}
      </div>
    </div>
  );
}