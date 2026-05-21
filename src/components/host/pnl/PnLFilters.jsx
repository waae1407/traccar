import React from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { startOfMonth, endOfMonth, startOfYear, subDays, subMonths, format } from "date-fns";

export const DEFAULT_FILTERS = {
  dateRange: "last30",
  vehicleId: "",
  search: "",
};

export function getDateBounds(range) {
  const now = new Date();
  if (range === "last7") return { start: subDays(now, 7), end: now };
  if (range === "last30") return { start: subDays(now, 30), end: now };
  if (range === "last90") return { start: subDays(now, 90), end: now };
  if (range === "this_month") return { start: startOfMonth(now), end: endOfMonth(now) };
  if (range === "last_month") {
    const lm = subMonths(now, 1);
    return { start: startOfMonth(lm), end: endOfMonth(lm) };
  }
  if (range === "this_year") return { start: startOfYear(now), end: now };
  return null; // all time
}

export function getPrevBounds(range) {
  const now = new Date();
  if (range === "last7") return { start: subDays(now, 14), end: subDays(now, 7) };
  if (range === "last30") return { start: subDays(now, 60), end: subDays(now, 30) };
  if (range === "last90") return { start: subDays(now, 180), end: subDays(now, 90) };
  if (range === "this_month") {
    const lm = subMonths(now, 1);
    return { start: startOfMonth(lm), end: endOfMonth(lm) };
  }
  return null;
}

const DATE_OPTS = [
  { value: "last7", label: "Last 7 Days" },
  { value: "last30", label: "Last 30 Days" },
  { value: "last90", label: "Last 90 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
  { value: "", label: "All Time" },
];

function Sel({ value, onChange, options, minW = "120px" }) {
  const active = !!value;
  return (
    <div className="relative flex-shrink-0" style={{ minWidth: minW }}>
      <select value={value} onChange={e => onChange(e.target.value)}
        className={`appearance-none cursor-pointer w-full h-9 pl-3 pr-7 rounded-xl text-xs font-medium focus:outline-none transition-all border ${
          active ? "bg-pink-50 border-pink-400 text-pink-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
        }`}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-gray-400" />
    </div>
  );
}

export default function PnLFilters({ filters, onChange, vehicles = [] }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Sel value={filters.dateRange} onChange={v => onChange({ ...filters, dateRange: v })} options={DATE_OPTS} minW="130px" />
      <div className="relative flex-shrink-0" style={{ minWidth: "150px" }}>
        <select value={filters.vehicleId} onChange={e => onChange({ ...filters, vehicleId: e.target.value })}
          className={`appearance-none cursor-pointer w-full h-9 pl-3 pr-7 rounded-xl text-xs font-medium focus:outline-none transition-all border ${
            filters.vehicleId ? "bg-pink-50 border-pink-400 text-pink-700" : "bg-white border-gray-200 text-gray-600"
          }`}>
          <option value="">All Vehicles</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-gray-400" />
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input value={filters.search} onChange={e => onChange({ ...filters, search: e.target.value })}
          placeholder="Search vehicle, note…"
          className="h-9 pl-9 pr-3 rounded-xl bg-white border border-gray-200 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-pink-400 w-44" />
        {filters.search && <button onClick={() => onChange({ ...filters, search: "" })} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="h-3 w-3 text-gray-400" /></button>}
      </div>
      {(filters.vehicleId || filters.search || filters.dateRange !== "last30") && (
        <button onClick={() => onChange(DEFAULT_FILTERS)}
          className="h-9 px-3 rounded-xl bg-gray-100 text-xs font-semibold text-gray-500 hover:bg-gray-200">
          Reset
        </button>
      )}
    </div>
  );
}