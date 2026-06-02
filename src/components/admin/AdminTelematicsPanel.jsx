import React, { useState } from "react";
import { MapPin, Lock, Unlock, Volume2, ZapOff, Zap, Gauge, Navigation, Loader2, Activity } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const ACTION_BUTTONS = [
  { id: "location", label: "Locate", icon: MapPin, color: "blue" },
  { id: "unlock",   label: "Unlock", icon: Unlock, color: "emerald" },
  { id: "lock",     label: "Lock",   icon: Lock,   color: "violet" },
  { id: "panic",    label: "Honk",   icon: Volume2, color: "amber" },
  { id: "mileage",  label: "Mileage", icon: Gauge, color: "cyan" },
];

const COLOR_MAP = {
  blue:    { btn: "bg-blue-500/15 text-blue-400 border-blue-500/25 hover:bg-blue-500/25", loader: "border-blue-400" },
  emerald: { btn: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25", loader: "border-emerald-400" },
  violet:  { btn: "bg-violet-500/15 text-violet-400 border-violet-500/25 hover:bg-violet-500/25", loader: "border-violet-400" },
  amber:   { btn: "bg-amber-500/15 text-amber-400 border-amber-500/25 hover:bg-amber-500/25", loader: "border-amber-400" },
  cyan:    { btn: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25 hover:bg-cyan-500/25", loader: "border-cyan-400" },
  red:     { btn: "bg-red-500/15 text-red-400 border-red-500/25 hover:bg-red-500/25", loader: "border-red-400" },
  green:   { btn: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25", loader: "border-emerald-400" },
};

export default function AdminTelematicsPanel({ booking, vehicleDeviceId, onKillStateChange }) {
  const [loading, setLoading] = useState(null);
  const [locationData, setLocationData] = useState(null);
  const [mileageData, setMileageData] = useState(null);

  if (!vehicleDeviceId) {
    return (
      <div className="rounded-2xl border border-white/[0.06] p-4"
        style={{ background: "hsl(222 24% 11% / 0.8)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Activity className="h-4 w-4 text-white/20" />
          <p className="text-xs font-bold text-white/30 uppercase tracking-wider">MooveTrax Telematics</p>
        </div>
        <p className="text-xs text-white/25 mt-1">No MooveTrax device configured for this vehicle.</p>
      </div>
    );
  }

  const isKilled = booking?.moovetrax_kill_active;

  const handleCommand = async (command) => {
    setLoading(command);
    try {
      const res = await base44.functions.invoke("moovetraxCommand", {
        command,
        booking_id: booking.id,
        vehicle_id: booking.vehicle_id,
      });

      if (command === "location" && res.data?.result) {
        setLocationData(res.data.result);
        toast.success("Location retrieved");
      } else if (command === "mileage" && res.data?.result) {
        setMileageData(res.data.result);
        toast.success("Mileage retrieved");
      } else if (command === "kill") {
        toast.success("Engine kill activated");
        onKillStateChange?.(true);
      } else if (command === "unkill") {
        toast.success("Vehicle restored");
        onKillStateChange?.(false);
      } else {
        toast.success(`Command '${command}' sent`);
      }
    } catch (err) {
      toast.error(err.message || "Command failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.07] overflow-hidden"
      style={{ background: "hsl(222 24% 11% / 0.9)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className={`h-2 w-2 rounded-full ${isKilled ? "bg-red-500" : "bg-emerald-400 animate-pulse"}`} />
          <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest">MooveTrax Telematics</p>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
          isKilled
            ? "bg-red-500/15 text-red-400 border-red-500/25"
            : "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
        }`}>
          {isKilled ? "⚡ KILLED" : "● LIVE"}
        </span>
      </div>

      {/* Device ID */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] text-white/25 font-mono">Device: {vehicleDeviceId}</p>
      </div>

      {/* Action grid */}
      <div className="p-4 grid grid-cols-5 gap-2">
        {ACTION_BUTTONS.map((btn) => {
          const Icon = btn.icon;
          const isLoading = loading === btn.id;
          const cls = COLOR_MAP[btn.color];
          return (
            <button
              key={btn.id}
              onClick={() => handleCommand(btn.id)}
              disabled={!!loading}
              className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-bold transition-all active:scale-95 disabled:opacity-50 ${cls.btn}`}
            >
              {isLoading
                ? <Loader2 className={`h-4 w-4 animate-spin border-t-transparent`} />
                : <Icon className="h-4 w-4" />}
              <span className="text-[10px]">{btn.label}</span>
            </button>
          );
        })}
      </div>

      {/* Kill / Unkill — prominent */}
      <div className="px-4 pb-4 flex gap-2">
        <button
          onClick={() => handleCommand("kill")}
          disabled={!!loading || isKilled}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-95 disabled:opacity-40 bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25"
        >
          {loading === "kill" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ZapOff className="h-4 w-4" />}
          Kill Engine
        </button>
        <button
          onClick={() => handleCommand("unkill")}
          disabled={!!loading || !isKilled}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-95 disabled:opacity-40 bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
        >
          {loading === "unkill" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Restore
        </button>
      </div>

      {/* Location result */}
      {locationData && (
        <div className="mx-4 mb-4 rounded-xl p-3 border border-blue-500/20"
          style={{ background: "rgba(59,130,246,0.07)" }}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Navigation className="h-3 w-3 text-blue-400" />
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Last Location</span>
            </div>
            {locationData.lat && locationData.lng && (
              <a
                href={`https://maps.google.com/?q=${locationData.lat},${locationData.lng}`}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-blue-400/70 underline"
              >
                Open Maps →
              </a>
            )}
          </div>
          <p className="text-xs text-white/50 font-mono">
            {locationData.lat && locationData.lng
              ? `${locationData.lat?.toFixed(6)}, ${locationData.lng?.toFixed(6)}`
              : JSON.stringify(locationData)}
          </p>
          {locationData.speed !== undefined && (
            <p className="text-[10px] text-white/30 mt-1">Speed: {locationData.speed} mph</p>
          )}
        </div>
      )}

      {/* Mileage result */}
      {mileageData && (
        <div className="mx-4 mb-4 rounded-xl p-3 border border-cyan-500/20"
          style={{ background: "rgba(6,182,212,0.07)" }}>
          <div className="flex items-center gap-1.5 mb-1">
            <Gauge className="h-3 w-3 text-cyan-400" />
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Odometer Reading</span>
          </div>
          <p className="text-sm font-bold text-white/70">
            {mileageData.mileage ? `${Number(mileageData.mileage).toLocaleString()} mi` : JSON.stringify(mileageData)}
          </p>
        </div>
      )}
    </div>
  );
}