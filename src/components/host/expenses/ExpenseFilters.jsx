import React from "react";
import { Search, X, ChevronDown, Download } from "lucide-react";

export const DEFAULT_FILTERS = {
  search: "",
  vehicleId: "",
  expenseType: "",
  dateRange: "",
  costRange: "",
  reimbursable: "",
};

export const EXPENSE_TYPES = [
  { value: "fuel", label: "Fuel" },
  { value: "insurance", label: "Insurance" },
  { value: "repair", label: "Repair" },
  { value: "cleaning", label: "Cleaning / Detail" },
  { value: "registration", label: "Registration" },
  { value: "toll", label: "Toll" },
  { value: "parking", label: "Parking / Storage" },
  { value: "maintenance", label: "Maintenance" },
  { value: "tires", label: "Tires" },
  { value: "damage", label: "Damage / Dispute" },
  { value: "gps", label: "GPS / Telematics" },
  { value: "other", label: "Other" },
];

export const TYPE_COLORS = {
  fuel: "#f59e0b", insurance: "#3b82f6", repair: "#ef4444", cleaning: "#10b981",
  registration: "#8b5cf6", toll: "#f97316", parking: "#06b6d4", maintenance: "#e11d48",
  tires: "#64748b", damage: "#dc2626", gps: "#0891b2", other: "#6b7280",
};

const DATE_OPTS = [
  { value: "", label: "All Time" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last30", label: "Last 30 Days" },
  { value: "last90", label: "Last 90 Days" },
  { value: "this_year", label: "This Year" },
];

const COST_OPTS = [
  { value: "", label: "All Amounts" },
  { value: "0-100", label: "$0–$100" },
  { value: "100-500", label: "$100–$500" },
  { value: "500-1000", label: "$500–$1k" },
  { value: "1000+", label: "$1k+" },
];

const REIMBURSE_OPTS = [
  { value: "", label: "All" },
  { value: "yes", label: "Reimbursable" },
  { value: "no", label: "Non-Reimbursable" },
];

function Sel({ value, onChange, options, minW = "110px" }) {
  const active = !!value;
  return (
    <div className="relative flex-shrink-0" style={{ minWidth: minW }}>
      <select value={value} onChange={e => onChange(e.target.value)}
        className={`appearance-none cursor-pointer w-full h-9 pl-3 pr-7 rounded-xl text-xs font-medium focus:outline-none transition-all ${
          active ? "bg-pink-50 border-2 border-pink-400 text-pink-700" : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
        }`}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-gray-400" />
    </div>
  );
}

export default function ExpenseFilters({ filters, onChange, vehicles = [], resultCount, onExport, onExportTax }) {
  const hasActive = Object.values(filters).some(v => v !== "");
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input type="text" value={filters.search} onChange={e => onChange({ ...filters, search: e.target.value })}
          placeholder="Search vehicle, description, vendor…"
          className="w-full h-10 pl-10 pr-4 rounded-xl bg-white border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-pink-400" />
        {filters.search && <button onClick={() => onChange({ ...filters, search: "" })} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-gray-400" /></button>}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-shrink-0" style={{ minWidth: "140px" }}>
          <select value={filters.vehicleId} onChange={e => onChange({ ...filters, vehicleId: e.target.value })}
            className={`appearance-none cursor-pointer w-full h-9 pl-3 pr-7 rounded-xl text-xs font-medium focus:outline-none transition-all ${filters.vehicleId ? "bg-pink-50 border-2 border-pink-400 text-pink-700" : "bg-white border border-gray-200 text-gray-600"}`}>
            <option value="">All Vehicles</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-gray-400" />
        </div>
        <Sel value={filters.expenseType} onChange={v => onChange({ ...filters, expenseType: v })}
          options={[{ value: "", label: "All Types" }, ...EXPENSE_TYPES]} minW="130px" />
        <Sel value={filters.dateRange} onChange={v => onChange({ ...filters, dateRange: v })} options={DATE_OPTS} minW="120px" />
        <Sel value={filters.costRange} onChange={v => onChange({ ...filters, costRange: v })} options={COST_OPTS} minW="110px" />
        <Sel value={filters.reimbursable} onChange={v => onChange({ ...filters, reimbursable: v })} options={REIMBURSE_OPTS} minW="130px" />
        {hasActive && <button onClick={() => onChange(DEFAULT_FILTERS)} className="h-9 px-3 rounded-xl bg-gray-100 text-xs font-semibold text-gray-500 hover:bg-gray-200">Clear</button>}
        <div className="flex gap-1.5 ml-auto">
          <button onClick={onExport} className="h-9 px-3 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button onClick={onExportTax} className="h-9 px-3 rounded-xl border border-purple-200 bg-purple-50 text-xs font-bold text-purple-700 hover:bg-purple-100 flex items-center gap-1.5">
            Tax Summary
          </button>
        </div>
      </div>
      {resultCount !== undefined && <p className="text-[11px] text-gray-400">{resultCount} expense{resultCount !== 1 ? "s" : ""}</p>}
    </div>
  );
}