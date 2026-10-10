// Starter State — shared utility for computing whether a vehicle's starter
// will engage, based on TelematicsDevice fields. Used by fleet map markers
// (host + private owner) and admin telematics map markers.
//
// Four states:
//   enabled   → green  — starter enabled, device online, battery healthy → will start
//   disabled  → red    — starter explicitly disabled (payment, safety, manual) → won't start
//   at_risk   → amber  — starter enabled but battery low or device offline → may not start
//   none      → gray   — no GPS device or no starter interrupt support → unmonitored

const BATTERY_CRITICAL_V = 10.5;

export function computeStarterState(device) {
  if (!device) {
    return { state: "none", color: "#6b7280", label: "No GPS", reason: "No GPS device linked", glyph: "—" };
  }

  if (!device.supports_starter_interrupt) {
    return { state: "none", color: "#6b7280", label: "No starter control", reason: "Device does not support starter interrupt", glyph: "⊘" };
  }

  // Starter explicitly disabled
  if (device.starter_disabled) {
    let reason = "Manually disabled";
    const sub = device.subscription_status;
    if (sub === "past_due" || sub === "unpaid" || sub === "control_disabled" || sub === "deactivated" || device.controls_enabled === false) {
      reason = "Payment past due — starter disabled";
    } else if (device.lock_state === "locked" && device.lock_starter_sync_enabled) {
      reason = "Doors locked (auto starter-sync)";
    }
    return { state: "disabled", color: "#ef4444", label: "Won't start", reason, glyph: "🔒" };
  }

  // Device offline — can't confirm starter will engage
  if (device.online_status === "offline") {
    return { state: "at_risk", color: "#f59e0b", label: "May not start", reason: "Device offline — cannot confirm starter state", glyph: "⚠" };
  }

  // Battery critically low
  const voltage = Number(device.battery_voltage ?? device.power_voltage ?? 0);
  if (voltage > 0 && voltage < BATTERY_CRITICAL_V) {
    return { state: "at_risk", color: "#f59e0b", label: "May not start", reason: `Low battery (${voltage.toFixed(1)}V) — jump start may be needed`, glyph: "⚠" };
  }

  // All good
  return { state: "enabled", color: "#10b981", label: "Will start", reason: "Starter enabled, battery healthy", glyph: "🔑" };
}