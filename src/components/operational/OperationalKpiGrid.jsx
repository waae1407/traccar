import React from "react";
import { cn } from "@/lib/utils";

const variantStyles = {
  default: {
    host: "border-gray-100 bg-white text-gray-950",
    admin: "border-white/[0.08] bg-white/[0.04] text-white",
    value: "text-current",
  },
  success: {
    host: "border-emerald-100 bg-emerald-50 text-emerald-700",
    admin: "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400",
    value: "text-emerald-600 admin:text-emerald-400",
  },
  warning: {
    host: "border-yellow-100 bg-yellow-50 text-yellow-700",
    admin: "border-yellow-500/20 bg-yellow-500/[0.06] text-yellow-400",
    value: "text-yellow-600 admin:text-yellow-400",
  },
  danger: {
    host: "border-red-100 bg-red-50 text-red-700",
    admin: "border-red-500/20 bg-red-500/[0.06] text-red-400",
    value: "text-red-600 admin:text-red-400",
  },
  primary: {
    host: "border-pink-100 bg-pink-50 text-pink-700",
    admin: "border-primary/20 bg-primary/[0.06] text-primary",
    value: "text-pink-600 admin:text-primary",
  },
  info: {
    host: "border-blue-100 bg-blue-50 text-blue-700",
    admin: "border-blue-500/20 bg-blue-500/[0.06] text-blue-400",
    value: "text-blue-600 admin:text-blue-400",
  },
};

function formatValue(value, type) {
  if (typeof value === "string") return value;
  if (type === "currency") return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (type === "percent") return `${Number(value || 0).toLocaleString()}%`;
  return Number(value || 0).toLocaleString();
}

export default function OperationalKpiGrid({ mode = "host", metrics = [], columns = "auto", className }) {
  const gridClass = columns === "six" ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6" : "grid-cols-2 lg:grid-cols-4";

  return (
    <div className={cn("grid gap-3", gridClass, className)}>
      {metrics.map((metric) => {
        const Icon = metric.icon;
        const variant = variantStyles[metric.variant || "default"] || variantStyles.default;
        return (
          <button
            key={metric.label}
            type="button"
            onClick={metric.onClick}
            disabled={!metric.onClick}
            className={cn(
              "min-h-[104px] rounded-3xl border p-4 text-left shadow-sm transition-all disabled:cursor-default",
              mode === "admin" ? variant.admin : variant.host,
              metric.onClick && "hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]",
              metric.active && "ring-2 ring-primary/40"
            )}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className={cn("text-[10px] font-bold uppercase tracking-wider leading-tight", mode === "admin" ? "text-white/35" : "text-gray-400")}>{metric.label}</p>
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
            </div>
            <p className={cn("font-syne text-xl font-black leading-tight sm:text-2xl", metric.valueClassName)}>{formatValue(metric.value, metric.type)}</p>
            {metric.note && <p className={cn("mt-1 text-[10px] leading-tight", mode === "admin" ? "text-white/30" : "text-gray-400")}>{metric.note}</p>}
          </button>
        );
      })}
    </div>
  );
}