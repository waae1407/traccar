import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, Lock, Unlock, Volume2, Loader2, Zap, RotateCcw } from "lucide-react";
import TelematicsService from "@/lib/telematics/TelematicsService";

const COMMANDS = [
  { key: "locate", label: "Locate", icon: MapPin, tone: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  { key: "lock", label: "Lock", icon: Lock, tone: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  { key: "unlock", label: "Unlock", icon: Unlock, tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { key: "horn_lights", label: "Horn/Lights", icon: Volume2, tone: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
];

export default function TelematicsCommandButtons({ vehicleId, bookingId, allowStarter = false, onResult }) {
  const [loading, setLoading] = useState(null);
  const send = async (command_type) => {
    setLoading(command_type);
    const res = await TelematicsService.sendCommand({ vehicle_id: vehicleId, booking_id: bookingId, command_type });
    onResult?.(res.data);
    setLoading(null);
  };

  const allCommands = allowStarter ? [
    ...COMMANDS,
    { key: "disable_starter", label: "Disable Starter", icon: Zap, tone: "bg-red-500/15 text-red-300 border-red-500/30" },
    { key: "restore_starter", label: "Restore Starter", icon: RotateCcw, tone: "bg-green-500/15 text-green-300 border-green-500/30" },
  ] : COMMANDS;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {allCommands.map(cmd => {
        const Icon = cmd.icon;
        const busy = loading === cmd.key;
        return (
          <Button key={cmd.key} variant="outline" disabled={!!loading} onClick={() => send(cmd.key)} className={`justify-start gap-2 border ${cmd.tone}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
            {cmd.label}
          </Button>
        );
      })}
    </div>
  );
}