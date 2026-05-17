import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Plus, Wrench, AlertTriangle, CheckCircle2, Clock, Upload, Loader2, Trash2, Info } from "lucide-react";
import { uploadFile } from "@/utils/uploadFile";
import HostPageHeader from "@/components/host/HostPageHeader";
import { format, differenceInDays } from "date-fns";

const SERVICE_TYPES = ["oil_change", "tire_rotation", "brake_service", "inspection", "wash", "tire_replacement", "battery", "ac_service", "other"];
const SERVICE_LABELS = { oil_change: "Oil Change", tire_rotation: "Tire Rotation", brake_service: "Brake Service", inspection: "Inspection", wash: "Detailing / Wash", tire_replacement: "Tire Replacement", battery: "Battery", ac_service: "A/C Service", other: "Other" };

// Default mileage intervals per service type
const DEFAULT_MILEAGE_INTERVALS = {
  oil_change: 5000,
  tire_rotation: 7500,
  brake_service: 12000,
  tire_replacement: 40000,
  battery: 0,
  ac_service: 0,
  inspection: 0,
  wash: 0,
  other: 0,
};

const inputClass = "w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400 text-sm";

function computeStatus(log, vehicleMileage) {
  if (log.status === "overdue") return "overdue";
  const today = new Date();

  // Date check
  if (log.next_service_date) {
    const days = differenceInDays(new Date(log.next_service_date), today);
    if (days < 0) return "overdue";
    if (days <= 14) return "due_soon";
  }

  // Mileage check
  if (log.next_service_mileage && vehicleMileage) {
    const milesLeft = log.next_service_mileage - vehicleMileage;
    if (milesLeft <= 0) return "overdue";
    if (milesLeft <= 500) return "due_soon";
  }

  return log.status || "completed";
}

const STATUS_CONFIG = {
  completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  scheduled: { label: "Scheduled", cls: "bg-blue-50 text-blue-700", icon: Clock },
  due_soon: { label: "Due Soon", cls: "bg-yellow-50 text-yellow-700", icon: AlertTriangle },
  overdue: { label: "Overdue", cls: "bg-red-50 text-red-600", icon: AlertTriangle },
};

export default function HostMaintenance() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    vehicle_id: "", service_type: "oil_change", cost: "",
    date: format(new Date(), "yyyy-MM-dd"), mileage_at_service: "",
    next_service_date: "", next_service_mileage: "", shop_name: "", notes: "", receipt_url: "", status: "completed",
  });

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({ queryKey: ["host-vehicles", host?.id], queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: logs = [], isLoading } = useQuery({ queryKey: ["host-maintenance", host?.id], queryFn: () => base44.entities.HostMaintenanceLog.filter({ host_id: host.id }), enabled: !!host?.id });

  // Build vehicle mileage map
  const vehicleMileageMap = Object.fromEntries(vehicles.map(v => [v.id, v.mileage || 0]));

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.HostMaintenanceLog.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["host-maintenance"] });
      setShowForm(false);
      setForm({ vehicle_id: "", service_type: "oil_change", cost: "", date: format(new Date(), "yyyy-MM-dd"), mileage_at_service: "", next_service_date: "", next_service_mileage: "", shop_name: "", notes: "", receipt_url: "", status: "completed" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.HostMaintenanceLog.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-maintenance"] }),
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Auto-suggest next service mileage when service type or mileage changes
  const handleServiceTypeChange = (type) => {
    set("service_type", type);
    const interval = DEFAULT_MILEAGE_INTERVALS[type];
    if (interval && form.mileage_at_service) {
      set("next_service_mileage", String(Number(form.mileage_at_service) + interval));
    }
  };

  const handleMileageChange = (val) => {
    set("mileage_at_service", val);
    const interval = DEFAULT_MILEAGE_INTERVALS[form.service_type];
    if (interval && val) {
      set("next_service_mileage", String(Number(val) + interval));
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadFile(file);
    set("receipt_url", res.file_url);
    setUploading(false);
  };

  const vinSuffix = (v) => v.vin ? ` [${v.vin.slice(-6).toUpperCase()}]` : "";
  const vehicleLabel = (v) => `${v.year} ${v.make} ${v.model}${vinSuffix(v)}`;

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

  const enriched = logs.map(l => ({ ...l, _status: computeStatus(l, vehicleMileageMap[l.vehicle_id]) }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const alerts = enriched.filter(l => l._status === "overdue" || l._status === "due_soon");
  const totalCost = logs.reduce((s, l) => s + (l.cost || 0), 0);

  return (
    <div className="space-y-5">
      <HostPageHeader
        title="Maintenance"
        subtitle="Service history, scheduled maintenance & mileage alerts"
        action={
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white shadow-lg"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            <Plus className="h-4 w-4" /> Log Service
          </button>
        }
      />

      {/* How it works */}
      <div className="p-4 rounded-2xl border border-blue-100 bg-blue-50">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-900 mb-1">Smart Maintenance Alerts</p>
            <p className="text-xs text-blue-700 leading-relaxed">
              Log a service with a next service date or mileage threshold — we'll alert you when it's due.
              Warnings trigger <strong>14 days</strong> before the date or within <strong>500 miles</strong> of the mileage target.
              Mileage intervals are auto-suggested based on service type.
            </p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="p-4 rounded-2xl border border-yellow-200 bg-yellow-50">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <p className="font-bold text-yellow-800 text-sm">{alerts.length} service{alerts.length > 1 ? "s" : ""} need attention</p>
          </div>
          <div className="space-y-1">
            {alerts.map(l => {
              const milesLeft = l.next_service_mileage && vehicleMileageMap[l.vehicle_id]
                ? l.next_service_mileage - vehicleMileageMap[l.vehicle_id] : null;
              return (
                <p key={l.id} className="text-xs text-yellow-700">
                  • {l.vehicle_name} — {SERVICE_LABELS[l.service_type]}
                  {l._status === "overdue" ? " (OVERDUE)" : l.next_service_date ? ` (due ${l.next_service_date})` : ""}
                  {milesLeft !== null && milesLeft > 0 && ` · ${milesLeft.toLocaleString()} miles remaining`}
                  {milesLeft !== null && milesLeft <= 0 && ` · mileage exceeded`}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>{logs.length}</p>
          <p className="text-xs text-gray-400 mt-1">Total Services</p>
        </div>
        <div className="rounded-3xl shadow-sm p-4 text-center" style={{ background: "linear-gradient(135deg, hsl(0 72% 58% / 0.08), hsl(338 90% 56% / 0.05))", border: "1px solid hsl(0 72% 58% / 0.15)" }}>
          <p className="text-2xl font-black text-red-500" style={{ fontFamily: "var(--font-syne)" }}>${totalCost.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">Total Cost</p>
        </div>
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-black text-yellow-500" style={{ fontFamily: "var(--font-syne)" }}>{alerts.length}</p>
          <p className="text-xs text-gray-400 mt-1">Need Attention</p>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-pink-200 shadow-sm p-5 space-y-3">
          <h3 className="font-bold text-gray-900 text-sm">Log Maintenance Service</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Vehicle *</label>
              <select className={inputClass} required value={form.vehicle_id} onChange={e => set("vehicle_id", e.target.value)}>
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
              <label className="block text-xs font-semibold text-gray-500 mb-1">Cost ($)</label>
              <input className={inputClass} type="number" value={form.cost} onChange={e => set("cost", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Date *</label>
              <input className={inputClass} type="date" required value={form.date} onChange={e => set("date", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Mileage Now</label>
              <input className={inputClass} type="number" value={form.mileage_at_service} onChange={e => handleMileageChange(e.target.value)} placeholder="50000" />
            </div>
          </div>

          {/* Next service thresholds */}
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">⚠️ Set Alert Thresholds (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Next Service Date</label>
                <input className={inputClass} type="date" value={form.next_service_date} onChange={e => set("next_service_date", e.target.value)} />
                <p className="text-[10px] text-gray-400 mt-0.5">Alert 14 days before</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Next Service Mileage</label>
                <input className={inputClass} type="number" value={form.next_service_mileage} onChange={e => set("next_service_mileage", e.target.value)} placeholder="55000" />
                <p className="text-[10px] text-gray-400 mt-0.5">Alert within 500 miles</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Shop Name</label>
              <input className={inputClass} value={form.shop_name} onChange={e => set("shop_name", e.target.value)} placeholder="Jiffy Lube, etc." />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
              <input className={inputClass} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any notes…" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {form.receipt_url ? "Receipt uploaded ✓" : "Upload Receipt"}
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

      {/* Log */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? <div className="p-5 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}</div>
        : enriched.length === 0 ? (
          <div className="text-center py-16"><Wrench className="h-8 w-8 text-gray-300 mx-auto mb-3" /><p className="text-gray-400 text-sm">No maintenance logged yet</p></div>
        ) : (
          <div className="divide-y divide-gray-50">
            {enriched.map(l => {
              const cfg = STATUS_CONFIG[l._status] || STATUS_CONFIG.completed;
              const Icon = cfg.icon;
              const vehicleMileage = vehicleMileageMap[l.vehicle_id];
              const milesLeft = l.next_service_mileage && vehicleMileage ? l.next_service_mileage - vehicleMileage : null;
              return (
                <div key={l.id} className="flex items-center gap-3 px-5 py-4">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.cls}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{SERVICE_LABELS[l.service_type]}</p>
                    <p className="text-xs text-gray-400 truncate">{l.vehicle_name} · {l.date}{l.shop_name ? ` · ${l.shop_name}` : ""}</p>
                    <div className="flex flex-wrap gap-3 mt-0.5">
                      {l.next_service_date && <p className="text-[10px] text-gray-400">📅 Next: {l.next_service_date}</p>}
                      {l.next_service_mileage && (
                        <p className="text-[10px] text-gray-400">
                          🔢 Next: {l.next_service_mileage.toLocaleString()} mi
                          {milesLeft !== null && (
                            <span className={milesLeft <= 0 ? " text-red-500 font-bold" : milesLeft <= 500 ? " text-yellow-600 font-bold" : ""}>
                              {milesLeft > 0 ? ` (${milesLeft.toLocaleString()} mi left)` : ` (${Math.abs(milesLeft).toLocaleString()} mi overdue)`}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  {l.receipt_url && <a href={l.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-pink-500 font-semibold flex-shrink-0">View</a>}
                  <div className="text-right flex-shrink-0">
                    {l.cost > 0 && <p className="text-sm font-bold text-gray-900">${l.cost.toLocaleString()}</p>}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                  </div>
                  <button onClick={() => deleteMutation.mutate(l.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 flex-shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}