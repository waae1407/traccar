import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { X, FileText, ExternalLink, Wrench, CheckCircle2, AlertTriangle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { SERVICE_LABELS, STATUS_CONFIG } from "./MaintenanceCard";

const TABS = ["Overview", "History", "Upcoming", "Booking Impact", "Documents", "Timeline"];

function fmtDate(d) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
}

function fmt(n) { return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function MaintenanceDrawer({ log, allLogs, vehicle, hostId, onClose }) {
  const [tab, setTab] = useState("Overview");

  const vehicleLogs = allLogs.filter(l => l.vehicle_id === log.vehicle_id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalCost = vehicleLogs.reduce((s, l) => s + (l.cost || 0), 0);
  const lastService = vehicleLogs[0];

  // Scheduled / upcoming
  const upcoming = vehicleLogs.filter(l => l.status === "scheduled" || l.next_service_date);

  // Active bookings for this vehicle
  const { data: bookings = [] } = useQuery({
    queryKey: ["maint-bookings", log.vehicle_id],
    queryFn: () => base44.entities.BookingRequest.filter({ vehicle_id: log.vehicle_id }, "-created_date", 20),
    enabled: tab === "Booking Impact",
  });

  const activeBookings = bookings.filter(b =>
    ["active", "confirmed", "approved", "pending_payment"].includes(b.booking_status)
  );

  // Activity timeline
  const { data: events = [] } = useQuery({
    queryKey: ["maint-timeline", log.vehicle_id],
    queryFn: async () => {
      const results = [];
      try {
        const byVehicle = await base44.entities.ActivityEvent.filter({ vehicle_id: log.vehicle_id }, "-created_date", 30);
        results.push(...byVehicle);
      } catch (_) {}
      const maint = await base44.entities.ActivityEvent.filter({ target_id: log.vehicle_id }, "-created_date", 20).catch(() => []);
      results.push(...maint);
      const seen = new Set();
      return results.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
    },
    enabled: tab === "Timeline",
  });

  const cfg = STATUS_CONFIG[log._status] || STATUS_CONFIG.completed;
  const StatusIcon = cfg.Icon;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.06), hsl(265 80% 62% / 0.04))" }}>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${cfg.cls}`}>
              <StatusIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">{SERVICE_LABELS[log.service_type] || log.service_type}</p>
              <p className="text-xs text-gray-400">{log.vehicle_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0 overflow-x-auto no-scrollbar">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-shrink-0 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors ${tab === t ? "border-pink-500 text-pink-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "Overview" && (
            <div className="p-5 space-y-4">
              {/* Vehicle summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-center">
                  <p className="text-lg font-black text-gray-900">{vehicleLogs.length}</p>
                  <p className="text-[10px] text-gray-400">Services</p>
                </div>
                <div className="rounded-2xl p-3 text-center" style={{ background: "hsl(0 72% 58% / 0.08)", border: "1px solid hsl(0 72% 58% / 0.15)" }}>
                  <p className="text-lg font-black text-red-500">${Math.round(totalCost).toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400">Total Cost</p>
                </div>
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-center">
                  <p className="text-[11px] font-bold text-gray-700 capitalize">{vehicle?.status || "—"}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Status</p>
                </div>
              </div>

              {/* Current service details */}
              <div className="space-y-2.5 rounded-2xl bg-gray-50 border border-gray-100 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">This Service</p>
                <Row label="Service Type" value={SERVICE_LABELS[log.service_type] || log.service_type} />
                <Row label="Date" value={fmtDate(log.date)} />
                {log.mileage_at_service && <Row label="Mileage at Service" value={`${log.mileage_at_service.toLocaleString()} mi`} />}
                {log.cost > 0 && <Row label="Cost" value={`$${fmt(log.cost)}`} />}
                {log.shop_name && <Row label="Shop" value={log.shop_name} />}
                {log.next_service_date && <Row label="Next Service Date" value={fmtDate(log.next_service_date)} />}
                {log.next_service_mileage && <Row label="Next Service Mileage" value={`${log.next_service_mileage.toLocaleString()} mi`} />}
                {log.notes && <Row label="Notes" value={log.notes} />}
              </div>

              {vehicle && (
                <div className="space-y-2 rounded-2xl bg-gray-50 border border-gray-100 p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Vehicle Info</p>
                  <Row label="Vehicle" value={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} />
                  {vehicle.plate && <Row label="Plate" value={vehicle.plate} />}
                  {vehicle.vin && <Row label="VIN" value={vehicle.vin} />}
                  {vehicle.mileage && <Row label="Current Mileage" value={`${vehicle.mileage.toLocaleString()} mi`} />}
                  <Row label="Status" value={vehicle.status || "—"} />
                </div>
              )}
            </div>
          )}

          {tab === "History" && (
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-400">{vehicleLogs.length} service record{vehicleLogs.length !== 1 ? "s" : ""} for this vehicle</p>
              {vehicleLogs.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No service history yet.</p>
                : vehicleLogs.map(l => {
                    const c = STATUS_CONFIG[l._status] || STATUS_CONFIG.completed;
                    const Icon = c.Icon;
                    return (
                      <div key={l.id} className="rounded-2xl border border-gray-100 p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 flex-shrink-0 ${c.cls.split(" ")[1]}`} />
                            <p className="text-sm font-semibold text-gray-800">{SERVICE_LABELS[l.service_type] || l.service_type}</p>
                          </div>
                          <p className="text-sm font-bold text-gray-900 flex-shrink-0">{l.cost > 0 ? `$${fmt(l.cost)}` : "—"}</p>
                        </div>
                        <div className="flex flex-wrap gap-x-3 text-xs text-gray-400">
                          <span>{fmtDate(l.date)}</span>
                          {l.mileage_at_service && <span>{l.mileage_at_service.toLocaleString()} mi</span>}
                          {l.shop_name && <span>{l.shop_name}</span>}
                        </div>
                        {l.notes && <p className="text-[11px] text-gray-400">{l.notes}</p>}
                      </div>
                    );
                  })}
            </div>
          )}

          {tab === "Upcoming" && (
            <div className="p-5 space-y-3">
              {upcoming.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No upcoming services scheduled.</p>
                : upcoming.map(l => (
                    <div key={l.id} className="rounded-2xl border border-blue-100 bg-blue-50 p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-blue-800">{SERVICE_LABELS[l.service_type] || l.service_type}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Scheduled</span>
                      </div>
                      {l.next_service_date && <p className="text-xs text-blue-600">📅 Due: {fmtDate(l.next_service_date)}</p>}
                      {l.next_service_mileage && <p className="text-xs text-blue-600">🔢 At: {l.next_service_mileage.toLocaleString()} mi</p>}
                    </div>
                  ))
              }
            </div>
          )}

          {tab === "Booking Impact" && (
            <div className="p-5 space-y-3">
              {activeBookings.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-50 border border-yellow-200">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-800 font-medium">This vehicle has upcoming bookings. Review before marking unavailable.</p>
                </div>
              )}
              {bookings.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No bookings found for this vehicle.</p>
                : bookings.map(b => (
                    <div key={b.id} className="rounded-2xl border border-gray-100 p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800">{b.customer_full_name || b.user_email}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          ["active", "confirmed", "approved"].includes(b.booking_status) ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                        }`}>{b.booking_status?.replace(/_/g, " ")}</span>
                      </div>
                      <div className="flex gap-3 text-[11px] text-gray-400">
                        {b.start_date && <span>Start: {fmtDate(b.start_date)}</span>}
                        {b.end_date && <span>End: {fmtDate(b.end_date)}</span>}
                      </div>
                    </div>
                  ))
              }
            </div>
          )}

          {tab === "Documents" && (
            <div className="p-5 space-y-3">
              {log.receipt_url
                ? <a href={log.receipt_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 text-pink-500" />
                      <span className="text-xs font-semibold text-gray-700">Service Receipt</span>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                  </a>
                : <p className="text-sm text-gray-400 text-center py-8">No receipt uploaded for this service.</p>
              }
            </div>
          )}

          {tab === "Timeline" && (
            <div className="p-5 space-y-1">
              {events.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No activity recorded for this vehicle.</p>
                : events.map(e => (
                    <div key={e.id} className="flex gap-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 mt-2 ${e.event_status === "error" ? "bg-red-400" : e.event_status === "warning" ? "bg-yellow-400" : "bg-emerald-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{e.event_title || e.event_type?.replace(/\./g, " · ")}</p>
                        {e.summary && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{e.summary}</p>}
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {e.created_date ? formatDistanceToNow(new Date(e.created_date), { addSuffix: true }) : ""}
                        </p>
                      </div>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <p className="text-xs text-gray-400 flex-shrink-0">{label}</p>
      <p className="text-xs font-semibold text-gray-700 text-right">{value}</p>
    </div>
  );
}