import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, MapPin, Wifi, WifiOff, Satellite, Clock, ShieldCheck } from "lucide-react";
import { getTelematicsDeviceStats, getVehicleTelematicsDevice, hasValidCoordinates, getDeviceFreshness } from "@/lib/telematics/telematicsReporting";

const ACTIVE_VEHICLE_STATUSES = ["Booked", "Active Rental", "Reserved", "Payment Due", "Grace Period"];
const ACTIVE_BOOKING_STATUSES = ["approved", "confirmed", "active", "pending_review"];

function MiniStat({ label, value, icon: Icon, tone }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">{label}</p>
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

export default function FleetSnapshotCard({ vehicles = [], devices = [], bookings = [] }) {
  const [c360Only, setC360Only] = useState(false);

  // Contactless360 = vehicles with a Traccar device installed and working (online)
  const isC360Ready = (d) => !!d?.traccar_device_id && d?.online_status === "online";

  const filteredDevices = c360Only ? devices.filter(isC360Ready) : devices;
  const c360ReadyCount = devices.filter(isC360Ready).length;

  const deviceStats = getTelematicsDeviceStats(filteredDevices);
  // Freshness-based online counts — not raw provider field
  const onlineVehicles = vehicles.filter(v => {
    if (c360Only) {
      const dev = getVehicleTelematicsDevice(v, devices);
      if (!isC360Ready(dev)) return false;
    }
    return getDeviceFreshness(getVehicleTelematicsDevice(v, devices)).status === "online";
  }).length;
  const offlineOrStaleVehicles = vehicles.filter(v => {
    if (c360Only) {
      const dev = getVehicleTelematicsDevice(v, devices);
      if (!isC360Ready(dev)) return false;
    }
    const f = getDeviceFreshness(getVehicleTelematicsDevice(v, devices));
    return ["offline", "stale", "unknown"].includes(f.status);
  }).length;
  const activeRentals = bookings.filter(booking => ACTIVE_BOOKING_STATUSES.includes(booking.booking_status)).length;
  const activeDeviceLocations = filteredDevices.filter(device => hasValidCoordinates(device) && vehicles.some(vehicle => vehicle.id === device.vehicle_id && ACTIVE_VEHICLE_STATUSES.includes(vehicle.status))).slice(0, 6);

  // Most recent sync time across all (filtered) devices
  const lastSyncTimes = filteredDevices.map(d => d.location_updated_at || d.last_seen_at).filter(Boolean).sort().reverse();
  const lastSyncLabel = lastSyncTimes[0]
    ? `Cached · synced ${Math.round((Date.now() - new Date(lastSyncTimes[0]).getTime()) / 60000)}m ago`
    : "Cached GPS status";

  return (
    <div className="rounded-3xl border border-white/[0.07] p-5 glass-hover" style={{ background: "hsl(222 24% 10% / 0.9)" }}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">{c360Only ? "Contactless360 Fleet" : "Fleet Snapshot"}</p>
          <h3 className="mt-1 text-xl font-black text-white">{c360Only ? "Traccar devices online" : "GPS visibility summary"}</h3>
          <p className="mt-1 text-xs text-white/40 flex items-center gap-1"><Clock className="h-3 w-3 inline" />{lastSyncLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setC360Only((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
              c360Only
                ? "bg-primary text-white border border-primary/40"
                : "bg-white/[0.06] text-white/60 border border-white/[0.08] hover:bg-white/[0.10]"
            }`}
            title="Show only vehicles with a Traccar device installed and online"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Contactless360
            {c360Only && <span className="ml-0.5 rounded-md bg-white/20 px-1.5 py-0.5 text-[10px]">{c360ReadyCount}</span>}
          </button>
          <Link to="/admin/telematics-operations" className="inline-flex items-center gap-1 rounded-xl bg-primary/15 px-3 py-2 text-xs font-bold text-primary">
            Full map <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat label="Live Online" value={onlineVehicles} icon={Wifi} tone="text-green-400" />
        <MiniStat label="Offline / Stale" value={offlineOrStaleVehicles} icon={WifiOff} tone="text-red-400" />
        <MiniStat label="Active Rentals" value={activeRentals} icon={MapPin} tone="text-pink-400" />
        <MiniStat label="Recently Seen" value={deviceStats.recentlySeen} icon={Satellite} tone="text-blue-400" />
      </div>
      <div className="mt-4 h-24 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] relative">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "18px 18px" }} />
        {activeDeviceLocations.length === 0 ? (
          <div className="relative flex h-full items-center justify-center text-xs font-semibold text-white/35">
            {c360Only ? "No online Traccar devices with active GPS." : "Map preview appears after cached GPS updates."}
          </div>
        ) : activeDeviceLocations.map((device, index) => (
          <span key={device.id} className="absolute h-3 w-3 rounded-full bg-primary shadow-lg shadow-primary/40" style={{ left: `${14 + ((index * 17) % 72)}%`, top: `${25 + ((index * 23) % 48)}%` }} />
        ))}
      </div>
    </div>
  );
}