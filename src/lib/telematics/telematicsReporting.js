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
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false; // 0,0 is invalid
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && Math.abs(lat) > 0.0001;
}

/**
 * Canonical GPS freshness rule:
 * online   = provider says online AND last_seen_at within 10 min
 * recent   = last_seen_at within 60 min
 * stale    = last_seen_at older than 60 min
 * offline  = provider says offline OR no heartbeat beyond threshold
 * unknown  = no last_seen_at and no provider status
 */
export function getDeviceFreshness(device) {
  if (!device) return { status: "unknown", label: "No device", color: "gray", ageMinutes: null };
  const lastSeen = device.last_seen_at || device.location_updated_at;
  const ageMs = lastSeen ? Date.now() - new Date(lastSeen).getTime() : null;
  const ageMinutes = ageMs !== null ? Math.round(ageMs / 60000) : null;
  const providerOnline = device.online_status === "online";
  const providerOffline = device.online_status === "offline";

  if (!lastSeen && !device.online_status) {
    return { status: "unknown", label: "No GPS data", color: "gray", ageMinutes: null };
  }
  if (providerOnline && ageMs !== null && ageMs < 10 * 60 * 1000) {
    return { status: "online", label: "Live", color: "green", ageMinutes };
  }
  if (ageMs !== null && ageMs < 60 * 60 * 1000) {
    return { status: "recent", label: `${ageMinutes}m ago`, color: "blue", ageMinutes };
  }
  if (ageMs !== null && ageMs >= 60 * 60 * 1000) {
    const hours = Math.round(ageMs / (60 * 60 * 1000));
    return { status: "stale", label: `${hours}h ago`, color: "yellow", ageMinutes };
  }
  if (providerOffline) {
    return { status: "offline", label: "Offline", color: "red", ageMinutes };
  }
  return { status: "unknown", label: "Status unknown", color: "gray", ageMinutes };
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
  // Freshness-based online count (not raw provider field)
  const trulyOnline = reportableDevices.filter((device) => getDeviceFreshness(device).status === "online").length;
  const recentlySeen = reportableDevices.filter((device) => getDeviceFreshness(device).status === "recent").length;
  const online = trulyOnline; // canonical: only green if truly online by freshness rule
  const offline = reportableDevices.filter((device) => ["offline", "stale", "unknown"].includes(getDeviceFreshness(device).status)).length;
  const unknown = reportableDevices.filter((device) => getDeviceFreshness(device).status === "unknown").length;
  const stale = reportableDevices.filter((device) => getDeviceFreshness(device).status === "stale").length;
  const suspended = reportableDevices.filter((device) => device.lifecycle_status === "suspended").length;
  const withLocation = reportableDevices.filter(hasValidCoordinates).length;

  return { total, active, assigned, unassigned, online, offline, unknown, stale, suspended, withLocation, recentlySeen };
}

export function getVehicleTelematicsDevice(vehicle, devices = []) {
  if (!vehicle) return null;
  const reportableDevices = devices.filter((device) => device.lifecycle_status !== "retired");
  return reportableDevices.find((device) => device.id === vehicle.telematics_device_id)
    || reportableDevices.find((device) => device.vehicle_id === vehicle.id)
    || null;
}

const ACTIVE_RENTAL_BOOKING_STATUSES = ["active", "approved", "confirmed", "payment_due", "grace_period", "suspended"];

/**
 * Returns bookings for active rentals whose vehicle has no linked telematics device.
 * @param {Array} bookings - BookingRequest records
 * @param {Array} vehicles - Vehicle records
 * @param {Array} devices  - TelematicsDevice records
 */
export function getActiveRentalsWithoutDevice(bookings = [], vehicles = [], devices = []) {
  const activeBookings = bookings.filter(b => ACTIVE_RENTAL_BOOKING_STATUSES.includes(b.booking_status));
  return activeBookings.filter(b => {
    const vehicle = vehicles.find(v => v.id === b.vehicle_id);
    if (!vehicle) return true; // no vehicle found = no device either
    return !getVehicleTelematicsDevice(vehicle, devices);
  });
}

/**
 * Device assignment integrity checks — reporting only, no auto-fix.
 */
export function getDeviceAssignmentWarnings(devices = [], vehicles = []) {
  const warnings = [];

  // Multiple vehicles with same device
  const deviceToVehicles = {};
  vehicles.forEach(v => {
    if (v.telematics_device_id) {
      if (!deviceToVehicles[v.telematics_device_id]) deviceToVehicles[v.telematics_device_id] = [];
      deviceToVehicles[v.telematics_device_id].push(v.id);
    }
  });
  Object.entries(deviceToVehicles).forEach(([deviceId, vehicleIds]) => {
    if (vehicleIds.length > 1) warnings.push({ type: "duplicate_vehicle_assignment", deviceId, vehicleIds, label: `Device assigned to ${vehicleIds.length} vehicles` });
  });

  // Multiple devices per vehicle (via device.vehicle_id)
  const vehicleToDevices = {};
  devices.forEach(d => {
    if (d.vehicle_id && d.lifecycle_status !== "retired") {
      if (!vehicleToDevices[d.vehicle_id]) vehicleToDevices[d.vehicle_id] = [];
      vehicleToDevices[d.vehicle_id].push(d.id);
    }
  });
  Object.entries(vehicleToDevices).forEach(([vehicleId, deviceIds]) => {
    if (deviceIds.length > 1) warnings.push({ type: "multiple_devices_per_vehicle", vehicleId, deviceIds, label: `Vehicle has ${deviceIds.length} devices linked` });
  });

  // Device with coordinates but no vehicle
  devices.filter(d => hasValidCoordinates(d) && !d.vehicle_id && d.lifecycle_status !== "retired")
    .forEach(d => warnings.push({ type: "orphan_device_with_coords", deviceId: d.id, label: "Device has GPS coordinates but no vehicle assigned" }));

  return warnings;
}