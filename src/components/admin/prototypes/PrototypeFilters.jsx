import React from "react";
import { SHARED_DATE_RANGES } from "@/lib/operational/sharedOperationalFilters";

const inputClass = "h-10 rounded-xl bg-card border border-white/[0.08] px-3 text-sm text-white outline-none focus:border-primary/50";

export default function PrototypeFilters({ filters, onChange, hosts = [], vehicles = [], categories = [], statuses = [], showVehicle = true }) {
  const set = (key, value) => onChange({ ...filters, [key]: value });

  return (
    <div className="glass rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
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
    </div>
  );
}