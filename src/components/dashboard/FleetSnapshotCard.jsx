import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, MapPin, Wifi, WifiOff, Satellite } from "lucide-react";

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
  const onlineVehicles = vehicles.filter(vehicle => devices.some(device => device.vehicle_id === vehicle.id && device.online_status === "online")).length;
  const offlineVehicles = vehicles.filter(vehicle => devices.some(device => device.vehicle_id === vehicle.id && device.online_status === "offline")).length;
  const activeRentals = bookings.filter(booking => ACTIVE_BOOKING_STATUSES.includes(booking.booking_status)).length;
  const onlineDevices = devices.filter(device => device.online_status === "online").length;
  const activeDeviceLocations = devices.filter(device => device.last_latitude && device.last_longitude && vehicles.some(vehicle => vehicle.id === device.vehicle_id && ACTIVE_VEHICLE_STATUSES.includes(vehicle.status))).slice(0, 6);

  return (
    <Link to="/admin/telematics-operations" className="block rounded-3xl border border-white/[0.07] p-5 glass-hover" style={{ background: "hsl(222 24% 10% / 0.9)" }}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Fleet Snapshot</p>
          <h3 className="mt-1 text-xl font-black text-white">GPS visibility summary</h3>
          <p className="mt-1 text-xs text-white/40">Lightweight preview. Open the full map for filters and all devices.</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-xl bg-primary/15 px-3 py-2 text-xs font-bold text-primary">Full map <ArrowUpRight className="h-3.5 w-3.5" /></span>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <MiniStat label="Vehicles Online" value={onlineVehicles} icon={Wifi} tone="text-green-400" />
        <MiniStat label="Vehicles Offline" value={offlineVehicles} icon={WifiOff} tone="text-red-400" />
        <MiniStat label="Active Rentals" value={activeRentals} icon={MapPin} tone="text-pink-400" />
        <MiniStat label="GPS Devices Online" value={onlineDevices} icon={Satellite} tone="text-blue-400" />
      </div>
      <div className="mt-4 h-24 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] relative">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "18px 18px" }} />
        {activeDeviceLocations.length === 0 ? (
          <div className="relative flex h-full items-center justify-center text-xs font-semibold text-white/35">Map preview appears after cached GPS updates.</div>
        ) : activeDeviceLocations.map((device, index) => (
          <span key={device.id} className="absolute h-3 w-3 rounded-full bg-primary shadow-lg shadow-primary/40" style={{ left: `${14 + ((index * 17) % 72)}%`, top: `${25 + ((index * 23) % 48)}%` }} />
        ))}
      </div>
    </Link>
  );
}