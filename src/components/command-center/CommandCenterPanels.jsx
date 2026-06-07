import React from "react";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, BatteryCharging, HeartPulse, RadioTower, ShieldAlert } from "lucide-react";

function fmt(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

export function DeviceHealthPanel({ mode, device, position }) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-black text-slate-950">Device Health</h3>
      <p className="mt-1 text-xs text-slate-500">{mode === "customer" ? "Vehicle connectivity summary." : "Operational device telemetry and heartbeat."}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Health icon={RadioTower} label="Online" value={device?.online_status || "unknown"} />
        <Health icon={HeartPulse} label="Heartbeat" value={fmt(device?.last_seen_at)} />
        <Health icon={BatteryCharging} label="Voltage" value={device?.voltage || device?.power_voltage || device?.external_voltage ? `${device?.voltage || device?.power_voltage || device?.external_voltage}V` : "—"} />
        <Health icon={Activity} label="Last position" value={fmt(position?.timestamp || device?.location_updated_at)} />
      </div>
    </div>
  );
}

export function SafetyAlertsPanel({ safetyEvents = [], alerts = [] }) {
  const openSafety = safetyEvents.filter((event) => !["resolved", "false_alarm"].includes(event.status));
  const openAlerts = alerts.filter((alert) => !["resolved", "dismissed", "closed"].includes(alert.status));
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-950">Safety / Alerts</h3>
          <p className="mt-1 text-xs text-slate-500">Open safety signals and operational alerts for this vehicle.</p>
        </div>
        <Badge className="rounded-full bg-slate-100 text-slate-700">{openSafety.length + openAlerts.length} open</Badge>
      </div>
      <div className="mt-4 space-y-2">
        {[...openSafety.map((event) => ({ id: event.id, title: event.event_type?.replaceAll("_", " "), message: event.status, severity: event.severity })), ...openAlerts.map((alert) => ({ id: alert.id, title: alert.title, message: alert.message, severity: alert.severity }))].slice(0, 6).map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-black capitalize text-slate-900">{item.title}</p>
                <p className="mt-1 text-xs text-slate-500">{item.message}</p>
              </div>
              <Badge variant="outline" className="rounded-full">{item.severity || "info"}</Badge>
            </div>
          </div>
        ))}
        {openSafety.length + openAlerts.length === 0 && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-center text-sm font-semibold text-emerald-700"><ShieldAlert className="mx-auto mb-2 h-5 w-5" />No open vehicle safety alerts.</div>}
      </div>
    </div>
  );
}

function Health({ icon: Icon, label, value }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><Icon className="mb-2 h-4 w-4 text-pink-600" /><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-bold text-slate-900">{value}</p></div>;
}