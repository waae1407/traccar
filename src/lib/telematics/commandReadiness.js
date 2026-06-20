import { CANONICAL_COMMANDS, CUSTOMER_SAFE_COMMANDS, STARTER_COMMANDS, normalizeCommandName } from "@/lib/telematics/commandVocabulary";

const CAPABILITY_MAP = {
  locate: { provider: "supports_location", device: "gps_enabled" },
  status: { provider: "supports_location", device: "gps_enabled" },
  lock: { provider: "supports_lock", device: "lock_unlock_enabled" },
  unlock: { provider: "supports_unlock", device: "lock_unlock_enabled" },
  horn: { provider: "supports_horn", device: "horn_light_enabled" },
  lights: { provider: "supports_lights", device: "horn_light_enabled" },
  horn_lights: { provider: "supports_horn", device: "horn_light_enabled" },
  alarm_pulse: { provider: "supports_horn", device: "horn_light_enabled" },
  disable_starter: { provider: "supports_starter_disable" },
  restore_starter: { provider: "supports_starter_restore" },
};

function ageMs(value) {
  if (!value) return Infinity;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Infinity : Date.now() - time;
}

export function getGpsFreshness(device = {}) {
  const ms = ageMs(device.last_seen_at || device.location_updated_at);
  if (ms < 2 * 60 * 1000) return { status: "live", label: "Live / Recent", ms };
  if (ms < 5 * 60 * 1000) return { status: "delayed", label: "Delayed", ms };
  if (ms < 30 * 60 * 1000) return { status: "stale", label: "Stale", ms };
  return { status: "expired", label: "Location stale", ms };
}

export function isInstallationReady(device = {}) {
  return ["installed"].includes(device.install_status) || ["live_ready", "live_enabled", "installation_completed", "installation_completed_unlinked"].includes(device.lifecycle_status);
}

export function isProductionReady(device = {}, provider = {}) {
  if (provider.execution_mode !== "production" || provider.allow_live_commands !== true) return false;
  if (device.provider_key === "moovetrax") return true;
  return device.production_commands_enabled === true && ["live_ready", "live_enabled"].includes(device.lifecycle_status);
}

export function roleCanUseCommand({ role = "customer", command, hostOwnsVehicle = false, booking = null, allowStarter = false }) {
  const normalized = normalizeCommandName(command);
  if (role === "admin") return true;
  if (role === "installer") return ["locate", "status", "lock", "unlock", "horn", "lights", "alarm_pulse", "disable_starter", "restore_starter"].includes(normalized);
  if (role === "host") {
    if (!hostOwnsVehicle) return false;
    if (STARTER_COMMANDS.includes(normalized)) return allowStarter === true;
    return normalized !== "disable_starter" && normalized !== "restore_starter";
  }
  if (role === "customer") {
    const activePaid = booking && ["active", "approved", "confirmed"].includes(booking.booking_status) && booking.payment_status === "paid" && !booking.starter_disabled && !booking.moovetrax_kill_active;
    return activePaid && CUSTOMER_SAFE_COMMANDS.includes(normalized);
  }
  return false;
}

export function getCommandReadiness({ command, role = "customer", device = {}, provider = {}, booking = null, hostOwnsVehicle = false, allowStarter = false }) {
  const normalized = normalizeCommandName(command);
  const reasons = [];
  if (!CANONICAL_COMMANDS.includes(normalized)) reasons.push("Unsupported command name.");

  const capability = CAPABILITY_MAP[normalized] || {};
  if (provider && capability.provider && provider[capability.provider] === false) reasons.push("Provider does not support this command.");
  if (device && capability.device && device[capability.device] === false) reasons.push("Device does not support this command.");
  if (device?.online_status === "offline") reasons.push("Device is offline.");
  const isReadCommand = ["locate", "status"].includes(normalized);
  if (!isReadCommand && !isInstallationReady(device) && device.provider_key !== "moovetrax" && !device.traccar_test_activation_enabled) reasons.push("Device installation is not ready.");

  if (STARTER_COMMANDS.includes(normalized)) {
    if (provider?.allow_starter_commands === false) reasons.push("Provider starter controls are disabled.");
    if (device?.production_command_scope !== "all_supported_commands") reasons.push("Device is not approved for starter controls.");
    if (role === "host" && device?.host_starter_control_enabled !== true) reasons.push("Host starter control is disabled for this device.");
    if (!isProductionReady(device, provider)) reasons.push("Production command readiness is incomplete.");
  }

  if (!roleCanUseCommand({ role, command: normalized, hostOwnsVehicle, booking, allowStarter })) reasons.push("Role is not allowed to use this command now.");

  return {
    command: normalized,
    supported: reasons.length === 0,
    reasons,
    gps_freshness: getGpsFreshness(device),
    device_online: device?.online_status !== "offline",
    installation_ready: isInstallationReady(device),
    production_ready: isProductionReady(device, provider),
  };
}

export function getSupportedCommands(context = {}) {
  return CANONICAL_COMMANDS.map((command) => getCommandReadiness({ ...context, command })).filter((item) => item.supported);
}