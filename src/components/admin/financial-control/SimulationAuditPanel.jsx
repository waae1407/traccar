import React from "react";

export default function SimulationAuditPanel({ audit = [], simulatedBy = "unknown", generatedAt = "" }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Planning Audit</p>
      <p className="text-sm text-white/45 mb-3">Latest planning review by {simulatedBy} at {String(generatedAt).slice(0, 19).replace("T", " ")}.</p>
      <div className="max-h-72 overflow-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03]"><tr>{["Reviewed by", "When", "Action", "Entities", "Projected deltas"].map((h) => <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-white/40">{h}</th>)}</tr></thead>
          <tbody>
            {audit.map((row, index) => (
              <tr key={`${row.simulatedAction}-${index}`} className="border-t border-white/[0.05]">
                <td className="px-3 py-2 text-white/60">{row.ranBy}</td>
                <td className="px-3 py-2 text-white/45">{String(row.ranAt).slice(0, 19).replace("T", " ")}</td>
                <td className="px-3 py-2 text-white/70">{row.simulatedAction.replaceAll("_", " ")}</td>
                <td className="px-3 py-2 text-white/45 font-mono text-xs">{Object.values(row.affectedEntities || {}).filter(Boolean).join(" · ")}</td>
                <td className="px-3 py-2 text-white/45">Integrity {Number(row.projectedFinancialDeltas?.integrityScore || 0).toFixed(1)}, Exposure {Number(row.projectedFinancialDeltas?.unresolvedExposure || 0).toFixed(1)}</td>
              </tr>
            ))}
            {audit.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-white/35">No planning reviews available.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}