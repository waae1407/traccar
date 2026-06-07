export const CANONICAL_COMMANDS = [
  "locate",
  "status",
  "lock",
  "unlock",
  "horn",
  "lights",
  "horn_lights",
  "alarm_pulse",
  "disable_starter",
  "restore_starter",
];

export const CUSTOMER_SAFE_COMMANDS = ["locate", "lock", "unlock", "alarm_pulse"];
export const STARTER_COMMANDS = ["disable_starter", "restore_starter"];

export const LEGACY_COMMAND_ALIASES = {
  location: "locate",
  find_my_car: "alarm_pulse",
  panic: "alarm_pulse",
  kill: "disable_starter",
  unkill: "restore_starter",
};

export function normalizeCommandName(command) {
  const value = String(command || "").trim();
  return LEGACY_COMMAND_ALIASES[value] || value;
}

export function isCanonicalCommand(command) {
  return CANONICAL_COMMANDS.includes(normalizeCommandName(command));
}

export function commandLabel(command) {
  const normalized = normalizeCommandName(command);
  return {
    locate: "Locate",
    status: "Status",
    lock: "Lock",
    unlock: "Unlock",
    horn: "Horn",
    lights: "Lights",
    horn_lights: "Horn & Lights",
    alarm_pulse: "Find Vehicle",
    disable_starter: "Disable Starter",
    restore_starter: "Restore Starter",
  }[normalized] || normalized;
}