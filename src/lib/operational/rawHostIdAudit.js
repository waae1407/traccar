import { base44 } from "@/api/base44Client";
import { assertOperationalScope } from "./sharedOperationalFilters";

function indexById(records = []) {
  return Object.fromEntries(records.filter(Boolean).map((record) => [record.id, record]));
}

function classifyMissingHostRecord(record, vehiclesById, bookingsById) {
  if (record.host_id) return null;
  const vehicleHostId = record.vehicle_id ? vehiclesById[record.vehicle_id]?.host_id : "";
  const bookingHostId = record.booking_request_id ? bookingsById[record.booking_request_id]?.host_id : "";
  const resolvedHostId = vehicleHostId || bookingHostId || "";
  return {
    id: record.id,
    entity: record._entity,
    vehicle_id: record.vehicle_id || "",
    booking_request_id: record.booking_request_id || "",
    resolved_host_id: resolvedHostId,
    resolution_source: vehicleHostId ? "Vehicle" : bookingHostId ? "BookingRequest" : "unresolved",
    unresolved: !resolvedHostId,
    record,
  };
}

export async function auditRawHostIdLinks({ user, limit = 1000 } = {}) {
  assertOperationalScope({ mode: "admin", user });

  const [vehicles, bookings, hostExpenses, hostMaintenanceLogs, legacyMaintenance, hostPayouts, paymentLogs, bookingRequests] = await Promise.all([
    base44.entities.Vehicle.list("-created_date", limit),
    base44.entities.BookingRequest.list("-created_date", limit),
    base44.entities.HostExpense.list("-created_date", limit),
    base44.entities.HostMaintenanceLog.list("-created_date", limit),
    base44.entities.Maintenance.list("-created_date", limit),
    base44.entities.HostPayout.list("-created_date", limit),
    base44.entities.PaymentLog.list("-created_date", limit),
    base44.entities.BookingRequest.list("-created_date", limit),
  ]);

  const vehiclesById = indexById(vehicles);
  const bookingsById = indexById(bookings);
  const auditable = [
    ...hostExpenses.map((record) => ({ ...record, _entity: "HostExpense" })),
    ...hostMaintenanceLogs.map((record) => ({ ...record, _entity: "HostMaintenanceLog" })),
    ...legacyMaintenance.map((record) => ({ ...record, _entity: "Maintenance" })),
    ...hostPayouts.map((record) => ({ ...record, _entity: "HostPayout" })),
    ...paymentLogs.map((record) => ({ ...record, _entity: "PaymentLog" })),
    ...bookingRequests.map((record) => ({ ...record, _entity: "BookingRequest" })),
  ];

  const missing = auditable.map((record) => classifyMissingHostRecord(record, vehiclesById, bookingsById)).filter(Boolean);
  const resolved = missing.filter((record) => !record.unresolved);
  const unresolved = missing.filter((record) => record.unresolved);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      checked: auditable.length,
      missingHostId: missing.length,
      resolvedThroughVehicleOrBooking: resolved.length,
      unresolved: unresolved.length,
    },
    missing,
    resolved,
    unresolved,
  };
}