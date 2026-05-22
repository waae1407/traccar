import React from "react";

export default function RemediationPlanningPanel({ actions = [], legacyRows = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Controlled Remediation Planning Layer</p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
          <p className="text-xs uppercase tracking-wider text-white/40 font-bold mb-2">Review-only recommendations</p>
          <ul className="list-disc pl-4 text-sm text-white/60 space-y-1">{actions.map((item) => <li key={item}>{item}</li>)}{actions.length === 0 && <li>No remediation recommendations detected.</li>}</ul>
        </div>
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <div className="px-3 py-2 bg-white/[0.03] text-xs font-bold uppercase tracking-wider text-white/40">Legacy classification expansion</div>
          {legacyRows.slice(0, 8).map((row) => (
            <div key={row.id} className="px-3 py-2 border-t border-white/[0.05] text-sm">
              <div className="flex justify-between gap-3"><span className="font-mono text-xs text-white/50">{row.id}</span><span className="text-primary capitalize">{String(row.classification).replaceAll("_", " ")}</span></div>
              <p className="text-xs text-white/45 mt-1">{row.evidenceSummary}</p>
              <p className="text-xs text-white/35 mt-1">Source: {row.sourceHistory || "unknown"} · External: {row.externalReconcilability}</p>
            </div>
          ))}
          {legacyRows.length === 0 && <div className="px-3 py-6 text-center text-white/35 text-sm">No legacy/manual rows detected.</div>}
        </div>
      </div>
    </div>
  );
}