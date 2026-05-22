import React from "react";

export default function RemediationBundlesPanel({ bundles = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Remediation Bundles and Rollback Simulation</p>
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3">
        {bundles.map((bundle) => (
          <div key={bundle.id} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-white">{bundle.label}</p>
              <span className="text-xs text-primary uppercase">{bundle.approvalStatus}</span>
            </div>
            <p className="text-xs text-white/45 mt-2">{bundle.caseCount} staged actions · simulation only · non-executable</p>
            <div className="mt-3 space-y-2 text-xs">
              <p className="text-white/60">Rollback impact: {bundle.projectedRollbackImpact}</p>
              <p className="text-white/60">Rollback confidence: {bundle.rollbackConfidence}</p>
              <p className="text-white/60">Reversibility: {bundle.reversibilityClassification}</p>
              <p className="text-white/35">Affected records preview: {bundle.affectedRecordsPreview.length}</p>
            </div>
            {bundle.blockers.length > 0 && <p className="text-xs text-red-300 mt-3">Blocked by: {bundle.blockers.slice(0, 3).join("; ")}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}