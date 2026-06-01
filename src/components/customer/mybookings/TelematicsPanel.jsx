import React, { useState } from "react";
import { Volume2, Loader2, Zap } from "lucide-react";
import TelematicsService from "@/lib/telematics/TelematicsService";
import { toast } from "sonner";

const COMMANDS = [
  {
    id: "find_my_car",
    label: "Find My Car",
    description: "Sends one short horn + lights pulse",
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
  const [lastResult, setLastResult] = useState(null);

  const isActive = ["active", "approved", "confirmed"].includes(booking.booking_status);
  const isKilled = booking.moovetrax_kill_active || booking.starter_disabled;
  const hasDevice = !!booking.vehicle_id;

  if (!isActive || !hasDevice) return null;

  const handleCommand = async (command) => {
    setLoading(command);
    try {
      const res = await TelematicsService.sendCommand({
        command_type: "alarm_pulse",
        booking_id: booking.id,
      });

      setLastResult({ status: res.data?.pending_acknowledgement ? "pending" : "success", command });
      toast.success(res.data?.pending_acknowledgement ? "Find My Car pulse sent" : "Find My Car activated ✓");
    } catch (err) {
      setLastResult({ status: "failed", command, message: err.message || "Command failed" });
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
          <p className="text-[10px] text-white/30 mt-0.5">Find your rental with one short horn + lights pulse</p>
        </div>
      </div>

      {/* Command status */}
      {lastResult && (
        <div className="mx-3 mb-3 rounded-xl p-3 border border-white/[0.08] text-xs text-white/60">
          Last command: <span className="font-bold text-white/80">{lastResult.command}</span> · {lastResult.status === "pending" ? "sent, waiting for device acknowledgement" : lastResult.status === "failed" ? `failed${lastResult.message ? ` — ${lastResult.message}` : ""}` : "successful"}
        </div>
      )}

      {/* Command cards */}
      <div className="px-3 pb-3 space-y-2">
        {COMMANDS.map((cmd) => (
          <CommandCard key={cmd.id} cmd={cmd} onPress={handleCommand} loading={loading} />
        ))}
      </div>

    </div>
  );
}