import React from "react";
import { Badge } from "@/components/ui/badge";
import { BatteryCharging, Clock3, Gauge, KeyRound, RadioTower, WalletCards } from "lucide-react";
import { getGpsFreshness, getSupportedCommands } from "@/lib/telematics/commandReadiness";
import InstallerLocatorCTA from "@/components/installers/InstallerLocatorCTA";

function valueOrDash(value, suffix = "") {
  if (value === undefined || value === null || value === "") return "—";
  return `${value}${suffix}`;
}

function fmt(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function VehicleStatusCard({ mode, vehicle, device, provider, booking, hostOwnsVehicle, allowStarter }) {
  const freshness = getGpsFreshness(device || {});
  const supported = getSupportedCommands({ role: mode, device, provider: provider || {}, booking, hostOwnsVehicle, allowStarter })
    .filter((item) => mode !== "customer" || ["locate", "lock", "unlock", "alarm_pulse"].includes(item.command));
  const online = device?.online_status === "online";

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Vehicle Status</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">{vehicle?.display_name || [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || booking?.vehicle_name || "Selected Vehicle"}</h2>
          <p className="mt-1 text-sm text-slate-500">{vehicle?.status || booking?.booking_status || "Ready status pending"}</p>
        </div>
        <Badge className={`rounded-full px-3 py-1 ${online ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{online ? "Online" : "Offline / Unknown"}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Metric icon={Clock3} label="Last heartbeat" value={fmt(device?.last_seen_at || device?.location_updated_at)} />
        <Metric icon={RadioTower} label="GPS freshness" value={freshness.label} />
        <Metric icon={BatteryCharging} label="Battery / voltage" value={valueOrDash(device?.battery_level, "%") !== "—" ? valueOrDash(device?.battery_level, "%") : valueOrDash(device?.voltage || device?.power_voltage || device?.external_voltage, "V")} />
        <Metric icon={KeyRound} label="Ignition" value={device?.ignition_status || "unknown"} />
        <Metric icon={Gauge} label="Rental status" value={booking?.booking_status || vehicle?.status || "—"} />
        <Metric icon={WalletCards} label="Payment" value={booking?.payment_status || "—"} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {supported.map((item) => <Badge key={item.command} variant="outline" className="rounded-full bg-slate-50 text-slate-700">{item.command.replaceAll("_", " ")}</Badge>)}
        {supported.length === 0 && <span className="text-sm text-slate-500">No commands are ready for this vehicle.</span>}
      </div>

      {mode === "host" && !device && (
        <div className="mt-4">
          <InstallerLocatorCTA source="vehicle_detail" vehicle={vehicle} title="Need help installing your GPS device?" description="Find a nearby installer." />
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <Icon className="mb-2 h-4 w-4 text-pink-600" />
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}