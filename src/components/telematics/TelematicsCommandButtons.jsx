import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Lock, Unlock, Volume2, Loader2, Zap, RotateCcw } from "lucide-react";
import TelematicsService from "@/lib/telematics/TelematicsService";

const COMMANDS = [
  { key: "locate", label: "Locate", icon: MapPin, capability: "supports_location", deviceFlag: "gps_enabled", roles: ["admin", "host", "customer", "installer"], tone: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  { key: "lock", label: "Lock", icon: Lock, capability: "supports_lock", deviceFlag: "lock_unlock_enabled", roles: ["admin", "host", "customer"], tone: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  { key: "unlock", label: "Unlock", icon: Unlock, capability: "supports_unlock", deviceFlag: "lock_unlock_enabled", roles: ["admin", "host", "customer"], tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { key: "horn_lights", label: "Horn/Lights", icon: Volume2, capability: "supports_horn", deviceFlag: "horn_light_enabled", roles: ["admin", "host", "customer"], tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { key: "disable_starter", label: "Disable Starter", icon: Zap, capability: "supports_starter_disable", roles: ["admin", "host"], starter: true, tone: "bg-red-500/15 text-red-300 border-red-500/30" },
  { key: "restore_starter", label: "Restore Starter", icon: RotateCcw, capability: "supports_starter_restore", roles: ["admin", "host"], starter: true, tone: "bg-green-500/15 text-green-300 border-green-500/30" },
];

export default function TelematicsCommandButtons({ vehicleId, bookingId, device, provider, role = "admin", booking, allowStarter = false, onResult }) {
  const [loading, setLoading] = useState(null);
  const dryRun = provider?.execution_mode === "dry_run" || provider?.allow_live_commands === false;
  const deviceReady = !device || ["approved", "live_enabled"].includes(device.lifecycle_status) || device.provider_key === "moovetrax" || device.traccar_test_activation_enabled;
  const bookingAllowsControls = !booking || (["active", "approved", "confirmed"].includes(booking.booking_status) && booking.payment_status !== "failed" && !booking.starter_disabled && !booking.moovetrax_kill_active);

  const visibleCommands = useMemo(() => COMMANDS.filter(cmd => {
    if (!cmd.roles.includes(role)) return false;
    if (cmd.starter && role === "customer") return false;
    if (cmd.starter && role === "host" && !allowStarter && device?.host_starter_control_enabled !== true) return false;
    if (!deviceReady) return false;
    if (cmd.starter && provider?.allow_starter_commands === false) return false;
    if (provider && provider[cmd.capability] === false) return false;
    if (device && cmd.deviceFlag && device[cmd.deviceFlag] === false) return false;
    if (role === "customer" && !bookingAllowsControls) return false;
    return true;
  }), [role, allowStarter, provider, device, bookingAllowsControls, deviceReady]);

  const send = async (command_type) => {
    setLoading(command_type);
    const res = await TelematicsService.sendCommand({ vehicle_id: vehicleId, booking_id: bookingId, command_type });
    onResult?.(res.data);
    setLoading(null);
  };

  if (visibleCommands.length === 0) return <p className="text-xs text-muted-foreground">No available telematics commands for this device.</p>;

  return (
    <div className="space-y-2">
      {dryRun && <Badge variant="outline" className="border-yellow-500/30 text-yellow-400 bg-yellow-500/10">Test Mode</Badge>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visibleCommands.map(cmd => {
          const Icon = cmd.icon;
          const busy = loading === cmd.key;
          return <Button key={cmd.key} variant="outline" disabled={!!loading} onClick={() => send(cmd.key)} className={`justify-start gap-2 border ${cmd.tone}`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}{cmd.label}</Button>;
        })}
      </div>
    </div>
  );
}