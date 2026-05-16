import React, { useState } from "react";
import { MapPin, Lock, Unlock, Volume2, AlertTriangle, Loader2, Navigation, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const COMMANDS = [
  {
    id: "location",
    label: "Find Car",
    icon: MapPin,
    gradient: "from-blue-500 to-cyan-500",
    glow: "rgba(59,130,246,0.3)",
  },
  {
    id: "unlock",
    label: "Unlock",
    icon: Unlock,
    gradient: "from-emerald-500 to-green-400",
    glow: "rgba(16,185,129,0.3)",
  },
  {
    id: "lock",
    label: "Lock",
    icon: Lock,
    gradient: "from-violet-500 to-purple-600",
    glow: "rgba(139,92,246,0.3)",
  },
  {
    id: "panic",
    label: "Honk",
    icon: Volume2,
    gradient: "from-amber-500 to-orange-500",
    glow: "rgba(245,158,11,0.3)",
  },
];

function TelematicsButton({ cmd, onPress, loading }) {
  const Icon = cmd.icon;
  const isLoading = loading === cmd.id;

  return (
    <button
      onClick={() => onPress(cmd.id)}
      disabled={!!loading}
      className="flex flex-col items-center gap-2 disabled:opacity-50 transition-all active:scale-95 group"
    >
      <div
        className={`relative h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-300`}
        style={{
          background: `linear-gradient(135deg, var(--tw-gradient-stops))`,
          boxShadow: isLoading ? `0 0 20px ${cmd.glow}` : `0 4px 16px ${cmd.glow}`,
        }}
      >
        <div className={`h-14 w-14 rounded-2xl flex items-center justify-center bg-gradient-to-br ${cmd.gradient}`}>
          {isLoading
            ? <Loader2 className="h-5 w-5 text-white animate-spin" />
            : <Icon className="h-5 w-5 text-white" />}
        </div>
        {/* Pulse ring on loading */}
        {isLoading && (
          <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${cmd.gradient} opacity-30 animate-ping`} />
        )}
      </div>
      <span className="text-[11px] font-bold text-white/60 group-hover:text-white/90 transition-colors">
        {cmd.label}
      </span>
    </button>
  );
}

export default function TelematicsPanel({ booking }) {
  const [loading, setLoading] = useState(null);
  const [locationData, setLocationData] = useState(null);

  const isActive = ["active", "approved", "confirmed"].includes(booking.booking_status);
  const isKilled = booking.moovetrax_kill_active;

  if (!isActive) return null;

  const handleCommand = async (command) => {
    setLoading(command);
    try {
      const res = await base44.functions.invoke("moovetraxCommand", {
        command,
        booking_id: booking.id,
      });

      if (command === "location" && res.data?.result) {
        setLocationData(res.data.result);
        toast.success("Location retrieved");
      } else if (command === "unlock") {
        toast.success("Vehicle unlocked ✓");
      } else if (command === "lock") {
        toast.success("Vehicle locked ✓");
      } else if (command === "panic") {
        toast.success("Horn activated ✓");
      }
    } catch (err) {
      toast.error(err.message || "Command failed");
    } finally {
      setLoading(null);
    }
  };

  // Killed state — payment issue
  if (isKilled) {
    return (
      <div className="mx-4 mb-3 rounded-2xl overflow-hidden border border-red-500/30"
        style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(220,38,38,0.08))" }}>
        <div className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <Zap className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-red-400">Vehicle Disabled</p>
              <p className="text-[11px] text-red-400/60 mt-0.5">Payment required to restore access</p>
            </div>
          </div>
          <p className="text-xs text-white/50 leading-relaxed mb-3">
            Your vehicle has been remotely disabled due to a missed payment. Update your payment method to restore access immediately.
          </p>
          <a
            href={`/checkout?request=${booking.id}&step=payment`}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}
          >
            Pay Now to Restore →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 rounded-2xl overflow-hidden border border-white/[0.08]"
      style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))" }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest">Vehicle Controls</p>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-around px-4 pb-4 pt-1">
        {COMMANDS.map((cmd) => (
          <TelematicsButton key={cmd.id} cmd={cmd} onPress={handleCommand} loading={loading} />
        ))}
      </div>

      {/* Location result */}
      {locationData && (
        <div className="mx-4 mb-4 rounded-xl p-3 border border-white/[0.06]"
          style={{ background: "rgba(59,130,246,0.08)" }}>
          <div className="flex items-center gap-2 mb-1">
            <Navigation className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Last Known Location</span>
          </div>
          {locationData.lat && locationData.lng ? (
            <a
              href={`https://maps.google.com/?q=${locationData.lat},${locationData.lng}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-white/70 underline underline-offset-2"
            >
              {locationData.lat?.toFixed(5)}, {locationData.lng?.toFixed(5)} → Open in Maps
            </a>
          ) : (
            <p className="text-xs text-white/50">{JSON.stringify(locationData)}</p>
          )}
        </div>
      )}
    </div>
  );
}