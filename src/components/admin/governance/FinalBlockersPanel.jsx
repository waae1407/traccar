import React from "react";

export default function FinalBlockersPanel({ blockers = [], recommendation = "" }) {
  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-red-300 font-bold mb-3">Final blockers before any controlled execution pilot</p>
      <ul className="space-y-2 text-sm text-red-100/80 list-disc pl-5">
        {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
        {blockers.length === 0 && <li>No final blockers detected in simulation, pending admin policy approval.</li>}
      </ul>
      <p className="text-sm text-white/60 mt-4">{recommendation}</p>
    </div>
  );
}