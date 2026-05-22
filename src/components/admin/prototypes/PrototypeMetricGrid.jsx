import React from "react";

function formatValue(value, type) {
  if (type === "currency") return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return Number(value || 0).toLocaleString();
}

export default function PrototypeMetricGrid({ metrics = [] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-4 shadow-card">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{metric.label}</p>
          <p className="text-2xl font-black text-foreground mt-2 font-syne">{formatValue(metric.value, metric.type)}</p>
          {metric.note && <p className="text-xs text-muted-foreground mt-1">{metric.note}</p>}
        </div>
      ))}
    </div>
  );
}