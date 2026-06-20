import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BellRing, CheckCircle2, Loader2, Lock, MapPin, RotateCcw, ShieldAlert, Unlock, Volume2, Zap } from "lucide-react";
import TelematicsService from "@/lib/telematics/TelematicsService";
import { getCommandReadiness } from "@/lib/telematics/commandReadiness";
import TelematicsAlarmControls from "@/components/telematics/TelematicsAlarmControls";
import { useCommandProgress, PHASES } from "@/hooks/useCommandProgress";

const COMMANDS = {
  remote: [
    { key: "locate", label: "Locate", icon: MapPin },
    { key: "lock", label: "Lock", icon: Lock },
    { key: "unlock", label: "Unlock", icon: Unlock },
    { key: "horn", label: "Horn", icon: Volume2 },
    { key: "lights", label: "Lights", icon: BellRing },
  ],
  security: [
    { key: "alarm_pulse", label: "Find My Vehicle", icon: ShieldAlert },
    { key: "disable_starter", label: "Disable Starter", icon: Zap, starter: true },
    { key: "restore_starter", label: "Restore Starter", icon: RotateCcw, starter: true },
  ]
};

// Success/failure labels for each command
const COMMAND_LABELS = {
  lock: { success: "Locked", failed: "Not Locked" },
  unlock: { success: "Unlocked", failed: "Not Unlocked" },
  locate: { success: "Located", failed: "Not Located" },
  horn: { success: "Horn On", failed: "No Horn" },
  lights: { success: "Lights On", failed: "No Lights" },
  horn_lights: { success: "Horn & Lights On", failed: "No Response" },
  alarm_pulse: { success: "Alert Sent", failed: "Alert Failed" },
  disable_starter: { success: "Starter Disabled", failed: "Not Disabled" },
  restore_starter: { success: "Starter Restored", failed: "Not Restored" },
  status: { success: "Status Received", failed: "No Status" },
};

// Play chime sound using Web Audio API
const playChime = (success = true) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    if (success) {
      // Pleasant ascending chime (C5 -> E5 -> G5)
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      oscillator.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
    } else {
      // Low error tone
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(150, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    }
  } catch {
    // Silent fail if audio not supported
  }
};

export default function VehicleCommandControls({ mode, vehicle, device, provider, booking, hostOwnsVehicle, allowStarter, onCommand }) {
  const progress = useCommandProgress();
  const allowedCustomer = ["locate", "lock", "unlock", "alarm_pulse"];

  const visible = (group) => COMMANDS[group].filter((command) => {
    if (mode === "customer" && !allowedCustomer.includes(command.key)) return false;
    const ready = getCommandReadiness({ command: command.key, role: mode, device, provider, booking, hostOwnsVehicle, allowStarter });
    return ready.supported;
  });

  const send = async (commandType, starter = false) => {
    if (commandType === "alarm_pulse") {
      progress.startOptimistic(commandType);
      try {
        const res = await TelematicsService.startAlarm({ vehicle_id: vehicle?.id });
        await onCommand?.(res.data);
        progress.reset();
      } catch {
        progress.reset();
      }
      return;
    }

    const reason = starter ? window.prompt("Reason for starter command") : "";
    if (starter && (!reason || reason.trim().length < 5 || !window.confirm("Confirm this high-risk starter command?"))) return;

    // Show "Contacting vehicle…" immediately
    progress.startOptimistic(commandType);

    try {
      const res = await TelematicsService.sendCommand({
        vehicle_id: vehicle?.id,
        booking_id: booking?.id || "",
        command_type: commandType,
        source: "vehicle_command_center",
        reason,
        confirm_starter_command: !!starter
      });

      const data = res.data;
      const cmdId = data?.command_id || data?.id;
      // Gate hold done → transition to "Vehicle responding…"
      progress.transitionToPolling(commandType, cmdId);
      await onCommand?.(data);
    } catch {
      progress.reset();
    }
  };

  // Handle phase completion with chime and auto-reset
  useEffect(() => {
    if (progress.phase === PHASES.success) {
      setTimeout(() => playChime(true), 500);
      // Auto-reset after 3 seconds
      const timer = setTimeout(() => progress.reset(), 3000);
      return () => clearTimeout(timer);
    } else if (progress.phase === PHASES.failed) {
      setTimeout(() => playChime(false), 500);
      // Auto-reset after 4 seconds (give user time to see error)
      const timer = setTimeout(() => progress.reset(), 4000);
      return () => clearTimeout(timer);
    }
  }, [progress.phase, progress.reset]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ControlSection
        title="Remote Controls"
        subtitle="Readiness-filtered commands routed through sendTelematicsCommand."
        commands={visible("remote")}
        activeCommand={progress.commandType}
        phase={progress.phase}
        elapsed={progress.elapsed}
        onSend={send}
      />
      <div className="space-y-3">
        <ControlSection
          title="Security Controls"
          subtitle={mode === "customer" ? "Starter controls are never exposed to renters." : "Starter controls require reason and confirmation."}
          commands={visible("security")}
          activeCommand={progress.commandType}
          phase={progress.phase}
          elapsed={progress.elapsed}
          onSend={send}
        />
        {vehicle?.id && ["admin", "host"].includes(mode) && (
          <TelematicsAlarmControls vehicleId={vehicle.id} role={mode} onResult={onCommand} />
        )}
      </div>
    </div>
  );
}

const PHASE_COLORS = {
  contacting: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  vehicle_responding: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  failed: "border-red-500/40 bg-red-500/10 text-red-400",
};

function ControlSection({ title, subtitle, commands, activeCommand, phase, elapsed, onSend }) {
  return (
    <div className="rounded-[1.75rem] border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-foreground">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Badge variant="outline" className="rounded-full">{commands.length} ready</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {commands.map((command) => {
          const Icon = command.icon;
          const isThisCommand = activeCommand === command.key;
          const labels = COMMAND_LABELS[command.key] || { success: "Sent", failed: "Failed" };
          
          // Determine button state
          const isContacting = isThisCommand && phase === PHASES.contacting;
          const isResponding = isThisCommand && phase === PHASES.vehicle_responding;
          const isSuccess = isThisCommand && phase === PHASES.success;
          const isFailed = isThisCommand && phase === PHASES.failed;
          const isIdle = !isThisCommand || phase === PHASES.idle;

          let buttonClass = "bg-secondary text-foreground hover:bg-secondary/80";
          let label = command.label;
          let iconType = "default"; // "default", "loader", "check", "none"
          let showTimer = false;

          if (isContacting) {
            buttonClass = PHASE_COLORS.contacting;
            label = "Contacting vehicle…";
            iconType = "loader";
            showTimer = true;
          } else if (isResponding) {
            buttonClass = PHASE_COLORS.vehicle_responding;
            label = "Vehicle responding…";
            iconType = "none";
            showTimer = true;
          } else if (isSuccess) {
            buttonClass = "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30";
            label = labels.success;
            iconType = "check";
          } else if (isFailed) {
            buttonClass = "bg-red-500 text-white shadow-lg shadow-red-500/30";
            label = labels.failed;
            iconType = "none";
          }

          return (
            <Button
              key={command.key}
              variant="outline"
              disabled={isContacting || isResponding}
              onClick={() => onSend(command.key, command.starter)}
              className={`h-20 flex-col rounded-2xl border-border transition-all duration-300 ${buttonClass}`}
            >
              <div className="flex items-center gap-2">
                {iconType === "loader" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {iconType === "check" && (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                {iconType === "default" && <Icon className="h-5 w-5" />}
                <span className="text-xs font-black">{label}</span>
              </div>
              {showTimer && (
                <span className="mt-0.5 text-[10px] tabular-nums opacity-70">{elapsed}s</span>
              )}
            </Button>
          );
        })}
        {commands.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            <AlertTriangle className="mx-auto mb-2 h-5 w-5" />No ready commands.
          </div>
        )}
      </div>
    </div>
  );
}