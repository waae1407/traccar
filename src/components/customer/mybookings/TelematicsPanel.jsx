import React, { useState } from "react";
import { MapPin, Lock, Unlock, Volume2, Loader2, Navigation, Zap, ExternalLink } from "lucide-react";
import TelematicsService from "@/lib/telematics/TelematicsService";
import { toast } from "sonner";

const COMMANDS = [
  {
    id: "location",
    label: "Find My Car",
    description: "See where your car is parked right now",
    icon: MapPin,
    color: "#3B82F6",
    bg: "rgba(59,130,246,0.12)",
    border: "rgba(59,130,246,0.25)",
    iconBg: "linear-gradient(135deg, #3B82F6, #06B6D4)",
  },
  {
    id: "unlock",
    label: "Unlock Doors",
    description: "Tap to unlock before you get in",
    icon: Unlock,
    color: "#10B981",
    bg: "rgba(16,185,129,0.12)",
    border: "rgba(16,185,129,0.25)",
    iconBg: "linear-gradient(135deg, #10B981, #34D399)",
  },
  {
    id: "lock",
    label: "Lock Doors",
    description: "Secure the car when you step away",
    icon: Lock,
    color: "#8B5CF6",
    bg: "rgba(139,92,246,0.12)",
    border: "rgba(139,92,246,0.25)",
    iconBg: "linear-gradient(135deg, #8B5CF6, #A78BFA)",
  },
  {
    id: "panic",
    label: "Honk Horn",
    description: "Can't find it in a lot? Honk it!",
    icon: Volume2,
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.25)",
    iconBg: "linear-gradient(135deg, #F59E0B, #FBBF24)",
  },
];

function CommandCard({ cmd, onPress, loading }) {
  const Icon = cmd.icon;
  const isLoading = loading === cmd.id;

  return (
    <button
      onClick={() => onPress(cmd.id)}
      disabled={!!loading}
      className="flex items-center gap-3 w-full p-3 rounded-2xl text-left transition-all active:scale-[0.98] disabled:opacity-60"
      style={{
        background: cmd.bg,
        border: `1px solid ${cmd.border}`,
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Icon */}
      <div
        className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 relative"
        style={{ background: cmd.iconBg, boxShadow: `0 4px 14px ${cmd.color}40` }}
      >
        {isLoading
          ? <Loader2 className="h-5 w-5 text-white animate-spin" />
          : <Icon className="h-5 w-5 text-white" />}
        {isLoading && (
          <div className="absolute inset-0 rounded-xl animate-ping opacity-30"
            style={{ background: cmd.iconBg }} />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-tight" style={{ color: cmd.color }}>{cmd.label}</p>
        <p className="text-[11px] mt-0.5 leading-snug text-gray-500">
          {cmd.description}
        </p>
      </div>

      {/* Chevron */}
      <div className="text-white/20 text-lg flex-shrink-0">›</div>
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
      const commandMap = { location: "locate", panic: "horn_lights" };
      const res = await TelematicsService.sendCommand({
        command_type: commandMap[command] || command,
        booking_id: booking.id,
      });

      if (command === "location" && res.data?.result) {
        setLocationData(res.data.result);
        toast.success("Location retrieved");
      } else if (command === "unlock") {
        toast.success("Doors unlocked ✓");
      } else if (command === "lock") {
        toast.success("Doors locked ✓");
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
            <div className="h-10 w-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <Zap className="h-5 w-5 text-red-400" />
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
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <div>
          <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest">Remote Vehicle Controls</p>
          <p className="text-[10px] text-white/30 mt-0.5">Control your rental from your phone</p>
        </div>
      </div>

      {/* Command cards */}
      <div className="px-3 pb-3 space-y-2">
        {COMMANDS.map((cmd) => (
          <CommandCard key={cmd.id} cmd={cmd} onPress={handleCommand} loading={loading} />
        ))}
      </div>

      {/* Location result */}
      {locationData && (
        <div className="mx-3 mb-3 rounded-xl p-3 border border-blue-500/20"
          style={{ background: "rgba(59,130,246,0.08)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Navigation className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Car Located</span>
          </div>
          {locationData.lat && locationData.lng ? (
            <a
              href={`https://maps.google.com/?q=${locationData.lat},${locationData.lng}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-300 font-semibold"
            >
              <ExternalLink className="h-3 w-3" />
              {locationData.lat?.toFixed(5)}, {locationData.lng?.toFixed(5)} — Open in Maps
            </a>
          ) : (
            <p className="text-xs text-white/50">{JSON.stringify(locationData)}</p>
          )}
        </div>
      )}
    </div>
  );
}