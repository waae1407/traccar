import React from "react";

const inputClass = "h-10 rounded-xl bg-card border border-white/[0.08] px-3 text-sm text-white outline-none focus:border-primary/50";

export default function PaymentReconciliationFilters({ filters, onChange, hosts = [], issueTypes = [] }) {
  const set = (key, value) => onChange({ ...filters, [key]: value });

  return (
    <div className="glass rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
      <input className={`${inputClass} xl:col-span-2`} placeholder="Search payment, customer, booking" value={filters.search || ""} onChange={(event) => set("search", event.target.value)} />
      <select className={inputClass} value={filters.hostId || ""} onChange={(event) => set("hostId", event.target.value)}>
        <option value="">All hosts</option>
        {hosts.map((host) => <option key={host.id} value={host.id}>{host.business_name || host.full_name || host.email}</option>)}
      </select>
      <select className={inputClass} value={filters.confidence || ""} onChange={(event) => set("confidence", event.target.value)}>
        <option value="">All confidence</option>
        {['trusted','partially_trusted','unresolved','duplicate_risk','missing_stripe_id','manual_payment','backfill','failed_or_refunded','booking_state_mismatch'].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
      </select>
      <select className={inputClass} value={filters.issueType || ""} onChange={(event) => set("issueType", event.target.value)}>
        <option value="">All issue types</option>
        {issueTypes.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
      </select>
      <select className={inputClass} value={filters.status || ""} onChange={(event) => set("status", event.target.value)}>
        <option value="">All statuses</option>
        {['paid','failed','refunded'].map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <input className={inputClass} type="date" value={filters.dateFrom || ""} onChange={(event) => set("dateFrom", event.target.value)} />
      <input className={inputClass} type="date" value={filters.dateTo || ""} onChange={(event) => set("dateTo", event.target.value)} />
    </div>
  );
}