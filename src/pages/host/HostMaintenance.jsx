import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Plus, Wrench, Loader2, Upload, Download, AlertTriangle, CheckCircle2, Clock, X } from "lucide-react";
import { uploadFile } from "@/utils/uploadFile";
import HostPageHeader from "@/components/host/HostPageHeader";
import MaintenanceFilters, { DEFAULT_FILTERS } from "@/components/host/maintenance/MaintenanceFilters";
import MaintenanceAlerts from "@/components/host/maintenance/MaintenanceAlerts";
import MaintenanceCard, { SERVICE_LABELS, STATUS_CONFIG } from "@/components/host/maintenance/MaintenanceCard";
import MaintenanceDrawer from "@/components/host/maintenance/MaintenanceDrawer";
import CostInsights from "@/components/host/maintenance/CostInsights";
import { format, differenceInDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, addDays } from "date-fns";

const SERVICE_TYPES = ["oil_change", "tire_rotation", "brake_service", "inspection", "wash", "tire_replacement", "battery", "ac_service", "other"];

const DEFAULT_MILEAGE_INTERVALS = {
  oil_change: 5000, tire_rotation: 7500, brake_service: 12000,
  tire_replacement: 40000, battery: 0, ac_service: 0, inspection: 0, wash: 0, other: 0,
};

const inputClass = "w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400 text-sm";

export function computeStatus(log, vehicleMileage, vehicleStatus) {
  if (vehicleStatus === "Maintenance") return "in_maintenance";
  const today = new Date();
  if (log.next_service_date) {
    const days = differenceInDays(new Date(log.next_service_date), today);
    if (days < 0) return "overdue";
    if (days <= 14) return "due_soon";
  }
  if (log.next_service_mileage && vehicleMileage) {
    const milesLeft = log.next_service_mileage - vehicleMileage;
    if (milesLeft <= 0) return "overdue";
    if (milesLeft <= 500) return "due_soon";
  }
  if (log.status === "overdue") return "overdue";
  if (log.status === "scheduled") return "scheduled";
  return "completed";
}

function matchesDateRange(dateStr, range) {
  if (!range || !dateStr) return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (range === "today") return d >= startOfDay(now) && d <= endOfDay(now);
  if (range === "next7") return d >= now && d <= addDays(now, 7);
  if (range === "next14") return d >= now && d <= addDays(now, 14);
  if (range === "this_month") return d >= startOfMonth(now) && d <= endOfMonth(now);
  if (range === "last30") return d >= subDays(now, 30) && d <= now;
  return true;
}

function matchesCostRange(cost, range) {
  if (!range) return true;
  const c = cost || 0;
  if (range === "0-100") return c >= 0 && c <= 100;
  if (range === "100-500") return c > 100 && c <= 500;
  if (range === "500+") return c > 500;
  return true;
}

export default function HostMaintenance() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedLog, setSelectedLog] = useState(null);
  const [markUnavailable, setMarkUnavailable] = useState(false);
  const [form, setForm] = useState({
    vehicle_id: "", service_type: "oil_change", cost: "",
    date: format(new Date(), "yyyy-MM-dd"), mileage_at_service: "",
    next_service_date: "", next_service_mileage: "", shop_name: "", notes: "",
    receipt_url: "", status: "completed", expected_return_date: "",
  });

  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({
    queryKey: ["host-vehicles", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["host-maintenance", host?.id],
    queryFn: () => base44.entities.HostMaintenanceLog.filter({ host_id: host.id }, "-date", 300),
    enabled: !!host?.id,
  });

  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v])), [vehicles]);
  const vehicleMileageMap = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v.mileage || 0])), [vehicles]);
  const vehicleStatusMap = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v.status])), [vehicles]);

  // Enrich logs with computed status and vehicle data
  const enriched = useMemo(() =>
    logs.map(l => ({
      ...l,
      _status: computeStatus(l, vehicleMileageMap[l.vehicle_id], vehicleStatusMap[l.vehicle_id]),
      vehicle: vehicleMap[l.vehicle_id] || null,
    })).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [logs, vehicleMileageMap, vehicleStatusMap, vehicleMap]
  );

  // KPI calculations
  const kpis = useMemo(() => {
    const totalCost = enriched.reduce((s, l) => s + (l.cost || 0), 0);
    const dueSoon = enriched.filter(l => l._status === "due_soon").length;
    const overdue = enriched.filter(l => l._status === "overdue").length;
    const inMaintenance = vehicles.filter(v => v.status === "Maintenance").length;
    const vehicleIds = new Set(enriched.map(l => l.vehicle_id).filter(Boolean));
    const avgCostPerVehicle = vehicleIds.size > 0 ? totalCost / vehicleIds.size : 0;
    return { total: enriched.length, totalCost, dueSoon, overdue, inMaintenance, avgCostPerVehicle };
  }, [enriched, vehicles]);

  // Filter
  const filteredLogs = useMemo(() => {
    return enriched.filter(l => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const v = vehicleMap[l.vehicle_id];
        if (
          !(l.vehicle_name || "").toLowerCase().includes(q) &&
          !(v?.plate || "").toLowerCase().includes(q) &&
          !(v?.vin || "").toLowerCase().includes(q) &&
          !(l.service_type || "").toLowerCase().includes(q) &&
          !(SERVICE_LABELS[l.service_type] || "").toLowerCase().includes(q) &&
          !(l.notes || "").toLowerCase().includes(q) &&
          !(l.shop_name || "").toLowerCase().includes(q)
        ) return false;
      }
      if (filters.vehicleId && l.vehicle_id !== filters.vehicleId) return false;
      if (filters.status && l._status !== filters.status) return false;
      if (filters.serviceType && l.service_type !== filters.serviceType) return false;
      if (!matchesDateRange(l.date, filters.dateRange)) return false;
      if (!matchesCostRange(l.cost, filters.costRange)) return false;
      return true;
    });
  }, [enriched, filters, vehicleMap]);

  // Form handlers
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleServiceTypeChange = (type) => {
    setF("service_type", type);
    const interval = DEFAULT_MILEAGE_INTERVALS[type];
    if (interval && form.mileage_at_service) setF("next_service_mileage", String(Number(form.mileage_at_service) + interval));
  };

  const handleMileageChange = (val) => {
    setF("mileage_at_service", val);
    const interval = DEFAULT_MILEAGE_INTERVALS[form.service_type];
    if (interval && val) setF("next_service_mileage", String(Number(val) + interval));
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadFile(file);
    setF("receipt_url", res.file_url);
    setUploading(false);
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const log = await base44.entities.HostMaintenanceLog.create(data);
      // Mark vehicle unavailable if requested
      if (markUnavailable && data.vehicle_id) {
        await base44.entities.Vehicle.update(data.vehicle_id, { status: "Maintenance" });
        await base44.entities.ActivityEvent.create({
          event_type: "maintenance.logged",
          actor_email: user.email,
          actor_role: "host",
          target_entity: "Vehicle",
          target_id: data.vehicle_id,
          host_id: host.id,
          vehicle_id: data.vehicle_id,
          summary: `Vehicle marked Maintenance — ${data.service_type?.replace(/_/g, " ")} logged`,
          source: "host_portal",
          event_status: "warning",
        }).catch(() => {});
      }
      return log;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["host-maintenance"] });
      qc.invalidateQueries({ queryKey: ["host-vehicles"] });
      setShowForm(false);
      setMarkUnavailable(false);
      setForm({ vehicle_id: "", service_type: "oil_change", cost: "", date: format(new Date(), "yyyy-MM-dd"), mileage_at_service: "", next_service_date: "", next_service_mileage: "", shop_name: "", notes: "", receipt_url: "", status: "completed", expected_return_date: "" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.HostMaintenanceLog.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-maintenance"] }),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const vehicle = vehicles.find(v => v.id === form.vehicle_id);
    const hasNextService = form.next_service_date || form.next_service_mileage;
    createMutation.mutate({
      ...form,
      host_id: host.id,
      cost: form.cost ? Number(form.cost) : undefined,
      mileage_at_service: form.mileage_at_service ? Number(form.mileage_at_service) : undefined,
      next_service_mileage: form.next_service_mileage ? Number(form.next_service_mileage) : undefined,
      status: hasNextService ? "scheduled" : "completed",
      vehicle_name: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "",
    });
  };

  // CSV export
  const handleExport = () => {
    const rows = [
      ["Vehicle", "VIN", "Plate", "Service Type", "Date", "Mileage", "Cost", "Status", "Next Service Date", "Next Service Mileage", "Shop", "Notes"],
      ...filteredLogs.map(l => {
        const v = vehicleMap[l.vehicle_id];
        return [
          l.vehicle_name || "",
          v?.vin || "",
          v?.plate || "",
          SERVICE_LABELS[l.service_type] || l.service_type || "",
          l.date || "",
          l.mileage_at_service || "",
          l.cost || "",
          l._status || "",
          l.next_service_date || "",
          l.next_service_mileage || "",
          l.shop_name || "",
          (l.notes || "").replace(/"/g, '""'),
        ];
      }),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maintenance-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openFormForVehicle = (vehicleId) => {
    setForm(f => ({ ...f, vehicle_id: vehicleId || "" }));
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const vehicleLabel = (v) => `${v.year} ${v.make} ${v.model}${v.plate ? ` · ${v.plate}` : ""}`;

  return (
    <div className="space-y-5">
      <HostPageHeader
        title="Maintenance"
        subtitle="Fleet service tracking, cost analysis & maintenance alerts"
        action={
          <div className="flex gap-2">
            <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-xs font-bold text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white shadow-lg"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              <Plus className="h-4 w-4" /> Log Service
            </button>
          </div>
        }
      />

      {/* KPI CARDS */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <KpiCard value={kpis.total} label="Total Services" color="text-gray-900" bg="bg-white border-gray-100" />
        <KpiCard value={`$${Math.round(kpis.totalCost).toLocaleString()}`} label="Total Cost" color="text-red-500" bg="bg-white border-gray-100" />
        <KpiCard value={kpis.dueSoon} label="Due Soon" color="text-yellow-600" bg="bg-yellow-50 border-yellow-200" />
        <KpiCard value={kpis.overdue} label="Overdue" color={kpis.overdue > 0 ? "text-red-600" : "text-gray-400"} bg={kpis.overdue > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-100"} />
        <KpiCard value={kpis.inMaintenance} label="In Maint." color={kpis.inMaintenance > 0 ? "text-orange-600" : "text-gray-400"} bg={kpis.inMaintenance > 0 ? "bg-orange-50 border-orange-200" : "bg-white border-gray-100"} />
        <KpiCard value={`$${Math.round(kpis.avgCostPerVehicle).toLocaleString()}`} label="Avg/Vehicle" color="text-pink-600" bg="bg-pink-50 border-pink-200" />
      </div>

      {/* ALERTS */}
      <MaintenanceAlerts
        logs={enriched}
        vehicles={vehicles}
        vehicleMileageMap={vehicleMileageMap}
        onLogService={openFormForVehicle}
      />

      {/* LOG SERVICE FORM */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-pink-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 text-sm">Log Maintenance Service</h3>
            <button type="button" onClick={() => setShowForm(false)}><X className="h-4 w-4 text-gray-400" /></button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Vehicle *</label>
              <select className={inputClass} required value={form.vehicle_id} onChange={e => setF("vehicle_id", e.target.value)}>
                <option value="">Select vehicle</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Service Type *</label>
              <select className={inputClass} value={form.service_type} onChange={e => handleServiceTypeChange(e.target.value)}>
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{SERVICE_LABELS[t]}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Date *</label>
              <input className={inputClass} type="date" required value={form.date} onChange={e => setF("date", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Cost ($)</label>
              <input className={inputClass} type="number" value={form.cost} onChange={e => setF("cost", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Mileage</label>
              <input className={inputClass} type="number" value={form.mileage_at_service} onChange={e => handleMileageChange(e.target.value)} placeholder="50000" />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Alert Thresholds (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Next Service Date</label>
                <input className={inputClass} type="date" value={form.next_service_date} onChange={e => setF("next_service_date", e.target.value)} />
                <p className="text-[10px] text-gray-400 mt-0.5">Alert 14 days before</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Next Service Mileage</label>
                <input className={inputClass} type="number" value={form.next_service_mileage} onChange={e => setF("next_service_mileage", e.target.value)} placeholder="55000" />
                <p className="text-[10px] text-gray-400 mt-0.5">Alert within 500 mi</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Shop / Vendor</label>
              <input className={inputClass} value={form.shop_name} onChange={e => setF("shop_name", e.target.value)} placeholder="Jiffy Lube, etc." />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
              <input className={inputClass} value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Any notes…" />
            </div>
          </div>

          {/* Mark unavailable */}
          <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={markUnavailable} onChange={e => setMarkUnavailable(e.target.checked)}
                className="rounded border-gray-300 text-pink-500" />
              <span className="text-sm font-semibold text-orange-800">Mark vehicle unavailable during service</span>
            </label>
            {markUnavailable && (
              <>
                <p className="text-xs text-orange-600 ml-6">This will set vehicle status to "Maintenance"</p>
                <div className="ml-6">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Expected Return Date</label>
                  <input className={inputClass} type="date" value={form.expected_return_date} onChange={e => setF("expected_return_date", e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-between">
            <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {form.receipt_url ? "Receipt ✓" : "Upload Receipt"}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 bg-gray-100">Cancel</button>
              <button type="submit" disabled={createMutation.isPending} className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                {createMutation.isPending ? "Saving…" : "Log Service"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* FILTERS */}
      <MaintenanceFilters
        filters={filters}
        onChange={setFilters}
        vehicles={vehicles}
        resultCount={filteredLogs.length}
      />

      {/* COST INSIGHTS */}
      <CostInsights logs={enriched} />

      {/* MAINTENANCE LIST */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-sm">Service Records</h3>
          <p className="text-xs text-gray-400">{filteredLogs.length} record{filteredLogs.length !== 1 ? "s" : ""}</p>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-16">
            <Wrench className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">
              {logs.length === 0
                ? "No maintenance logged yet. Log your first service to track costs, mileage, and upcoming alerts."
                : "No maintenance records match these filters."}
            </p>
          </div>
        ) : (
          filteredLogs.map(l => (
            <MaintenanceCard
              key={l.id}
              log={l}
              vehicleMileage={vehicleMileageMap[l.vehicle_id]}
              isSelected={selectedLog?.id === l.id}
              onClick={() => setSelectedLog(selectedLog?.id === l.id ? null : l)}
            />
          ))
        )}
      </div>

      {/* DETAIL DRAWER */}
      {selectedLog && (
        <MaintenanceDrawer
          log={selectedLog}
          allLogs={enriched}
          vehicle={vehicleMap[selectedLog.vehicle_id] || null}
          hostId={host?.id}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </div>
  );
}

function KpiCard({ value, label, color, bg }) {
  return (
    <div className={`rounded-3xl border shadow-sm p-3 text-center ${bg}`}>
      <p className={`text-xl font-black ${color}`} style={{ fontFamily: "var(--font-syne)" }}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}