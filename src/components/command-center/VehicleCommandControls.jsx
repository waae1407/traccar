import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BellRing, CheckCircle2, Clock, Lock, MapPin, RotateCcw, ShieldAlert, Unlock, Volume2, XCircle, Zap } from "lucide-react";
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

export default function VehicleCommandControls({ mode, vehicle, device, provider, booking, hostOwnsVehicle, allowStarter, onCommand }) {
  const { buttonStates, activeCommand, startOptimistic, transitionToPolling, reset, PHASES } = useCommandProgress();
  const allowedCustomer = ["locate", "lock", "unlock", "alarm_pulse"];

  const visible = (group) => COMMANDS[group].filter((command) => {
    if (mode === "customer" && !allowedCustomer.includes(command.key)) return false;
    const ready = getCommandReadiness({ command: command.key, role: mode, device, provider, booking, hostOwnsVehicle, allowStarter });
    return ready.supported;
  });

  const isBusy = !!activeCommand;

  const send = async (commandType, starter = false) => {
    if (commandType === "alarm_pulse") {
      startOptimistic(commandType);
      try {
        const res = await TelematicsService.startAlarm({ vehicle_id: vehicle?.id });
        transitionToPolling(commandType, res.data?.command_id || res.data?.id);
        await onCommand?.(res.data);
      } catch {
        reset(commandType);
      }
      return;
    }

    const reason = starter ? window.prompt("Reason for starter command") : "";
    if (starter && (!reason || reason.trim().length < 5 || !window.confirm("Confirm this high-risk starter command?"))) return;

    startOptimistic(commandType);

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
      transitionToPolling(commandType, cmdId);
      await onCommand?.(data);
    } catch {
      reset(commandType);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ControlSection
        title="Remote Controls"
        commands={visible("remote")}
        isBusy={isBusy}
        activeCommand={activeCommand}
        buttonStates={buttonStates}
        onSend={send}
      />
      <div className="space-y-3">
        <ControlSection
          title="Security Controls"
          commands={visible("security")}
          isBusy={isBusy}
          activeCommand={activeCommand}
          buttonStates={buttonStates}
          onSend={send}
        />
        {vehicle?.id && ["admin", "host"].includes(mode) && (
          <TelematicsAlarmControls vehicleId={vehicle.id} role={mode} onResult={onCommand} />
        )}
      </div>
    </div>
  );
}

// Ticking clock animation component
function TickingClock({ size = 16 }) {
  const [tick, setTick] = React.useState(false);
  React.useEffect(() => {
    const interval = setInterval(() => setTick(t => !t), 800);
    return () => clearInterval(interval);
  }, []);
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <Clock
        style={{ width: size, height: size }}
        className={`transition-all duration-300 ${tick ? "text-yellow-300 scale-110" : "text-yellow-400 scale-100"}`}
      />
    </span>
  );
}

function CommandButton({ command, isBusy, isContacting, buttonState, onSend }) {
  const Icon = command.icon;
  const phase = buttonState?.phase;
  const label = buttonState?.label;

  // Determine button appearance
  let bgClass = "bg-secondary hover:bg-secondary/80 text-foreground border-border";
  let iconEl = <Icon className="h-5 w-5 text-primary" />;
  let displayLabel = command.label;

  if (isContacting) {
    bgClass = "bg-yellow-500/10 border-yellow-500/30 text-yellow-300 cursor-wait";
    iconEl = <TickingClock size={20} />;
    displayLabel = "Contacting…";
  } else if (phase === PHASES.success) {
    bgClass = "bg-emerald-500/20 border-emerald-500/50 text-emerald-300";
    iconEl = <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
    displayLabel = label;
  } else if (phase === PHASES.failed) {
    bgClass = "bg-red-500/20 border-red-500/50 text-red-300";
    iconEl = <XCircle className="h-5 w-5 text-red-400" />;
    displayLabel = label;
  }

  return (
    <button
      disabled={isBusy}
      onClick={() => onSend(command.key, command.starter)}
      className={`h-20 flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed ${bgClass}`}
    >
      {iconEl}
      <span className="text-xs font-black leading-tight text-center">{displayLabel}</span>
    </button>
  );
}

function ControlSection({ title, commands, isBusy, activeCommand, buttonStates, onSend }) {
  return (
    <div className="rounded-[1.75rem] border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="text-lg font-black text-foreground">{title}</h3>
        <Badge variant="outline" className="rounded-full">{commands.length} ready</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {commands.map((command) => (
          <CommandButton
            key={command.key}
            command={command}
            isBusy={isBusy}
            isContacting={activeCommand === command.key}
            buttonState={buttonStates[command.key]}
            onSend={onSend}
          />
        ))}
        {commands.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            <AlertTriangle className="mx-auto mb-2 h-5 w-5" />No ready commands.
          </div>
        )}
      </div>
    </div>
  );
}