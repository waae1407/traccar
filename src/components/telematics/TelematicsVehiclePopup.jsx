import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Edit3, Loader2, MapPin, Save, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TelematicsCommandButtons from "@/components/telematics/TelematicsCommandButtons";

function vehicleName(vehicle, device) {
  if (!vehicle) return device.unique_id || "Vehicle";
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.vin || device.unique_id;
}

function directionsUrl(position) {
  if (!position) return "#";
  return `https://www.google.com/maps/dir/?api=1&destination=${position[0]},${position[1]}`;
}

function coordinateLabel(position) {
  return `${position[0].toFixed(5)}, ${position[1].toFixed(5)}`;
}

function activeBookingForVehicle(bookings, vehicleId) {
  return bookings.find((booking) =>
    booking.vehicle_id === vehicleId && ["active", "approved", "confirmed"].includes(booking.booking_status)
  ) || null;
}

export default function TelematicsVehiclePopup({
  role = "admin",
  device,
  vehicle,
  host,
  provider,
  bookings = [],
  position,
  freshness,
  address,
  showStaleBadges = true,
  compact = false,
  onVehicleUpdated,
}) {
  const displayName = vehicleName(vehicle, device);
  const [tag, setTag] = useState(vehicle?.plate || displayName);
  const [saving, setSaving] = useState(false);
  const [lastCommand, setLastCommand] = useState(null);
  const booking = useMemo(() => activeBookingForVehicle(bookings, vehicle?.id), [bookings, vehicle?.id]);
  const online = (device.online_status || "").toLowerCase() === "online" || freshness?.label?.startsWith("Live");
  const badgeClass = online
    ? "border-emerald-300/30 bg-emerald-400/20 text-emerald-100 shadow-[0_0_22px_rgba(16,185,129,0.35)]"
    : "border-red-300/30 bg-red-500/20 text-red-100 shadow-[0_0_22px_rgba(239,68,68,0.35)]";

  const saveTag = async () => {
    if (!vehicle?.id) return;
    setSaving(true);
    const updated = await base44.entities.Vehicle.update(vehicle.id, { plate: tag.trim() });
    onVehicleUpdated?.(updated);
    setSaving(false);
  };

  return (
    <div className="w-80 sm:w-96 max-w-[90vw] overflow-hidden rounded-2xl border border-white/15 bg-slate-950 text-white shadow-2xl">
      <div className="relative p-3 sm:p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.35),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.24),transparent_34%)]" />
        <div className="relative space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="mb-1 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-white/60">
                <Sparkles className="h-2.5 w-2.5 text-pink-300" /> Tag
              </div>
              <h3 className="text-sm sm:text-base font-black leading-tight tracking-tight text-white truncate">{displayName}</h3>
            </div>
            {showStaleBadges && <Badge className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${badgeClass}`}>{freshness?.label || (online ? "Live" : "Offline")}</Badge>}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.07] p-2 backdrop-blur">
            <label className="mb-1 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/40"><Edit3 className="h-2.5 w-2.5" /> Edit</label>
            <div className="flex gap-1.5">
              <Input value={tag} onChange={(event) => setTag(event.target.value)} className="h-8 rounded-lg border-white/10 bg-black/25 text-xs font-bold text-white placeholder:text-white/30" />
              <Button size="sm" onClick={saveTag} disabled={saving || !vehicle?.id} className="h-8 w-8 rounded-lg bg-white text-slate-950 hover:bg-white/90 p-0 flex-shrink-0">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          <div className="grid gap-1.5 text-xs">
            {role !== "customer" && vehicle?.vin && <Info label="VIN" value={vehicle.vin} />}
            {role === "admin" && host && <Info label="Host" value={host.business_name || host.full_name || host.email} />}
            <Info label="Location" value={<a href={directionsUrl(position)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-cyan-200 underline decoration-cyan-200/40 underline-offset-1"><MapPin className="h-3 w-3 flex-shrink-0" /><span className="truncate">{address || coordinateLabel(position)}</span></a>} />
            <Info label="Speed" value={`${Number(device.speed || 0).toFixed(0)} mph`} />
            <Info label="Ignition" value={device.ignition_status || "unknown"} />
          </div>

          {vehicle?.id && (
            <div className="rounded-xl border border-white/10 bg-black/25 p-2.5">
              <TelematicsCommandButtons
                vehicleId={vehicle.id}
                bookingId={role === "customer" ? booking?.id : undefined}
                booking={booking || undefined}
                device={device}
                provider={provider}
                role={role}
                allowStarter={role === "admin" || (host?.telematics_starter_control_enabled === true && device.host_starter_control_enabled === true)}
                onResult={(result) => setLastCommand(result)}
              />
              {lastCommand && <p className="mt-1.5 text-[9px] font-bold text-white/50 truncate">Cmd: {lastCommand.command_type || "sent"} · {lastCommand.queue_status || "sent"}</p>}
            </div>
          )}

          {role !== "customer" && !compact && vehicle?.id && <Link to={role === "admin" ? "/admin/telematics" : "/host/telematics"} className="block rounded-lg border border-pink-300/25 bg-pink-500/15 px-3 py-2 text-center text-xs font-bold text-pink-100 transition hover:bg-pink-500/25">Open controls</Link>}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.055] px-2.5 py-2">
      <span className="text-[8px] font-black uppercase tracking-wider text-white/35">{label}</span>
      <span className="max-w-[140px] text-right text-xs font-bold text-white/85 truncate">{value}</span>
    </div>
  );
}