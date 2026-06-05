export const ACTIVE_TELEMATICS_LIFECYCLES = [
  "assigned",
  "installation_started",
  "installation_completed",
  "installation_completed_unlinked",
  "live_ready",
  "live_enabled"
];

export function hasValidCoordinates(device) {
  const lat = Number(device?.last_latitude);
  const lng = Number(device?.last_longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function isTelematicsDeviceActive(device) {
  if (!device || ["retired", "suspended"].includes(device.lifecycle_status)) return false;
  return Boolean(device.vehicle_id) || ACTIVE_TELEMATICS_LIFECYCLES.includes(device.lifecycle_status);
}

export function isTelematicsDeviceStale(device, staleHours = 6) {
  if (!device?.last_seen_at) return true;
  return new Date(device.last_seen_at).getTime() < Date.now() - staleHours * 60 * 60 * 1000;
}

export function getTelematicsDeviceStats(devices = []) {
  const reportableDevices = devices.filter((device) => device.lifecycle_status !== "retired");
  const total = reportableDevices.length;
  const active = reportableDevices.filter(isTelematicsDeviceActive).length;
  const assigned = reportableDevices.filter((device) => Boolean(device.vehicle_id)).length;
  const unassigned = reportableDevices.filter((device) => !device.vehicle_id && device.assigned_status !== "assigned").length;
  const online = reportableDevices.filter((device) => device.online_status === "online").length;
  const offline = reportableDevices.filter((device) => device.online_status === "offline").length;
  const unknown = reportableDevices.filter((device) => !["online", "offline"].includes(device.online_status)).length;
  const stale = reportableDevices.filter(isTelematicsDeviceStale).length;
  const suspended = reportableDevices.filter((device) => device.lifecycle_status === "suspended").length;
  const withLocation = reportableDevices.filter(hasValidCoordinates).length;

  return { total, active, assigned, unassigned, online, offline, unknown, stale, suspended, withLocation };
}

export function getVehicleTelematicsDevice(vehicle, devices = []) {
  if (!vehicle) return null;
  const reportableDevices = devices.filter((device) => device.lifecycle_status !== "retired");
  return reportableDevices.find((device) => device.id === vehicle.telematics_device_id)
    || reportableDevices.find((device) => device.vehicle_id === vehicle.id)
    || null;
}