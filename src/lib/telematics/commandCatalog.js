import { Activity, Lightbulb, Lock, MapPin, Power, RefreshCw, Unlock, Volume2 } from "lucide-react";

export const TELEMATICS_COMMAND_CATALOG = [
  { key: "locate", label: "Locate", icon: MapPin, providerCapability: "supports_location", allowedRoles: ["admin", "host", "customer", "installer"], requiresActiveBooking: false, requiresPaidBooking: false, starter: false, liveCommandRequired: true, supportedProviders: ["traccar_noran_mt20", "moovetrax"] },
  { key: "lock", label: "Lock", icon: Lock, providerCapability: "supports_lock", deviceFlag: "lock_unlock_enabled", allowedRoles: ["admin", "host", "customer", "installer"], requiresActiveBooking: false, requiresPaidBooking: false, starter: false, liveCommandRequired: true, supportedProviders: ["traccar_noran_mt20", "moovetrax"] },
  { key: "unlock", label: "Unlock", icon: Unlock, providerCapability: "supports_unlock", deviceFlag: "lock_unlock_enabled", allowedRoles: ["admin", "host", "customer", "installer"], requiresActiveBooking: false, requiresPaidBooking: false, starter: false, liveCommandRequired: true, supportedProviders: ["traccar_noran_mt20", "moovetrax"] },
  { key: "horn", label: "Horn", icon: Volume2, providerCapability: "supports_horn", deviceFlag: "horn_light_enabled", allowedRoles: ["admin", "installer"], requiresActiveBooking: false, requiresPaidBooking: false, starter: false, liveCommandRequired: true, supportedProviders: ["traccar_noran_mt20", "moovetrax"] },
  { key: "lights", label: "Lights", icon: Lightbulb, providerCapability: "supports_lights", deviceFlag: "horn_light_enabled", allowedRoles: ["admin", "installer"], requiresActiveBooking: false, requiresPaidBooking: false, starter: false, liveCommandRequired: true, supportedProviders: ["traccar_noran_mt20"] },
  { key: "horn_lights", label: "Horn/Lights", icon: Volume2, providerCapability: "supports_horn", deviceFlag: "horn_light_enabled", allowedRoles: ["admin", "host"], requiresActiveBooking: false, requiresPaidBooking: false, starter: false, liveCommandRequired: true, supportedProviders: ["traccar_noran_mt20", "moovetrax"] },
  { key: "alarm_pulse", label: "Find My Car", icon: Volume2, providerCapability: "supports_horn", deviceFlag: "horn_light_enabled", allowedRoles: ["admin", "host", "customer", "installer"], requiresActiveBooking: false, requiresPaidBooking: false, starter: false, liveCommandRequired: true, supportedProviders: ["traccar_noran_mt20", "moovetrax"] },
  { key: "disable_starter", label: "Disable Starter", icon: Power, providerCapability: "supports_starter_disable", allowedRoles: ["admin", "host", "installer"], requiresActiveBooking: false, requiresPaidBooking: false, starter: true, liveCommandRequired: true, supportedProviders: ["traccar_noran_mt20", "moovetrax"] },
  { key: "restore_starter", label: "Restore Starter", icon: RefreshCw, providerCapability: "supports_starter_restore", allowedRoles: ["admin", "host", "installer"], requiresActiveBooking: false, requiresPaidBooking: false, starter: true, liveCommandRequired: true, supportedProviders: ["traccar_noran_mt20", "moovetrax"] },
  { key: "status", label: "Status", icon: Activity, providerCapability: "supports_location", allowedRoles: ["admin", "host", "installer"], requiresActiveBooking: false, requiresPaidBooking: false, starter: false, liveCommandRequired: true, supportedProviders: ["traccar_noran_mt20", "moovetrax"] },
];

export const TELEMATICS_COMMAND_BY_KEY = Object.fromEntries(TELEMATICS_COMMAND_CATALOG.map((command) => [command.key, command]));

export function commandTone(commandKey) {
  const tones = {
    locate: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    lock: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    unlock: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    horn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    lights: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
    horn_lights: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    alarm_pulse: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    disable_starter: "bg-red-500/15 text-red-300 border-red-500/30",
    restore_starter: "bg-green-500/15 text-green-300 border-green-500/30",
    status: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  };
  return tones[commandKey] || "bg-slate-500/15 text-slate-300 border-slate-500/30";
}