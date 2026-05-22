import React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const inputStyles = {
  host: "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-pink-400",
  admin: "bg-white/[0.06] border-white/[0.1] text-white placeholder:text-white/25 focus:border-primary/50",
};

export default function OperationalFilterBar({
  mode = "host",
  filters = {},
  onChange,
  vehicles = [],
  statuses = [],
  dateRanges = [],
  categories = [],
  placeholder = "Search",
  resultCount,
  totalCount,
  actions,
  className,
}) {
  const set = (key, value) => onChange?.({ ...filters, [key]: value });
  const controlClass = cn("h-10 rounded-xl border px-3 text-sm outline-none transition-colors", inputStyles[mode] || inputStyles.host);

  return (
    <section className={cn("rounded-3xl border p-4 shadow-sm", mode === "admin" ? "border-white/[0.08] bg-white/[0.04] shadow-card" : "border-gray-100 bg-white", className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="relative sm:col-span-2">
          <Search className={cn("absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2", mode === "admin" ? "text-white/30" : "text-gray-400")} />
          <input className={cn(controlClass, "w-full pl-9")} placeholder={placeholder} value={filters.search || ""} onChange={(event) => set("search", event.target.value)} />
        </div>

        {dateRanges.length > 0 && (
          <select className={controlClass} value={filters.dateRange || ""} onChange={(event) => set("dateRange", event.target.value)}>
            {dateRanges.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
          </select>
        )}

        {statuses.length > 0 && (
          <select className={controlClass} value={filters.status || ""} onChange={(event) => set("status", event.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((status) => <option key={status.value || status} value={status.value || status}>{status.label || String(status).replaceAll("_", " ")}</option>)}
          </select>
        )}

        {vehicles.length > 0 && (
          <select className={controlClass} value={filters.vehicleId || ""} onChange={(event) => set("vehicleId", event.target.value)}>
            <option value="">All vehicles</option>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label || `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.trim()}</option>)}
          </select>
        )}

        {categories.length > 0 && (
          <select className={controlClass} value={filters.category || ""} onChange={(event) => set("category", event.target.value)}>
            <option value="">All categories</option>
            {categories.map((category) => <option key={category.value || category} value={category.value || category}>{category.label || category}</option>)}
          </select>
        )}
      </div>

      {(resultCount !== undefined || actions) && (
        <div className={cn("mt-3 flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between", mode === "admin" ? "text-white/35" : "text-gray-400")}>
          {resultCount !== undefined && <span>{Number(resultCount || 0).toLocaleString()} result{resultCount === 1 ? "" : "s"}{totalCount !== undefined ? ` of ${Number(totalCount || 0).toLocaleString()}` : ""}</span>}
          {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
        </div>
      )}
    </section>
  );
}