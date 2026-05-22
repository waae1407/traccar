import React from "react";

export default function IntegrityScorePanel({ integrity = {}, recommendation = "" }) {
  const components = integrity.components || {};
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold">Financial Integrity Scoring</p>
          <h2 className="text-4xl font-black text-white mt-2">{Math.round(integrity.score || 0)}%</h2>
          <p className="text-sm text-white/45 mt-1">{recommendation}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 flex-1">
          {Object.entries(components).map(([key, value]) => (
            <div key={key} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{key.replace(/([A-Z])/g, ' $1')}</p>
              <p className="text-lg font-bold text-white mt-1">{Math.round(value)}%</p>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-xs uppercase tracking-wider text-red-300 font-bold mb-2">Blockers</p>
          <ul className="list-disc pl-4 text-sm text-white/55 space-y-1">{(integrity.blockers || []).map((item) => <li key={item}>{item}</li>)}{!integrity.blockers?.length && <li>No blockers detected.</li>}</ul>
        </div>
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
          <p className="text-xs uppercase tracking-wider text-white/40 font-bold mb-2">Remediation categories</p>
          <div className="flex flex-wrap gap-2">{(integrity.remediationCategories || []).map((item) => <span key={item} className="rounded-full bg-primary/10 border border-primary/20 px-2 py-1 text-xs text-primary">{item.replaceAll("_", " ")}</span>)}</div>
        </div>
      </div>
    </div>
  );
}