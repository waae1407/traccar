import React from "react";

export default function ReadinessMatrixPanel({ matrix = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Controlled Execution Readiness Matrix</p>
      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03]"><tr>{["Module", "Readiness", "Risks", "Rollback", "Confidence", "Recommendation", "Blockers"].map((h) => <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-white/40">{h}</th>)}</tr></thead>
          <tbody>
            {matrix.map((row) => <tr key={row.module} className="border-t border-white/[0.05]"><td className="px-3 py-2 font-bold text-white">{row.module}</td><td className="px-3 py-2 text-primary font-bold">{row.currentReadiness}%</td><td className="px-3 py-2 text-white/55">{row.unresolvedRisks}</td><td className="px-3 py-2 text-white/55">{row.rollbackReadiness}%</td><td className="px-3 py-2 text-white/55">{row.reconciliationConfidence}%</td><td className="px-3 py-2 text-white/55">{row.promotionRecommendation}</td><td className="px-3 py-2 text-red-300">{row.blockers.join("; ") || "—"}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}