import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, BellRing, Car, Loader2, Lock, MapPin, RotateCcw, ShieldAlert, Unlock, Volume2, Zap } from "lucide-react";
import TelematicsService from "@/lib/telematics/TelematicsService";
import { getCommandReadiness } from "@/lib/telematics/commandReadiness";

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
  const [loading, setLoading] = React.useState("");
  const [last, setLast] = React.useState(null);
  const allowedCustomer = ["locate", "lock", "unlock", "alarm_pulse"];

  const visible = (group) => COMMANDS[group].filter((command) => {
    if (mode === "customer" && !allowedCustomer.includes(command.key)) return false;
    const ready = getCommandReadiness({ command: command.key, role: mode, device, provider, booking, hostOwnsVehicle, allowStarter });
    return ready.supported;
  });

  const send = async (commandType, starter = false) => {
    const reason = starter ? window.prompt("Reason for starter command") : "";
    if (starter && (!reason || reason.trim().length < 5 || !window.confirm("Confirm this high-risk starter command?"))) return;
    setLoading(commandType);
    setLast({ command: commandType, status: "sending" });
    try {
      const res = await TelematicsService.sendCommand({
        vehicle_id: vehicle?.id,
        booking_id: booking?.id || "",
        command_type: commandType,
        source: "vehicle_command_center",
        reason,
        confirm_starter_command: !!starter
      });
      setLast({ command: commandType, status: res.data?.queue_status || "sent" });
      await onCommand?.(res.data);
    } catch (error) {
      setLast({ command: commandType, status: "failed", message: error?.response?.data?.error || error.message });
    } finally {
      setLoading("");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ControlSection title="Remote Controls" subtitle="Readiness-filtered commands routed through sendTelematicsCommand." commands={visible("remote")} loading={loading} onSend={send} />
      <ControlSection title="Security Controls" subtitle={mode === "customer" ? "Starter controls are never exposed to renters." : "Starter controls require reason and confirmation."} commands={visible("security")} loading={loading} onSend={send} />
      {last && (
        <div className={`rounded-2xl border p-3 text-sm lg:col-span-2 ${last.status === "failed" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          <span className="font-black">{last.command.replaceAll("_", " ")}</span> · {last.status}{last.message ? ` — ${last.message}` : ""}
        </div>
      )}
    </div>
  );
}

function ControlSection({ title, subtitle, commands, loading, onSend }) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-950">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        <Badge variant="outline" className="rounded-full">{commands.length} ready</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {commands.map((command) => {
          const Icon = command.icon;
          const busy = loading === command.key;
          return (
            <Button key={command.key} variant="outline" disabled={!!loading} onClick={() => onSend(command.key, command.starter)} className="h-20 flex-col rounded-2xl border-slate-200 bg-slate-50 text-slate-900 hover:bg-white">
              {busy ? <Loader2 className="h-5 w-5 animate-spin text-pink-600" /> : <Icon className="h-5 w-5 text-pink-600" />}
              <span className="text-xs font-black">{command.label}</span>
            </Button>
          );
        })}
        {commands.length === 0 && <div className="col-span-full rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500"><AlertTriangle className="mx-auto mb-2 h-5 w-5" />No ready commands.</div>}
      </div>
    </div>
  );
}