export function getVehicleDisplayName(vehicle, device = {}) {
  if (vehicle?.display_name?.trim()) return vehicle.display_name.trim();
  if (vehicle?.plate?.trim()) return vehicle.plate.trim();

  const yearMakeModel = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ").trim();
  if (yearMakeModel) return yearMakeModel;

  if (vehicle?.vin) return `VIN ${String(vehicle.vin).slice(-6)}`;
  if (device?.unique_id) return String(device.unique_id);
  if (device?.device_imei) return `IMEI ${String(device.device_imei).slice(-6)}`;

  return "Vehicle";
}

export function getVehicleMapLabel(vehicle, device = {}) {
  const name = getVehicleDisplayName(vehicle, device);
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}