import React from "react";

export default function ReviewerSignoffSimulation({ signoffs = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Reviewer Signoff System · Simulation Only</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {signoffs.map((signoff) => (
          <div key={signoff.role} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="font-bold text-white">{signoff.role}</p>
            <p className="text-sm text-white/55 mt-1">{signoff.status}</p>
            <p className="text-xs text-white/35 mt-2">{signoff.requirement}</p>
          </div>
        ))}
      </div>
    </div>
  );
}