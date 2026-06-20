import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BellRing, CheckCircle2, Loader2, Lock, MapPin, RotateCcw, ShieldAlert, Unlock, Volume2, Zap } from "lucide-react";
import TelematicsService from "@/lib/telematics/TelematicsService";
import { getCommandReadiness } from "@/lib/telematics/commandReadiness";
import TelematicsAlarmControls from "@/components/telematics/TelematicsAlarmControls";
import { useCommandProgress, PHASES } from "@/hooks/useCommandProgress";
import CommandProgressOverlay from "@/components/telematics/CommandProgressOverlay";

const COMMANDS = {
  remote: [
    { key: "locate", label: "Locate", icon: MapPin },
    { key: "lock", label: "Lock", icon: Lock },
    { key: "unlock", label: "Unlock", icon: Unlock },
    { key: "horn", label: "Horn", icon: Volume2 },
    { key: "lights", label: "Lights", icon: BellRing },
  ],
  security: [
    { key: "alarm_pulse", label: "Find My Vehicle", icon: ShieldAlert, customerLabel: "Find My Vehicle" },
    { key: "disable_starter", label: "Disable Starter", icon: Zap, starter: true },
    { key: "restore_starter", label: "Restore Starter", icon: RotateCcw, starter: true },
  ]
};

export default function VehicleCommandControls({ mode, vehicle, device, provider, booking, hostOwnsVehicle, allowStarter, onCommand }) {
  const progress = useCommandProgress();
  const allowedCustomer = ["lock", "unlock", "alarm_pulse"];

  const visible = (group) => COMMANDS[group].filter((command) => {
    if (mode === "customer" && !allowedCustomer.includes(command.key)) return false;
    const ready = getCommandReadiness({ command: command.key, role: mode, device, provider, booking, hostOwnsVehicle, allowStarter });
    return ready.supported;
  });

  const isBusy = progress.phase && progress.phase !== PHASES.idle && progress.phase !== PHASES.success && progress.phase !== PHASES.failed;

  const send = async (commandType, starter = false) => {
  if (commandType === "alarm_pulse") {
    progress.startOptimistic(commandType);
    try {
      const res = await TelematicsService.startAlarm({ vehicle_id: vehicle?.id, telematics_device_id: device?.id });
      await onCommand?.(res.data);
      // For customers, show "Opening directions..." and open maps immediately
      if (mode === "customer" && vehicle?.vehicle_lat && vehicle?.vehicle_lon) {
        progress.setPhase("opening_directions");
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${vehicle.vehicle_lat},${vehicle.vehicle_lon}`, "_blank");
        setTimeout(() => progress.reset(), 2000);
        return;
      }
      progress.reset();
    } catch {
      progress.reset();
    }
    return;
  }

  const reason = starter ? window.prompt("Reason for starter command") : "";
  if (starter && (!reason || reason.trim().length < 5 || !window.confirm("Confirm this high-risk starter command?"))) return;

  // Show "Reaching your vehicle…" immediately — gate hold happens server-side
  progress.startOptimistic(commandType);

  try {
    console.log(`[SEND_CMD] Sending ${commandType} device=${device?.id} vehicle=${vehicle?.id}`);
    const res = await TelematicsService.sendCommand({
      telematics_device_id: device?.id,
      vehicle_id: vehicle?.id,
      booking_id: booking?.id || "",
      command_type: commandType,
      source: "vehicle_command_center",
      reason,
      confirm_starter_command: !!starter
    });

    console.log(`[SEND_CMD] Response:`, res.data);
    const data = res.data;
    const cmdId = data?.command_id || data?.id;
    // API returned = gate hold is done, now poll for ACK
    progress.transitionToPolling(commandType, cmdId);
    await onCommand?.(data);
  } catch (err) {
    console.error(`[SEND_CMD] Error:`, err);
    progress.reset();
  }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {mode !== "customer" && (
        <ControlSection
          title="Remote Controls"
          subtitle="Readiness-filtered commands routed through sendTelematicsCommand."
          commands={visible("remote")}
          isBusy={isBusy}
          activeCommand={progress.commandType}
          phase={progress.phase}
          onSend={send}
        />
      )}
      <div className="space-y-3">
        <ControlSection
          title={mode === "customer" ? "Vehicle Controls" : "Security Controls"}
          subtitle={mode === "customer" ? "Quick actions to locate, lock, or unlock your vehicle." : "Starter controls require reason and confirmation."}
          commands={visible("security")}
          isBusy={isBusy}
          activeCommand={progress.commandType}
          phase={progress.phase}
          onSend={send}
        />
        {vehicle?.id && ["admin", "host"].includes(mode) && (
          <TelematicsAlarmControls vehicleId={vehicle.id} role={mode} onResult={onCommand} />
        )}
      </div>

      <CommandProgressOverlay
        phase={progress.phase}
        elapsed={progress.elapsed}
        phaseElapsed={progress.phaseElapsed}
        commandType={progress.commandType}
        errorMessage={progress.errorMessage}
      />
    </div>
  );
}

const PHASE_LABELS = {
  connecting: "Establishing Connection",
  sending: "Command Sent",
  waiting: "Confirming",
  success: null,
  failed: "Connection Lost",
};

const SUCCESS_LABELS = {
  lock: "Vehicle Secured",
  unlock: "Vehicle Unlocked",
  locate: "Vehicle Located",
  horn: "Horn Activated",
  lights: "Lights Activated",
  horn_lights: "Horn & Lights Activated",
  alarm_pulse: "Alert Sent",
  disable_starter: "Starter Disabled",
  restore_starter: "Starter Restored",
  status: "Status Received",
};

const PHASE_COLORS = {
  connecting: "border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-transparent text-yellow-300",
  sending: "border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-transparent text-blue-300",
  waiting: "border-primary/30 bg-gradient-to-br from-primary/10 to-transparent text-primary",
  success: "border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 to-transparent text-emerald-400",
  failed: "border-red-500/30 bg-gradient-to-br from-red-500/10 to-transparent text-red-400",
};

function ControlSection({ title, subtitle, commands, isBusy, activeCommand, phase, onSend }) {
  return (
    <div className="rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl p-5 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground tracking-tight">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground/80">{subtitle}</p>
        </div>
        <Badge variant="outline" className="rounded-full border-border/50 bg-secondary/30 text-xs font-semibold">{commands.length} available</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {commands.map((command) => {
          const Icon = command.icon;
          const isActive = activeCommand === command.key && isBusy;
          const isThisPhase = activeCommand === command.key && phase && phase !== PHASES.idle;
          const phaseColor = isThisPhase ? (PHASE_COLORS[phase] || "") : "bg-gradient-to-br from-secondary/60 to-secondary/40 text-foreground hover:from-secondary/80 hover:to-secondary/60";
          const phaseLabel = phase === PHASES.success && activeCommand === command.key 
            ? (SUCCESS_LABELS[command.key] || "Complete") 
            : (isThisPhase ? PHASE_LABELS[phase] : command.label);

          return (
            <Button
              key={command.key}
              variant="outline"
              disabled={isBusy}
              onClick={() => onSend(command.key, command.starter)}
              className={`group relative h-20 flex-col overflow-hidden rounded-2xl border-border/50 backdrop-blur transition-all duration-500 ${phaseColor} ${isActive ? "scale-[1.02]" : ""}`}
            >
              {isActive ? (
                <div className="relative">
                  <Loader2 className={`h-5 w-5 animate-spin ${phase === "connecting" ? "text-yellow-300" : phase === "sending" ? "text-blue-300" : "text-primary"}`} />
                  <div className="absolute inset-0 animate-ping opacity-20" />
                </div>
              ) : phase === "success" && activeCommand === command.key ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : (
                <Icon className={`h-5 w-5 transition-transform duration-300 ${isThisPhase ? "" : "text-primary group-hover:scale-110"}`} />
              )}
              <span className="mt-1.5 text-[11px] font-bold tracking-wide">{phaseLabel}</span>
            </Button>
          );
        })}
        {commands.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border/40 bg-secondary/20 p-5 text-center text-sm text-muted-foreground/70">
            <AlertTriangle className="mx-auto mb-2 h-5 w-5 opacity-50" />No commands available
          </div>
        )}
      </div>
    </div>
  );
}