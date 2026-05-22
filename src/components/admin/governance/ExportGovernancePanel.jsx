import React from "react";

export default function ExportGovernancePanel({ standard = [], authoritativeExportsBlocked = true }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold">Final Export Governance</p>
          <p className="text-sm text-white/45 mt-1">Shared metadata requirements for every financial preview export.</p>
        </div>
        <span className={authoritativeExportsBlocked ? "rounded-full bg-red-500/10 border border-red-500/20 px-3 py-1 text-sm text-red-200" : "rounded-full bg-green-500/10 border border-green-500/20 px-3 py-1 text-sm text-green-200"}>
          {authoritativeExportsBlocked ? "Authoritative exports blocked" : "Authoritative exports review-ready"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {standard.map((field) => <span key={field} className="rounded-full bg-white/[0.06] border border-white/[0.08] px-3 py-1 text-xs text-white/70">{field}</span>)}
      </div>
    </div>
  );
}