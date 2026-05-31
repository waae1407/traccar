import React from "react";
import { Search } from "lucide-react";
import { DOMAINS } from "./unifiedOpsModel";

const severities = ["all", "critical", "high", "medium", "low", "info"];
const roles = ["all", "admin", "host", "customer", "installer", "system"];

export default function UnifiedOpsFilters({ filters, setFilters, hosts = [], vehicles = [] }) {
  const update = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input value={filters.search} onChange={e => update("search", e.target.value)} placeholder="Search operations, alerts, events, customers, vehicles…" className="h-11 w-full rounded-2xl border border-white/10 bg-white/10 pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/30" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-10">
        <select value={filters.domain} onChange={e => update("domain", e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"><option value="all">All domains</option>{DOMAINS.filter(d => d !== "all").map(d => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}</select>
        <select value={filters.severity} onChange={e => update("severity", e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white">{severities.map(s => <option key={s} value={s}>{s} severity</option>)}</select>
        <input value={filters.status} onChange={e => update("status", e.target.value)} placeholder="Status" className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/30" />
        <select value={filters.assignedRole} onChange={e => update("assignedRole", e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white">{roles.map(r => <option key={r} value={r}>{r} role</option>)}</select>
        <input value={filters.sourceType} onChange={e => update("sourceType", e.target.value)} placeholder="Source type" className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/30" />
        <select value={filters.host} onChange={e => update("host", e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"><option value="">Any host</option>{hosts.map(h => <option key={h.id} value={h.id}>{h.business_name || h.full_name || h.email}</option>)}</select>
        <input value={filters.customer} onChange={e => update("customer", e.target.value)} placeholder="Customer" className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/30" />
        <select value={filters.vehicle} onChange={e => update("vehicle", e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"><option value="">Any vehicle</option>{vehicles.map(v => <option key={v.id} value={v.id}>{[v.year, v.make, v.model].filter(Boolean).join(" ") || v.vin}</option>)}</select>
        <input value={filters.booking} onChange={e => update("booking", e.target.value)} placeholder="Booking ID" className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/30" />
        <input value={filters.alertType} onChange={e => update("alertType", e.target.value)} placeholder="Alert type" className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/30" />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <input value={filters.provider} onChange={e => update("provider", e.target.value)} placeholder="Provider" className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/30" />
        <input type="date" value={filters.from} onChange={e => update("from", e.target.value)} className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white" />
        <input type="date" value={filters.to} onChange={e => update("to", e.target.value)} className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white" />
      </div>
    </div>
  );
}