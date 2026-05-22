import React from "react";

function formatValue(value, type) {
  if (typeof value === "string") return value;
  if (type === "currency") return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (type === "percent") return `${Number(value || 0).toLocaleString()}%`;
  return Number(value || 0).toLocaleString();
}

export default function OperationalMetricGrid({ metrics = [] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        const color = metric.color || "text-white";
        return (
          <div key={metric.label} className={`rounded-3xl border shadow-card p-4 ${metric.bg || "bg-white/[0.04] border-white/[0.08]"}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/35 leading-tight">{metric.label}</p>
              {Icon && <Icon className={`h-4 w-4 ${color}`} />}
            </div>
            <p className={`text-xl sm:text-2xl font-black font-syne ${color}`}>{formatValue(metric.value, metric.type)}</p>
            {metric.note && <p className="text-[10px] text-white/35 mt-1 leading-tight">{metric.note}</p>}
          </div>
        );
      })}
    </div>
  );
}