import React from "react";
import { Link } from "react-router-dom";
import { Lock, RotateCcw, ShieldCheck } from "lucide-react";

export default function ProductionActivationStatus({ flag, title = "Live governed stabilization" }) {
  if (!flag) return null;

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="font-bold text-white">{title}: {String(flag.operationalMode || flag.status).replaceAll("_", " ")}</p>
            <p className="text-sm text-white/55">Live certified production · guarded financial execution active · reviewer visibility, exports, audit tracing, and rollback safety retained.</p>
          </div>
        </div>
        <Link to={flag.rollbackPath} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white/70 hover:bg-white/10">
          <RotateCcw className="h-4 w-4" /> Rollback path
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-white/55">
        <span><Lock className="inline h-3 w-3 mr-1" /> Guarded execution</span>
        <span>Exports: {flag.exportsCertified ? "certified" : "blocked"}</span>
        <span>Read-only: {flag.readOnlyEnforced ? "yes" : "no"}</span>
        <span>Confidence labels: {flag.confidenceLabelsRequired ? "required" : "missing"}</span>
      </div>
    </div>
  );
}