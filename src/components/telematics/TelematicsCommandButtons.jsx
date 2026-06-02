import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import TelematicsService from "@/lib/telematics/TelematicsService";
import TelematicsAlarmControls from "@/components/telematics/TelematicsAlarmControls";
import { TELEMATICS_COMMAND_BY_KEY, commandTone } from "@/lib/telematics/commandCatalog";

export default function TelematicsCommandButtons({
  vehicleId,
  bookingId,
  telematicsDeviceId,
  uniqueId,
  device,
  role = "admin",
  booking,
  showAlarmControls = true,
  unavailableMessage = "No available telematics commands for this device.",
  onResult
}) {
  const [loading, setLoading] = useState(null);
  const targetDeviceId = telematicsDeviceId || device?.id || "";
  const targetUniqueId = uniqueId || device?.unique_id || "";
  const hasTarget = !!vehicleId || !!bookingId || !!targetDeviceId || !!targetUniqueId;

  const capabilities = useQuery({
    queryKey: ["telematics-command-capabilities", role, vehicleId || "", bookingId || "", targetDeviceId, targetUniqueId],
    queryFn: () => base44.functions.invoke("getTelematicsCommandCapabilities", {
      role,
      vehicle_id: vehicleId,
      booking_id: bookingId,
      telematics_device_id: targetDeviceId,
      unique_id: targetUniqueId
    }).then((res) => res.data),
    enabled: hasTarget,
    refetchInterval: 30000,
    retry: false
  });

  const commands = (capabilities.data?.commands || []).filter((command) => command.visible);
  const dryRun = capabilities.data?.context?.dry_run;

  const send = async (command_type) => {
    setLoading(command_type);
    try {
      const res = await TelematicsService.sendCommand({
        vehicle_id: vehicleId,
        booking_id: bookingId,
        telematics_device_id: targetDeviceId,
        unique_id: targetUniqueId,
        command_type,
        admin_device_command_test: role === "admin" && (!!targetDeviceId || !!targetUniqueId) && !bookingId,
        source: role === "admin" ? "admin_control" : role === "host" ? "host_control" : "customer_control"
      });
      onResult?.(res.data);
      await capabilities.refetch();
    } finally {
      setLoading(null);
    }
  };

  if (!hasTarget) return <p className="text-xs text-muted-foreground">Vehicle controls are not available because no command target is selected.</p>;
  if (capabilities.isLoading) return <p className="text-xs text-muted-foreground">Checking command availability…</p>;
  if (capabilities.error) return <p className="text-xs text-red-400">Unable to load command availability.</p>;
  if (!commands.length) return <p className="text-xs text-muted-foreground">{unavailableMessage}</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {dryRun && <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-400">Test Mode</Badge>}
        {capabilities.data?.context?.live && <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">Live</Badge>}
        {capabilities.data?.context?.device_live_but_unassigned && <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-300">Live but unassigned</Badge>}
      </div>
      {showAlarmControls && ["admin", "host"].includes(role) && vehicleId && <TelematicsAlarmControls vehicleId={vehicleId} role={role} onResult={onResult} />}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {commands.map((command) => {
          const catalog = TELEMATICS_COMMAND_BY_KEY[command.key] || {};
          const Icon = catalog.icon;
          const busy = loading === command.key;
          return (
            <Button
              key={command.key}
              type="button"
              variant="outline"
              disabled={!!loading || !command.enabled}
              title={command.enabled ? "Available" : command.reason}
              onClick={() => send(command.key)}
              className={`h-auto min-h-10 justify-start gap-2 border py-2 text-left ${command.enabled ? commandTone(command.key) : "border-slate-500/20 bg-slate-500/10 text-slate-400"}`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
              <span className="min-w-0">
                <span className="block truncate">{command.label}</span>
                {!command.enabled && command.reason && <span className="block truncate text-[10px] opacity-80">{command.reason}</span>}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}