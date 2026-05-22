import React from "react";

const LABELS = ["trusted", "partially_trusted", "review_required", "unresolved", "excluded"];

export default function ConfidenceDistributionPanel({ distribution = {}, records = [] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Unified Confidence Framework</p>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {LABELS.map((label) => (
          <div key={label} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label.replaceAll("_", " ")}</p>
            <p className="text-2xl font-bold text-white mt-1">{Number(distribution[label] || 0).toLocaleString()}</p>
          </div>
        ))}
      </div>
      <div className="max-h-64 overflow-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03]"><tr>{["Type", "Confidence", "Score", "Authoritative", "Explanation"].map((h) => <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-white/40">{h}</th>)}</tr></thead>
          <tbody>
            {records.slice(0, 18).map((record, index) => (
              <tr key={`${record.entityType}-${record.entityId}-${index}`} className="border-t border-white/[0.05]">
                <td className="px-3 py-2 text-white/60">{record.entityType}</td>
                <td className="px-3 py-2 text-white/70 capitalize">{String(record.confidenceLabel).replaceAll("_", " ")}</td>
                <td className="px-3 py-2 text-white/60">{Math.round(record.confidenceScore || 0)}</td>
                <td className="px-3 py-2 text-white/60">{record.authoritative ? "Yes" : "No"}</td>
                <td className="px-3 py-2 text-white/45">{record.explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}