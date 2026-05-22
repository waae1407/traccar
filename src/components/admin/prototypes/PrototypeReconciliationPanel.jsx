import React from "react";

export default function PrototypeReconciliationPanel({ modernCount = 0, legacyCount = 0, unresolvedCount = 0, dateFilter = "all" }) {
  const label = String(dateFilter || "all").replaceAll("_", " ");

  const items = [
    { label: "Modern records", value: modernCount },
    { label: "Legacy records", value: legacyCount },
    { label: "Unresolved records", value: unresolvedCount },
    { label: "Date filter", value: label },
  ];

  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold mb-3">Data Reconciliation</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
            <p className="text-lg font-bold text-white mt-1 capitalize">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}