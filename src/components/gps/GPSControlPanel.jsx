import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Lock, Unlock, MapPin, Power, RotateCcw, Volume2, Siren, ShieldCheck, ShieldAlert, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import RecklessDrivingCard from "./RecklessDrivingCard";

/**
 * GPSControlPanel — Full 7-button remote control for GPS-only personal vehicles.
 *
 * Buttons: Lock, Unlock, Locate, Kill Switch, Restore, Alarm, Panic/SOS
 *
 * Safety features:
 *   - Kill Switch & Alarm: 2-second hold-to-confirm (red progress ring)
 *   - Panic/SOS: double-tap confirmation
 *   - Starter status indicator (Enabled 🟢 / Disabled 🔴)
 *   - Command history with timestamps
 *   - Controls disabled overlay when subscription past_due
 */
export default function GPSControlPanel({ device, subscription, onRefresh }) {
  const [loading, setLoading] = useState(null);
  const [holdProgress, setHoldProgress] = useState(null);
  const [panicTaps, setPanicTaps] = useState(0);
  const [commands, setCommands] = useState([]);
  const holdTimer = useRef(null);
  const holdInterval = useRef(null);
  const panicTimer = useRef(null);

  const controlsEnabled = device?.controls_enabled !== false;
  const starterDisabled = device?.starter_disabled || false;

  useEffect(() => {
    loadCommands();
  }, [device?.id]);

  const loadCommands = async () => {
    if (!device?.id) return;
    try {
      const cmds = await base44.entities.TelematicsCommand.filter(
        { telematics_device_id: device.id },
        "-created_date",
        10
      );
      setCommands(cmds || []);
    } catch (e) {
      console.error("Failed to load commands:", e);
    }
  };

  const sendCommand = async (commandType, options = {}) => {
    if (!controlsEnabled) return;
    setLoading(commandType);
    try {
      const { default: TelematicsService } = await import("@/lib/telematics/TelematicsService");
      const { toast } = await import("sonner");

      if (commandType === "panic") {
        // Panic/SOS — calls the backend function
        await base44.functions.invoke("sendGPSPanicAlert", {
          device_id: device.id,
        });
        toast.success("🚨 PANIC ALERT SENT", {
          description: "Starter disabled, alarm triggered, emergency contacts notified.",
        });
      } else if (commandType === "alarm") {
        await TelematicsService.startAlarm({
          vehicle_id: device.vehicle_id,
          telematics_device_id: device.id,
        });
        toast.success("Alarm activated!");
      } else {
        await TelematicsService.sendCommand({
          telematics_device_id: device.id,
          vehicle_id: device.vehicle_id || "",
          command_type: commandType,
          source: "gps_personal_control",
          reason: options.reason || `Personal GPS control: ${commandType}`,
          confirm_starter_command: commandType === "disable_starter" || commandType === "restore_starter",
        });
        toast.success(`${commandType.replace(/_/g, " ")} command sent`);
      }

      await loadCommands();
      onRefresh?.();
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error("Command failed", { description: err.message });
    } finally {
      setLoading(null);
    }
  };

  // ── Hold-to-confirm for destructive actions (Kill Switch, Alarm) ──
  const startHold = (commandType) => {
    if (!controlsEnabled || loading) return;
    setHoldProgress({ command: commandType, progress: 0 });
    let elapsed = 0;
    const duration = 2000; // 2 seconds
    holdInterval.current = setInterval(() => {
      elapsed += 50;
      setHoldProgress({ command: commandType, progress: Math.min(100, (elapsed / duration) * 100) });
      if (elapsed >= duration) {
        clearInterval(holdInterval.current);
        setHoldProgress(null);
        sendCommand(commandType, { reason: "Hold-to-confirm: personal vehicle control" });
      }
    }, 50);
  };

  const cancelHold = () => {
    if (holdInterval.current) {
      clearInterval(holdInterval.current);
      holdInterval.current = null;
    }
    setHoldProgress(null);
  };

  // ── Double-tap for Panic/SOS ──
  const handlePanicTap = () => {
    if (!controlsEnabled || loading) return;
    const taps = panicTaps + 1;
    setPanicTaps(taps);

    if (taps === 1) {
      panicTimer.current = setTimeout(() => {
        setPanicTaps(0);
      }, 2000);
    } else if (taps === 2) {
      clearTimeout(panicTimer.current);
      setPanicTaps(0);
      sendCommand("panic");
    }
  };

  useEffect(() => {
    return () => {
      if (holdInterval.current) clearInterval(holdInterval.current);
      if (panicTimer.current) clearTimeout(panicTimer.current);
    };
  }, []);

  const BUTTONS = [
    { key: "lock", label: "Lock", icon: Lock, color: "#30D158", bg: "rgba(48,209,88,0.1)", border: "rgba(48,209,88,0.2)", destructive: false },
    { key: "unlock", label: "Unlock", icon: Unlock, color: "#2F80FF", bg: "rgba(47,128,255,0.1)", border: "rgba(47,128,255,0.2)", destructive: false },
    { key: "locate", label: "Locate", icon: MapPin, color: "#89B4F8", bg: "rgba(137,180,248,0.1)", border: "rgba(137,180,248,0.2)", destructive: false },
    { key: "disable_starter", label: "Kill Switch", icon: Power, color: "#FF453A", bg: "rgba(255,69,58,0.1)", border: "rgba(255,69,58,0.3)", destructive: true, hold: true },
    { key: "restore_starter", label: "Restore", icon: RotateCcw, color: "#30D158", bg: "rgba(48,209,88,0.1)", border: "rgba(48,209,88,0.2)", destructive: false },
    { key: "alarm", label: "Alarm", icon: Volume2, color: "#FF9F0A", bg: "rgba(255,159,10,0.1)", border: "rgba(255,159,10,0.3)", destructive: true, hold: true },
  ];

  return (
    <div className="space-y-4">
      {/* ── Starter Status Indicator ── */}
      <div
        className="flex items-center justify-between rounded-2xl border p-4"
        style={{
          background: starterDisabled ? "rgba(255,69,58,0.08)" : "rgba(48,209,88,0.08)",
          borderColor: starterDisabled ? "rgba(255,69,58,0.3)" : "rgba(48,209,88,0.3)",
        }}
      >
        <div className="flex items-center gap-3">
          {starterDisabled ? (
            <ShieldAlert size={22} color="#FF453A" />
          ) : (
            <ShieldCheck size={22} color="#30D158" />
          )}
          <div>
            <p className="text-sm font-bold text-white">Starter: {starterDisabled ? "Disabled" : "Enabled"}</p>
            <p className="text-xs text-white/50">
              {starterDisabled ? "Vehicle cannot start — kill switch active" : "Vehicle can start normally"}
            </p>
          </div>
        </div>
        <div
          className="h-3 w-3 rounded-full"
          style={{
            background: starterDisabled ? "#FF453A" : "#30D158",
            boxShadow: starterDisabled ? "0 0 12px rgba(255,69,58,0.6)" : "0 0 12px rgba(48,209,88,0.6)",
          }}
        />
      </div>

      {/* ── Reckless Driving Monitor (Pass/Fail) ── */}
      <RecklessDrivingCard device={device} />

      {/* ── Controls Disabled Overlay ── */}
      {!controlsEnabled && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
          <AlertTriangle size={20} color="#FF453A" />
          <div>
            <p className="text-sm font-bold text-red-400">Remote Controls Disabled</p>
            <p className="text-xs text-red-400/70">
              Your GPS subscription payment is past due. Update your payment method to restore controls.
              Tracking is still active.
            </p>
          </div>
        </div>
      )}

      {/* ── 6 Standard Control Buttons ── */}
      <div className="grid grid-cols-3 gap-3">
        {BUTTONS.map((btn) => {
          const Icon = btn.icon;
          const isLoading = loading === btn.key;
          const isHolding = holdProgress?.command === btn.key;
          return (
            <button
              key={btn.key}
              disabled={!controlsEnabled || !!loading}
              onMouseDown={btn.hold ? () => startHold(btn.key) : undefined}
              onMouseUp={btn.hold ? cancelHold : undefined}
              onMouseLeave={btn.hold ? cancelHold : undefined}
              onTouchStart={btn.hold ? () => startHold(btn.key) : undefined}
              onTouchEnd={btn.hold ? cancelHold : undefined}
              onClick={btn.hold ? undefined : () => sendCommand(btn.key)}
              className="relative flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 transition-all active:scale-95 disabled:opacity-40"
              style={{
                background: btn.bg,
                borderColor: isHolding ? btn.color : btn.border,
                cursor: controlsEnabled && !loading ? "pointer" : "not-allowed",
              }}
            >
              {/* Hold-to-confirm progress ring */}
              {isHolding && (
                <svg className="absolute inset-0 -rotate-90" style={{ width: "100%", height: "100%" }}>
                  <circle
                    cx="50%"
                    cy="50%"
                    r="45%"
                    fill="none"
                    stroke={btn.color}
                    strokeWidth="3"
                    strokeDasharray={`${(holdProgress.progress / 100) * 2.83} 2.83}`}
                    strokeLinecap="round"
                    pathLength={2.83}
                  />
                </svg>
              )}
              <Icon
                size={26}
                color={btn.color}
                className={isLoading ? "animate-spin" : ""}
                style={{ filter: `drop-shadow(0 2px 8px ${btn.color}40)` }}
              />
              <div className="text-center">
                <p className="text-xs font-bold text-white">{btn.label}</p>
                {btn.hold && (
                  <p className="text-[10px] text-white/40">{isHolding ? "Keep holding…" : "Hold 2s"}</p>
                )}
                {!btn.hold && (
                  <p className="text-[10px] text-white/40">{isLoading ? "Sending…" : "Tap"}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Panic/SOS Button (7th, full-width) ── */}
      <button
        disabled={!controlsEnabled || !!loading}
        onClick={handlePanicTap}
        className="relative w-full flex items-center justify-center gap-3 rounded-2xl border-2 border-red-500 bg-gradient-to-r from-red-600/20 to-red-500/10 p-5 transition-all active:scale-[0.98] disabled:opacity-40"
        style={{
          boxShadow: panicTaps === 1 ? "0 0 30px rgba(255,69,58,0.5)" : "0 0 12px rgba(255,69,58,0.2)",
        }}
      >
        <Siren size={28} color="#FF453A" className={loading === "panic" ? "animate-pulse" : ""} />
        <div className="text-left">
          <p className="text-base font-black text-red-400">
            {panicTaps === 1 ? "TAP AGAIN TO CONFIRM" : "PANIC / SOS"}
          </p>
          <p className="text-xs text-red-400/60">
            {panicTaps === 1
              ? "Double-tap to trigger emergency alert"
              : "Kills starter, triggers alarm, alerts emergency contacts"}
          </p>
        </div>
      </button>

      {/* ── Command History ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={14} color="#71717A" />
          <p className="text-xs font-bold uppercase tracking-wider text-white/40">Command History</p>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
          {commands.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-4">No commands sent yet</p>
          ) : (
            commands.map((cmd) => (
              <div
                key={cmd.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {["acknowledged", "executed", "confirmed", "delivered"].includes(cmd.status) ? (
                    <CheckCircle size={14} color="#30D158" />
                  ) : ["failed", "expired", "blocked"].includes(cmd.status) ? (
                    <XCircle size={14} color="#FF453A" />
                  ) : (
                    <Clock size={14} color="#FF9F0A" />
                  )}
                  <span className="text-xs font-medium text-white/80">
                    {cmd.command_type?.replace(/_/g, " ")}
                  </span>
                </div>
                <span className="text-[10px] text-white/30">
                  {cmd.created_date ? formatDistanceToNow(new Date(cmd.created_date), { addSuffix: true }) : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}