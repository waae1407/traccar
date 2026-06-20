import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BellRing, Loader2, Lock, MapPin, RotateCcw, ShieldAlert, Unlock, Volume2, Zap } from "lucide-react";
import TelematicsService from "@/lib/telematics/TelematicsService";
import { getCommandReadiness } from "@/lib/telematics/commandReadiness";
import TelematicsAlarmControls from "@/components/telematics/TelematicsAlarmControls";

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
export default function VehicleCommandControls({ mode, vehicle, device, provider, booking, hostOwnsVehicle, allowStarter, onCommand }) {
  const [sending, setSending] = useState(null);
  const allowedCustomer = ["locate", "lock", "unlock", "alarm_pulse"];

  const visible = (group) => COMMANDS[group].filter((command) => {
    if (mode === "customer" && !allowedCustomer.includes(command.key)) return false;
    const ready = getCommandReadiness({ command: command.key, role: mode, device, provider, booking, hostOwnsVehicle, allowStarter });
    return ready.supported;
  });

  const send = async (commandType, starter = false) => {
    setSending(commandType);
    try {
      if (commandType === "alarm_pulse") {
        const res = await TelematicsService.startAlarm({ vehicle_id: vehicle?.id });
        await onCommand?.(res.data);
      } else {
        const reason = starter ? window.prompt("Reason for starter command") : "";
        if (starter && (!reason || reason.trim().length < 5 || !window.confirm("Confirm this high-risk starter command?"))) {
          setSending(null);
          return;
        }
        const res = await TelematicsService.sendCommand({
          vehicle_id: vehicle?.id,
          booking_id: booking?.id || "",
          command_type: commandType,
          source: "vehicle_command_center",
          reason,
          confirm_starter_command: !!starter
        });
        await onCommand?.(res.data);
      }
    } catch (err) {
      console.error('[VehicleCommandControls] Command error:', err);
    } finally {
      setTimeout(() => setSending(null), 3000);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ControlSection
        title="Remote Controls"
        subtitle="Readiness-filtered commands routed through sendTelematicsCommand."
        commands={visible("remote")}
        sending={sending}
        onSend={send}
      />
      <div className="space-y-3">
        <ControlSection
          title="Security Controls"
          subtitle={mode === "customer" ? "Starter controls are never exposed to renters." : "Starter controls require reason and confirmation."}
          commands={visible("security")}
          sending={sending}
          onSend={send}
        />
        {vehicle?.id && ["admin", "host"].includes(mode) && (
          <TelematicsAlarmControls vehicleId={vehicle.id} role={mode} onResult={onCommand} />
        )}
      </div>
    </div>
  );
}

function ControlSection({ title, subtitle, commands, sending, onSend }) {
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
          const isSending = sending === command.key;

          return (
            <Button
              key={command.key}
              variant="outline"
              disabled={isSending}
              onClick={() => onSend(command.key, command.starter)}
              className="h-20 flex-col rounded-2xl border-border bg-secondary text-foreground hover:bg-secondary/80 transition-all duration-300"
            >
              <div className="flex items-center gap-2">
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
                <span className="text-xs font-black">{command.label}</span>
              </div>
              {isSending && (
                <span className="mt-0.5 text-[10px] text-muted-foreground">Sending…</span>
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