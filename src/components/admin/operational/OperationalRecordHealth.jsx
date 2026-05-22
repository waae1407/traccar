import React from "react";

export default function OperationalRecordHealth({ currentCount = 0, historicalCount = 0, needsReviewCount = 0, dateFilter = "all" }) {
  const label = String(dateFilter || "all").replaceAll("_", " ");
  const items = [
    { label: "Current records", value: currentCount },
    { label: "Historical records", value: historicalCount },
    { label: "Needs review", value: needsReviewCount },
    { label: "Date filter", value: label },
  ];

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-4 shadow-card">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Record Health</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="text-[10px] uppercase tracking-wider text-white/35">{item.label}</p>
            <p className="text-lg font-bold text-white mt-1 capitalize">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}