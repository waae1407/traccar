import React from "react";
import { SHARED_DATE_RANGES } from "@/lib/operational/sharedOperationalFilters";

const inputClass = "h-10 rounded-xl bg-card border border-white/[0.08] px-3 text-sm text-white outline-none focus:border-primary/50";

export default function PrototypeFilters({ filters, onChange, hosts = [], vehicles = [], categories = [], statuses = [], showVehicle = true, showCostRange = false, showReimbursable = false, showTaxDeductible = false }) {
  const set = (key, value) => onChange({ ...filters, [key]: value });

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 shadow-card">
      <input className={`${inputClass} xl:col-span-2`} placeholder="Search" value={filters.search || ""} onChange={(event) => set("search", event.target.value)} />
      <select className={inputClass} value={filters.hostId || ""} onChange={(event) => set("hostId", event.target.value)}>
        <option value="">All hosts</option>
        {hosts.map((host) => <option key={host.id} value={host.id}>{host.business_name || host.full_name || host.email}</option>)}
      </select>
      {showVehicle && (
        <select className={inputClass} value={filters.vehicleId || ""} onChange={(event) => set("vehicleId", event.target.value)}>
          <option value="">All vehicles</option>
          {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.year} {vehicle.make} {vehicle.model}</option>)}
        </select>
      )}
      <select className={inputClass} value={filters.category || ""} onChange={(event) => set("category", event.target.value)}>
        <option value="">All categories</option>
        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
      {statuses.length > 0 && (
        <select className={inputClass} value={filters.status || ""} onChange={(event) => set("status", event.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
        </select>
      )}
      <select className={inputClass} value={filters.dateRange || "last30"} onChange={(event) => set("dateRange", event.target.value)}>
        {SHARED_DATE_RANGES.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
      </select>
      {showCostRange && (
        <select className={inputClass} value={filters.costRange || ""} onChange={(event) => set("costRange", event.target.value)}>
          <option value="">All amounts</option>
          <option value="0-100">$0–$100</option>
          <option value="100-500">$100–$500</option>
          <option value="500-1000">$500–$1k</option>
          <option value="1000+">$1k+</option>
        </select>
      )}
      {showReimbursable && (
        <select className={inputClass} value={filters.reimbursable || ""} onChange={(event) => set("reimbursable", event.target.value)}>
          <option value="">All reimbursement</option>
          <option value="yes">Reimbursable</option>
          <option value="no">Non-reimbursable</option>
        </select>
      )}
      {showTaxDeductible && (
        <select className={inputClass} value={filters.taxDeductible || ""} onChange={(event) => set("taxDeductible", event.target.value)}>
          <option value="">All tax status</option>
          <option value="yes">Tax deductible</option>
          <option value="no">Not tax deductible</option>
        </select>
      )}
    </div>
  );
}