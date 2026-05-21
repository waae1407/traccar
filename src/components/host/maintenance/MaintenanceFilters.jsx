import React from "react";
import { Search, X, ChevronDown } from "lucide-react";

export const DEFAULT_FILTERS = {
  search: "",
  vehicleId: "",
  status: "",
  serviceType: "",
  dateRange: "",
  costRange: "",
};

const STATUS_OPTS = [
  { value: "", label: "All Statuses" },
  { value: "completed", label: "Completed" },
  { value: "scheduled", label: "Scheduled" },
  { value: "due_soon", label: "Due Soon" },
  { value: "overdue", label: "Overdue" },
  { value: "in_maintenance", label: "In Maintenance" },
];

const SERVICE_TYPE_OPTS = [
  { value: "", label: "All Service Types" },
  { value: "oil_change", label: "Oil Change" },
  { value: "tire_rotation", label: "Tire Rotation" },
  { value: "tire_replacement", label: "Tire Replacement" },
  { value: "brake_service", label: "Brakes" },
  { value: "battery", label: "Battery" },
  { value: "inspection", label: "Inspection" },
  { value: "ac_service", label: "A/C Service" },
  { value: "wash", label: "Cleaning / Detail" },
  { value: "other", label: "Other" },
];

const DATE_RANGE_OPTS = [
  { value: "", label: "All Dates" },
  { value: "today", label: "Today" },
  { value: "next7", label: "Next 7 Days" },
  { value: "next14", label: "Next 14 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last30", label: "Last 30 Days" },
];

const COST_RANGE_OPTS = [
  { value: "", label: "All Costs" },
  { value: "0-100", label: "$0–$100" },
  { value: "100-500", label: "$100–$500" },
  { value: "500+", label: "$500+" },
];

function Sel({ value, onChange, options, minW = "120px" }) {
  const active = !!value;
  return (
    <div className="relative flex-shrink-0" style={{ minWidth: minW }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none cursor-pointer w-full h-9 pl-3 pr-7 rounded-xl text-xs font-medium focus:outline-none transition-all ${
          active ? "bg-pink-50 border-2 border-pink-400 text-pink-700" : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
        }`}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-gray-400" />
    </div>
  );
}

export default function MaintenanceFilters({ filters, onChange, vehicles = [], resultCount }) {
  const hasActive = Object.values(filters).some(v => v !== "");

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={filters.search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          placeholder="Search vehicle, service type, shop, notes…"
          className="w-full h-10 pl-10 pr-4 rounded-xl bg-white border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-pink-400"
        />
        {filters.search && (
          <button onClick={() => onChange({ ...filters, search: "" })} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-shrink-0" style={{ minWidth: "140px" }}>
          <select
            value={filters.vehicleId}
            onChange={e => onChange({ ...filters, vehicleId: e.target.value })}
            className={`appearance-none cursor-pointer w-full h-9 pl-3 pr-7 rounded-xl text-xs font-medium focus:outline-none transition-all ${
              filters.vehicleId ? "bg-pink-50 border-2 border-pink-400 text-pink-700" : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            <option value="">All Vehicles</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-gray-400" />
        </div>
        <Sel value={filters.status} onChange={v => onChange({ ...filters, status: v })} options={STATUS_OPTS} minW="110px" />
        <Sel value={filters.serviceType} onChange={v => onChange({ ...filters, serviceType: v })} options={SERVICE_TYPE_OPTS} minW="130px" />
        <Sel value={filters.dateRange} onChange={v => onChange({ ...filters, dateRange: v })} options={DATE_RANGE_OPTS} minW="120px" />
        <Sel value={filters.costRange} onChange={v => onChange({ ...filters, costRange: v })} options={COST_RANGE_OPTS} minW="110px" />
        {hasActive && (
          <button onClick={() => onChange(DEFAULT_FILTERS)} className="h-9 px-3 rounded-xl bg-gray-100 text-xs font-semibold text-gray-500 hover:bg-gray-200 transition-colors flex-shrink-0">
            Clear all
          </button>
        )}
      </div>

      {resultCount !== undefined && (
        <p className="text-[11px] text-gray-400">{resultCount} record{resultCount !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}