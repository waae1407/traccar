import React from "react";

export default function ExecutionGatePanel({ gates = [] }) {
  const blocked = gates.filter((gate) => gate.status === "blocked");
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold">Operational Controls</p>
          <p className="text-sm text-white/45 mt-1">Review control status, thresholds, and required operational checks.</p>
        </div>
        <span className="rounded-full bg-red-500/10 border border-red-500/20 px-3 py-1 text-sm text-red-200">{blocked.length} blocking gates</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {gates.map((gate) => (
          <div key={gate.name} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-white">{gate.name}</p>
              <span className={gate.status === "blocked" ? "text-red-300 text-xs uppercase" : "text-green-300 text-xs uppercase"}>{gate.status}</span>
            </div>
            <p className="text-xs text-white/45 mt-2">{gate.reason}</p>
            <p className="text-xs text-white/35 mt-2">Threshold: {gate.threshold}</p>
          </div>
        ))}
      </div>
    </div>
  );
}