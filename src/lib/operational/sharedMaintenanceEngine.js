import { base44 } from "@/api/base44Client";
import { assertOperationalScope, getEffectiveOperationalFilters, isWithinSharedDateRange, textMatches } from "./sharedOperationalFilters";

function indexById(records = []) {
  return Object.fromEntries(records.filter(Boolean).map((record) => [record.id, record]));
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const oneDay = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date - today) / oneDay);
}

export function computeSharedMaintenanceStatus(record, vehicle) {
  if (vehicle?.status === "Maintenance") return "in_maintenance";
  const days = daysUntil(record.next_service_date);
  if (days !== null && days < 0) return "overdue";
  if (days !== null && days <= 14) return "due_soon";
  if (record.next_service_mileage && vehicle?.mileage) {
    const milesLeft = record.next_service_mileage - vehicle.mileage;
    if (milesLeft <= 0) return "overdue";
    if (milesLeft <= 500) return "due_soon";
  }
  if (record.status === "overdue") return "overdue";
  if (record.status === "scheduled") return "scheduled";
  return "completed";
}

function normalizeHostMaintenanceLog(record, hostsById, vehiclesById) {
  const vehicle = vehiclesById[record.vehicle_id] || null;
  const hostId = record.host_id || vehicle?.host_id || "";
  const host = hostsById[hostId] || null;
  const normalized = {
    ...record,
    source: "HostMaintenanceLog",
    source_id: record.id,
    host_id: hostId,
    host_name: host?.business_name || host?.full_name || "",
    host_email: host?.email || "",
    vehicle_name: record.vehicle_name || (vehicle ? `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.trim() : ""),
    next_service_date: record.next_service_date || "",
    computed_status: "completed",
    vehicle,
  };
  normalized.computed_status = computeSharedMaintenanceStatus(normalized, vehicle);
  return normalized;
}

function normalizeLegacyMaintenance(record, hostsById, vehiclesById) {
  const vehicle = vehiclesById[record.vehicle_id] || null;
  const hostId = record.host_id || vehicle?.host_id || "";
  const host = hostsById[hostId] || null;
  const normalized = {
    ...record,
    source: "Maintenance",
    source_id: record.id,
    host_id: hostId,
    host_name: host?.business_name || host?.full_name || "",
    host_email: host?.email || "",
    vehicle_name: record.vehicle_name || (vehicle ? `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.trim() : ""),
    next_service_date: record.next_service_date || record.next_service_due || "",
    next_service_mileage: record.next_service_mileage || "",
    computed_status: "completed",
    vehicle,
    _legacy: true,
  };
  normalized.computed_status = computeSharedMaintenanceStatus(normalized, vehicle);
  return normalized;
}

function applyMaintenanceFilters(records, filters = {}) {
  return records.filter((record) => {
    if (filters.hostId && record.host_id !== filters.hostId) return false;
    if (filters.vehicleId && record.vehicle_id !== filters.vehicleId) return false;
    if (filters.status && record.computed_status !== filters.status && record.status !== filters.status) return false;
    if (filters.category && record.service_type !== filters.category) return false;
    if (!isWithinSharedDateRange(record.date || record.created_date, filters.dateRange)) return false;
    if (filters.search && !textMatches(`${record.host_name || ""} ${record.vehicle_name || ""} ${record.service_type || ""} ${record.notes || ""} ${record.shop_name || ""}`, filters.search)) return false;
    return true;
  });
}

export async function loadSharedMaintenanceEngine({ mode = "host", hostId = "", user = null, filters = {}, limit = 1000, skip = 0 } = {}) {
  assertOperationalScope({ mode, hostId, user });
  const effectiveFilters = getEffectiveOperationalFilters(mode, filters);

  const [hosts, vehicles, hostLogs, legacyLogs] = await Promise.all([
    mode === "host" ? base44.entities.Host.filter({ id: hostId }, "-created_date", 1) : base44.entities.Host.list("-created_date", limit),
    mode === "host" ? base44.entities.Vehicle.filter({ host_id: hostId }, "-created_date", limit, skip) : base44.entities.Vehicle.list("-created_date", limit),
    mode === "host" ? base44.entities.HostMaintenanceLog.filter({ host_id: hostId }, "-date", limit, skip) : base44.entities.HostMaintenanceLog.list("-date", limit),
    mode === "host" ? base44.entities.Maintenance.filter({ host_id: hostId }, "-created_date", limit, skip) : base44.entities.Maintenance.list("-created_date", limit),
  ]);

  const hostsById = indexById(hosts);
  const vehiclesById = indexById(vehicles);
  const normalizedHostLogs = hostLogs.map((record) => normalizeHostMaintenanceLog(record, hostsById, vehiclesById));
  const normalizedLegacyLogs = legacyLogs.map((record) => normalizeLegacyMaintenance(record, hostsById, vehiclesById));
  const allRecords = [...normalizedHostLogs, ...normalizedLegacyLogs].filter((record) => mode !== "host" || record.host_id === hostId);
  const filteredRecords = applyMaintenanceFilters(allRecords, { ...effectiveFilters, hostId: mode === "host" ? hostId : effectiveFilters.hostId });

  const totalCost = filteredRecords.reduce((sum, record) => sum + (record.cost || 0), 0);
  const dueSoon = filteredRecords.filter((record) => record.computed_status === "due_soon");
  const overdue = filteredRecords.filter((record) => record.computed_status === "overdue");
  const downtime = vehicles.filter((vehicle) => (mode !== "host" || vehicle.host_id === hostId) && vehicle.status === "Maintenance");
  const legacyCount = filteredRecords.filter((record) => record._legacy).length;

  const byVehicle = {};
  const byHost = {};
  filteredRecords.forEach((record) => {
    byVehicle[record.vehicle_id || "unknown"] = (byVehicle[record.vehicle_id || "unknown"] || 0) + (record.cost || 0);
    byHost[record.host_id || "unknown"] = (byHost[record.host_id || "unknown"] || 0) + (record.cost || 0);
  });

  return {
    mode,
    records: filteredRecords,
    hostMaintenanceLogs: normalizedHostLogs,
    legacyMaintenanceRecords: normalizedLegacyLogs,
    kpis: { count: filteredRecords.length, totalCost, dueSoonCount: dueSoon.length, overdueCount: overdue.length, downtimeCount: downtime.length, legacyCount },
    alerts: { dueSoon, overdue, downtime },
    breakdowns: { byVehicle, byHost },
    sources: { hosts, vehicles },
  };
}