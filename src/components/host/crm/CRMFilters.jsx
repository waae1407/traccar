import React from "react";
import { Search, X, ChevronDown } from "lucide-react";

export const DEFAULT_FILTERS = {
  search: "",
  status: "",
  rentalType: "",
  paymentStatus: "",
  risk: "",
  vehicleId: "",
};

const STATUS_OPTS = [
  { value: "", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "suspended", label: "Suspended" },
  { value: "under_review", label: "Under Review" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

const RENTAL_OPTS = [
  { value: "", label: "All Types" },
  { value: "weekly", label: "Weekly Rental" },
  { value: "rto", label: "Rent-to-Own" },
];

const PAYMENT_OPTS = [
  { value: "", label: "All Payments" },
  { value: "current", label: "Current" },
  { value: "payment_due", label: "Payment Due" },
  { value: "grace_period", label: "Grace Period" },
  { value: "failed", label: "Failed" },
  { value: "suspended", label: "Suspended" },
];

const RISK_OPTS = [
  { value: "", label: "All Risk Levels" },
  { value: "healthy", label: "Healthy" },
  { value: "needs_attention", label: "Needs Attention" },
  { value: "open_dispute", label: "Open Dispute" },
  { value: "high_risk", label: "High Risk" },
];

function Sel({ value, onChange, options }) {
  const active = !!value;
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none cursor-pointer h-9 pl-3 pr-7 rounded-xl text-xs font-medium focus:outline-none transition-all ${
          active
            ? "bg-pink-50 border-2 border-pink-400 text-pink-700"
            : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
        }`}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-gray-400" />
    </div>
  );
}

export default function CRMFilters({ filters, onChange, vehicles = [], resultCount }) {
  const hasActive = Object.values(filters).some(v => v !== "");

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={filters.search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          placeholder="Search by name, email, phone, booking ID, vehicle…"
          className="w-full h-10 pl-10 pr-4 rounded-xl bg-white border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-pink-400"
        />
        {filters.search && (
          <button onClick={() => onChange({ ...filters, search: "" })} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Sel value={filters.status} onChange={v => onChange({ ...filters, status: v })} options={STATUS_OPTS} />
        <Sel value={filters.rentalType} onChange={v => onChange({ ...filters, rentalType: v })} options={RENTAL_OPTS} />
        <Sel value={filters.paymentStatus} onChange={v => onChange({ ...filters, paymentStatus: v })} options={PAYMENT_OPTS} />
        <Sel value={filters.risk} onChange={v => onChange({ ...filters, risk: v })} options={RISK_OPTS} />
        <div className="relative">
          <select
            value={filters.vehicleId}
            onChange={e => onChange({ ...filters, vehicleId: e.target.value })}
            className={`appearance-none cursor-pointer h-9 pl-3 pr-7 rounded-xl text-xs font-medium focus:outline-none transition-all ${
              filters.vehicleId
                ? "bg-pink-50 border-2 border-pink-400 text-pink-700"
                : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            <option value="">All Vehicles</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-gray-400" />
        </div>
        {hasActive && (
          <button
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="h-9 px-3 rounded-xl bg-gray-100 text-xs font-semibold text-gray-500 hover:bg-gray-200 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {resultCount !== undefined && (
        <p className="text-[11px] text-gray-400">{resultCount} customer{resultCount !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}