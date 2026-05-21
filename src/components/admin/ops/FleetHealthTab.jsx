import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Wrench, DollarSign, AlertTriangle, ChevronDown, Search, X, RefreshCw } from "lucide-react";
import { format, subDays, startOfMonth, differenceInDays } from "date-fns";

const SERVICE_LABELS = {
  oil_change: "Oil Change", tire_rotation: "Tire Rotation", brake_service: "Brake Service",
  inspection: "Inspection", wash: "Wash / Detail", tire_replacement: "Tire Replacement",
  battery: "Battery", ac_service: "A/C Service", other: "Other",
};

const EXPENSE_TYPE_LABELS = {
  fuel: "Fuel", insurance: "Insurance", repair: "Repair", cleaning: "Cleaning",
  registration: "Registration", toll: "Toll", parking: "Parking", maintenance: "Maintenance",
  tires: "Tires", damage: "Damage", gps: "GPS", other: "Other",
};

const RECURRING_CATS = {
  insurance: "Insurance", gps_subscription: "GPS Subscription", loan_payment: "Loan",
  storage_parking: "Storage/Parking", software_tools: "Software", service_contract: "Contract",
  registration: "Registration", fuel: "Fuel", cleaning: "Cleaning", other: "Other",
};

function fmt(n) { return (n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
function fmtDate(d) { if (!d) return "\u2014"; try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; } }

function Sel({ value, onChange, options, placeholder }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className={"appearance-none h-9 pl-3 pr-7 rounded-xl text-xs font-medium focus:outline-none transition-all border cursor-pointer " + (value ? "bg-primary/10 border-primary/40 text-primary" : "bg-card border-border text-muted-foreground")}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
    </div>
  );
}

function KpiCard({ value, label, color = "text-foreground", bg = "bg-card border-border" }) {
  return (
    <div className={"rounded-2xl border p-4 " + bg}>
      <p className={"text-2xl font-black " + color} style={{ fontFamily: "var(--font-syne)" }}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

const DATE_OPTIONS = [
  { value: "last7", label: "Last 7 Days" },
  { value: "last30", label: "Last 30 Days" },
  { value: "last90", label: "Last 90 Days" },
  { value: "this_month", label: "This Month" },
  { value: "", label: "All Time" },
];

export default function FleetHealthTab() {
  const [activeView, setActiveView] = useState("maintenance");
  const [hostFilter, setHostFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [dateRange, setDateRange] = useState("last30");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: allHosts = [] } = useQuery({
    queryKey: ["admin-fleet-hosts"],
    queryFn: () => base44.entities.Host.list("-created_date", 200),
  });

  const { data: allVehicles = [] } = useQuery({
    queryKey: ["admin-fleet-vehicles"],
    queryFn: () => base44.entities.Vehicle.list("-created_date", 500),
  });

  const { data: maintenanceLogs = [], isLoading: loadingMaint } = useQuery({
    queryKey: ["admin-fleet-maint", hostFilter],
    queryFn: () => hostFilter
      ? base44.entities.HostMaintenanceLog.filter({ host_id: hostFilter }, "-date", 300)
      : base44.entities.HostMaintenanceLog.list("-date", 300),
    enabled: activeView === "maintenance",
  });

  const { data: allExpenses = [], isLoading: loadingExp } = useQuery({
    queryKey: ["admin-fleet-expenses", hostFilter],
    queryFn: () => hostFilter
      ? base44.entities.HostExpense.filter({ host_id: hostFilter }, "-date", 300)
      : base44.entities.HostExpense.list("-date", 300),
    enabled: activeView === "expenses",
  });

  const { data: allRecurring = [], isLoading: loadingRec } = useQuery({
    queryKey: ["admin-fleet-recurring", hostFilter],
    queryFn: () => hostFilter
      ? base44.entities.RecurringExpense.filter({ host_id: hostFilter }, "-created_date", 300)
      : base44.entities.RecurringExpense.list("-created_date", 300),
    enabled: activeView === "recurring",
  });

  // Always load both for KPIs
  const { data: allMaintForKpi = [] } = useQuery({
    queryKey: ["admin-fleet-maint-kpi"],
    queryFn: () => base44.entities.HostMaintenanceLog.list("-date", 300),
  });
  const { data: allExpForKpi = [] } = useQuery({
    queryKey: ["admin-fleet-exp-kpi"],
    queryFn: () => base44.entities.HostExpense.list("-date", 300),
  });

  const hostMap = useMemo(() => Object.fromEntries(allHosts.map(h => [h.id, h])), [allHosts]);
  const vehicleMap = useMemo(() => Object.fromEntries(allVehicles.map(v => [v.id, v])), [allVehicles]);

  const dateStart = useMemo(() => {
    if (dateRange === "last7") return subDays(new Date(), 7);
    if (dateRange === "last30") return subDays(new Date(), 30);
    if (dateRange === "last90") return subDays(new Date(), 90);
    if (dateRange === "this_month") return startOfMonth(new Date());
    return null;
  }, [dateRange]);

  const filteredMaint = useMemo(() => maintenanceLogs.filter(m => {
    if (vehicleFilter && m.vehicle_id !== vehicleFilter) return false;
    if (dateStart && m.date && new Date(m.date) < dateStart) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(m.vehicle_name || "").toLowerCase().includes(q) &&
          !(SERVICE_LABELS[m.service_type] || "").toLowerCase().includes(q) &&
          !(m.shop_name || "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [maintenanceLogs, vehicleFilter, dateStart, search]);

  const filteredExp = useMemo(() => allExpenses.filter(e => {
    if (vehicleFilter && e.vehicle_id !== vehicleFilter) return false;
    if (dateStart && e.date && new Date(e.date) < dateStart) return false;
    if (categoryFilter && e.expense_type !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(e.vehicle_name || "").toLowerCase().includes(q) &&
          !(EXPENSE_TYPE_LABELS[e.expense_type] || "").toLowerCase().includes(q) &&
          !(e.description || "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [allExpenses, vehicleFilter, dateStart, search, categoryFilter]);

  const filteredRecurring = useMemo(() => allRecurring.filter(r => {
    if (hostFilter && r.host_id !== hostFilter) return false;
    if (vehicleFilter && r.vehicle_id !== vehicleFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (categoryFilter && r.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(r.vehicle_name || "").toLowerCase().includes(q) && !(r.vendor || "").toLowerCase().includes(q) && !(RECURRING_CATS[r.category] || "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [allRecurring, hostFilter, vehicleFilter, statusFilter, categoryFilter, search]);

  const kpis = useMemo(() => {
    const inMaintenance = allVehicles.filter(v => v.status === "Maintenance").length;
    const today = new Date();
    const overdue = allMaintForKpi.filter(m => {
      if (m.next_service_date && new Date(m.next_service_date) < today) return true;
      const v = vehicleMap[m.vehicle_id];
      if (m.next_service_mileage && v?.mileage && m.next_service_mileage <= v.mileage) return true;
      return false;
    }).length;
    const totalExpenseCost = allExpForKpi.reduce((s, e) => s + (e.amount || 0), 0);
    const totalMaintCost = allMaintForKpi.reduce((s, m) => s + (m.cost || 0), 0);
    const overdueByHost = {};
    allMaintForKpi.forEach(m => {
      const isOverdue = m.next_service_date && new Date(m.next_service_date) < today;
      if (isOverdue && m.host_id) overdueByHost[m.host_id] = (overdueByHost[m.host_id] || 0) + 1;
    });
    return { inMaintenance, overdue, totalExpenseCost, totalMaintCost, hostsWithIssues: Object.keys(overdueByHost).length };
  }, [allVehicles, allMaintForKpi, allExpForKpi, vehicleMap]);

  const problematicHosts = useMemo(() => {
    const hostData = {};
    allExpForKpi.forEach(e => {
      if (!e.host_id) return;
      if (!hostData[e.host_id]) hostData[e.host_id] = { repairs: 0, totalCost: 0 };
      if (["repair", "damage"].includes(e.expense_type)) hostData[e.host_id].repairs++;
      hostData[e.host_id].totalCost += (e.amount || 0);
    });
    return Object.entries(hostData)
      .filter(([, d]) => d.repairs >= 3 || d.totalCost >= 2000)
      .map(([hid, d]) => ({ hostId: hid, host: hostMap[hid], ...d }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 5);
  }, [allExpForKpi, hostMap]);

  const hostOptions = allHosts.map(h => ({ value: h.id, label: h.full_name + (h.business_name ? " \u00b7 " + h.business_name : "") }));
  const vehicleOptions = (hostFilter ? allVehicles.filter(v => v.host_id === hostFilter) : allVehicles)
    .map(v => ({ value: v.id, label: v.year + " " + v.make + " " + v.model + (v.plate ? " (" + v.plate + ")" : "") }));

  const clearFilters = () => { setHostFilter(""); setVehicleFilter(""); setSearch(""); setCategoryFilter(""); setStatusFilter(""); };
  const hasFilters = hostFilter || vehicleFilter || search || categoryFilter || statusFilter;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard value={kpis.inMaintenance} label="In Maintenance" color="text-orange-400" bg="bg-orange-500/10 border-orange-500/20" />
        <KpiCard value={kpis.overdue} label="Overdue Services" color={kpis.overdue > 0 ? "text-red-400" : "text-muted-foreground"} bg={kpis.overdue > 0 ? "bg-red-500/10 border-red-500/20" : "bg-card border-border"} />
        <KpiCard value={kpis.hostsWithIssues} label="Hosts w/ Issues" color={kpis.hostsWithIssues > 0 ? "text-yellow-400" : "text-muted-foreground"} bg={kpis.hostsWithIssues > 0 ? "bg-yellow-500/10 border-yellow-500/20" : "bg-card border-border"} />
        <KpiCard value={"$" + fmt(kpis.totalMaintCost)} label="Maintenance Costs" />
        <KpiCard value={"$" + fmt(kpis.totalExpenseCost)} label="Fleet Expenses" />
      </div>

      {/* Problematic Hosts */}
      {problematicHosts.length > 0 && (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            <p className="text-xs font-bold text-yellow-300 uppercase tracking-wider">Hosts Needing Attention</p>
          </div>
          <div className="space-y-1.5">
            {problematicHosts.map(({ hostId, host, repairs, totalCost }) => (
              <div key={hostId} className="flex items-center justify-between bg-card/40 rounded-xl px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">{host?.full_name || hostId}</p>
                  <p className="text-[10px] text-muted-foreground">{host?.business_name || host?.email}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-red-400">${fmt(totalCost)}</p>
                  {repairs >= 3 && <p className="text-[10px] text-orange-400">{repairs} repairs</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View toggle + filters */}
      <div className="space-y-3">
        <div className="flex gap-1 flex-wrap">
          {[["maintenance", "Maintenance"], ["expenses", "Expenses"], ["recurring", "Recurring"]].map(([id, label]) => (
            <button key={id} onClick={() => { setActiveView(id); setCategoryFilter(""); setStatusFilter(""); }}
              className={"px-4 py-2 rounded-xl text-xs font-bold transition-colors " + (activeView === id ? "text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted/40")}
              style={activeView === id ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search\u2026"
              className="h-9 pl-9 pr-3 rounded-xl bg-card border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 w-44" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="h-3 w-3 text-muted-foreground" /></button>}
          </div>
          <Sel value={hostFilter} onChange={v => { setHostFilter(v); setVehicleFilter(""); }} options={hostOptions} placeholder="All Hosts" />
          <Sel value={vehicleFilter} onChange={setVehicleFilter} options={vehicleOptions} placeholder="All Vehicles" />
          {activeView === "expenses" && (
            <Sel value={categoryFilter} onChange={setCategoryFilter}
              options={Object.entries(EXPENSE_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              placeholder="All Categories" />
          )}
          {activeView === "recurring" && (
            <>
              <Sel value={categoryFilter} onChange={setCategoryFilter}
                options={Object.entries(RECURRING_CATS).map(([v, l]) => ({ value: v, label: l }))}
                placeholder="All Categories" />
              <Sel value={statusFilter} onChange={setStatusFilter}
                options={[{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "cancelled", label: "Cancelled" }]}
                placeholder="All Statuses" />
            </>
          )}
          <Sel value={dateRange} onChange={setDateRange} options={DATE_OPTIONS} placeholder="Date Range" />
          {hasFilters && (
            <button onClick={clearFilters}
              className="h-9 px-3 rounded-xl border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Maintenance Table */}
      {activeView === "maintenance" && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Maintenance Records</h3>
            <p className="text-xs text-muted-foreground">{filteredMaint.length} records</p>
          </div>
          {loadingMaint ? (
            <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-xl bg-muted/30 animate-pulse" />)}</div>
          ) : filteredMaint.length === 0 ? (
            <div className="text-center py-12"><Wrench className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">No records found.</p></div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredMaint.map(m => {
                const host = hostMap[m.host_id];
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-foreground">{m.vehicle_name || "Unknown Vehicle"}</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground capitalize">{SERVICE_LABELS[m.service_type] || m.service_type}</span>
                        {m.status === "overdue" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">Overdue</span>}
                      </div>
                      <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground">
                        <span>{fmtDate(m.date)}</span>
                        {host && <span>{host.full_name}{host.business_name ? " \u00b7 " + host.business_name : ""}</span>}
                        {m.shop_name && <span>{m.shop_name}</span>}
                      </div>
                    </div>
                    <p className="text-sm font-bold text-foreground flex-shrink-0">{m.cost ? "$" + fmt(m.cost) : "\u2014"}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Expenses Table */}
      {activeView === "expenses" && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Fleet Expenses</h3>
            <p className="text-xs text-muted-foreground">{filteredExp.length} records &middot; ${fmt(filteredExp.reduce((s, e) => s + (e.amount || 0), 0))} total</p>
          </div>
          {loadingExp ? (
            <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-xl bg-muted/30 animate-pulse" />)}</div>
          ) : filteredExp.length === 0 ? (
            <div className="text-center py-12"><DollarSign className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">No records found.</p></div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredExp.map(e => {
                const host = hostMap[e.host_id];
                return (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-foreground">{e.vehicle_name || "Fleet"}</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground capitalize">{EXPENSE_TYPE_LABELS[e.expense_type] || e.expense_type}</span>
                        {e.reimbursable && <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">Reimbursable</span>}
                        {e.recurring && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Recurring</span>}
                      </div>
                      <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground">
                        <span>{fmtDate(e.date)}</span>
                        {host && <span>{host.full_name}{host.business_name ? " \u00b7 " + host.business_name : ""}</span>}
                        {e.description && <span className="truncate max-w-[120px]">{e.description}</span>}
                      </div>
                    </div>
                    <p className={(e.amount || 0) >= 500 ? "text-sm font-bold text-red-400 flex-shrink-0" : "text-sm font-bold text-foreground flex-shrink-0"}>${fmt(e.amount)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Recurring Expenses Table */}
      {activeView === "recurring" && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-bold text-foreground">Recurring Expenses</h3>
            </div>
            <p className="text-xs text-muted-foreground">{filteredRecurring.length} records</p>
          </div>
          {loadingRec ? (
            <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 rounded-xl bg-muted/30 animate-pulse" />)}</div>
          ) : filteredRecurring.length === 0 ? (
            <div className="text-center py-12"><DollarSign className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">No recurring expenses found.</p></div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredRecurring.map(r => {
                const host = hostMap[r.host_id];
                const days = r.next_due_date ? differenceInDays(new Date(r.next_due_date), new Date()) : null;
                const isOverdue = days !== null && days < 0;
                const isDueSoon = days !== null && days >= 0 && days <= 7;
                return (
                  <div key={r.id} className={"flex items-center gap-3 px-4 py-3 " + (isOverdue ? "bg-red-500/5" : isDueSoon ? "bg-yellow-500/5" : "")}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-foreground">{RECURRING_CATS[r.category] || r.category}</p>
                        <span className={"text-[10px] px-2 py-0.5 rounded-full " + (r.status === "active" ? "bg-green-500/20 text-green-400" : r.status === "paused" ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400")}>{r.status}</span>
                        {isOverdue && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">Overdue</span>}
                        {isDueSoon && !isOverdue && <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">Due Soon</span>}
                      </div>
                      <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground">
                        <span>{r.vehicle_name || "Fleet"}</span>
                        <span>{r.frequency}</span>
                        {host && <span>{host.full_name}</span>}
                        {r.vendor && <span>{r.vendor}</span>}
                        {r.next_due_date && <span>Due {fmtDate(r.next_due_date)}</span>}
                      </div>
                    </div>
                    <p className="text-sm font-bold text-foreground flex-shrink-0">${fmt(r.amount)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}