import React from "react";

export default function FinancialExceptionRegistry({ exceptions = [] }) {
  const grouped = exceptions.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Financial Exception Registry</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {Object.entries(grouped).map(([category, count]) => (
          <div key={category} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{category.replaceAll("_", " ")}</p>
            <p className="text-2xl font-bold text-white mt-1">{count}</p>
          </div>
        ))}
      </div>
      <div className="max-h-72 overflow-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03]"><tr>{["Severity", "Category", "Confidence", "Action"].map((h) => <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-white/40">{h}</th>)}</tr></thead>
          <tbody>
            {exceptions.slice(0, 20).map((item) => (
              <tr key={item.id} className="border-t border-white/[0.05]">
                <td className="px-3 py-2 text-white/60">{item.severity}</td>
                <td className="px-3 py-2 text-white/70">{item.category.replaceAll("_", " ")}</td>
                <td className="px-3 py-2 text-white/60">{item.confidence} / {item.confidenceScore}</td>
                <td className="px-3 py-2 text-white/50">{item.recommendedAction}</td>
              </tr>
            ))}
            {exceptions.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-white/40">No exceptions detected.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}