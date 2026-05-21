import React from "react";
import { Search, ChevronDown, X, Download } from "lucide-react";
import { startOfMonth, endOfMonth, subMonths, subDays, startOfDay, endOfDay, startOfYear } from "date-fns";

export const DATE_OPTIONS = [
  { label: "Last 30 Days",  value: "30d" },
  { label: "Today",         value: "today" },
  { label: "Last 7 Days",   value: "7d" },
  { label: "This Month",    value: "this_month" },
  { label: "Last Month",    value: "last_month" },
  { label: "This Year",     value: "year" },
  { label: "All Time",      value: "all" },
];

export const STATUS_OPTIONS = [
  { label: "All Statuses",  value: "" },
  { label: "Pending",       value: "pending" },
  { label: "Processing",    value: "processing" },
  { label: "Paid",          value: "paid" },
  { label: "Held",          value: "held" },
  { label: "Failed",        value: "failed" },
  { label: "Released",      value: "released" },
];

export const DEFAULT_FILTERS = {
  search: "",
  dateRange: "30d",
  status: "",
  vehicleId: "",
};

export function getDateRange(value) {
  const now = new Date();
  switch (value) {
    case "today":      return { from: startOfDay(now), to: endOfDay(now) };
    case "7d":         return { from: subDays(now, 7), to: now };
    case "30d":        return { from: subDays(now, 30), to: now };
    case "this_month": return { from: startOfMonth(now), to: endOfMonth(now) };
    case "last_month": { const lm = subMonths(now, 1); return { from: startOfMonth(lm), to: endOfMonth(lm) }; }
    case "year":       return { from: startOfYear(now), to: now };
    default:           return null;
  }
}

function Sel({ value, onChange, options }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="h-9 pl-3 pr-7 rounded-xl bg-muted/40 border border-border text-xs text-foreground appearance-none focus:outline-none focus:border-primary cursor-pointer">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
    </div>
  );
}

function Chip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/20">
      {label}
      <button onClick={onRemove}><X className="h-2.5 w-2.5" /></button>
    </span>
  );
}

export default function PayoutFilters({ filters, onChange, vehicles = [], onExport, resultCount }) {
  const hasActive = filters.status || filters.vehicleId || filters.dateRange !== "30d" || filters.search;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input type="text" value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
            placeholder="Booking ID, renter, vehicle, payout ID…"
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary" />
        </div>

        <Sel value={filters.dateRange} onChange={v => onChange({ ...filters, dateRange: v })} options={DATE_OPTIONS} />
        <Sel value={filters.status} onChange={v => onChange({ ...filters, status: v })} options={STATUS_OPTIONS} />

        <div className="relative">
          <select value={filters.vehicleId} onChange={e => onChange({ ...filters, vehicleId: e.target.value })}
            className="h-9 pl-3 pr-7 rounded-xl bg-muted/40 border border-border text-xs text-foreground appearance-none focus:outline-none focus:border-primary cursor-pointer">
            <option value="">All Vehicles</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}{v.plate ? ` · ${v.plate}` : ""}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        </div>

        <button onClick={onExport}
          className="h-9 px-3 rounded-xl border border-border bg-muted/40 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all flex items-center gap-1.5 flex-shrink-0">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {(hasActive || resultCount !== undefined) && (
        <div className="flex flex-wrap gap-1.5 items-center">
          {resultCount !== undefined && (
            <span className="text-[10px] text-muted-foreground">{resultCount} record{resultCount !== 1 ? "s" : ""}</span>
          )}
          {hasActive && <span className="text-[10px] text-muted-foreground">·</span>}
          {filters.dateRange !== "30d" && (
            <Chip label={DATE_OPTIONS.find(d => d.value === filters.dateRange)?.label} onRemove={() => onChange({ ...filters, dateRange: "30d" })} />
          )}
          {filters.status && (
            <Chip label={STATUS_OPTIONS.find(s => s.value === filters.status)?.label} onRemove={() => onChange({ ...filters, status: "" })} />
          )}
          {filters.vehicleId && (
            <Chip label={vehicles.find(v => v.id === filters.vehicleId)?.model || "Vehicle"} onRemove={() => onChange({ ...filters, vehicleId: "" })} />
          )}
          {filters.search && (
            <Chip label={`"${filters.search}"`} onRemove={() => onChange({ ...filters, search: "" })} />
          )}
          {hasActive && (
            <button onClick={() => onChange(DEFAULT_FILTERS)} className="text-[10px] text-primary hover:underline font-semibold">
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}