import React from "react";

function formatValue(value, type) {
  if (type === "currency") return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return Number(value || 0).toLocaleString();
}

export default function PrototypeMetricGrid({ metrics = [] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="glass rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{metric.label}</p>
          <p className="text-2xl font-bold text-foreground mt-2">{formatValue(metric.value, metric.type)}</p>
          {metric.note && <p className="text-xs text-muted-foreground mt-1">{metric.note}</p>}
        </div>
      ))}
    </div>
  );
}