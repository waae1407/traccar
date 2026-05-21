import { base44 } from "@/api/base44Client";
import { assertOperationalScope, getEffectiveOperationalFilters, isWithinSharedDateRange, textMatches } from "./sharedOperationalFilters";

const TAX_DEDUCTIBLE_TYPES = new Set(["fuel", "insurance", "repair", "registration", "maintenance", "gps", "tires", "toll", "parking"]);

function indexById(records = []) {
  return Object.fromEntries(records.filter(Boolean).map((record) => [record.id, record]));
}

function resolveHostId(record, vehiclesById, bookingsById) {
  return record.host_id || vehiclesById[record.vehicle_id]?.host_id || bookingsById[record.booking_request_id]?.host_id || "";
}

function applyExpenseFilters(expenses, filters = {}) {
  return expenses.filter((expense) => {
    if (filters.hostId && expense.host_id !== filters.hostId) return false;
    if (filters.vehicleId && expense.vehicle_id !== filters.vehicleId) return false;
    if (filters.bookingId && expense.booking_request_id !== filters.bookingId) return false;
    if (filters.category && expense.expense_type !== filters.category && expense.category !== filters.category) return false;
    if (filters.status && expense.status !== filters.status) return false;
    if (!isWithinSharedDateRange(expense.date || expense.created_date, filters.dateRange)) return false;
    if (filters.customer && !textMatches(`${expense.customer_name || ""} ${expense.customer_email || ""}`, filters.customer)) return false;
    if (filters.search && !textMatches(`${expense.host_name || ""} ${expense.vehicle_name || ""} ${expense.expense_type || ""} ${expense.description || ""}`, filters.search)) return false;
    return true;
  });
}

function getRecurringMonthlyAmount(recurring) {
  if (recurring.frequency === "weekly") return (recurring.amount || 0) * 4.33;
  if (recurring.frequency === "quarterly") return (recurring.amount || 0) / 3;
  if (recurring.frequency === "yearly") return (recurring.amount || 0) / 12;
  return recurring.amount || 0;
}

function getRecurringDueStatus(recurring) {
  if (!recurring.next_due_date) return "no_due_date";
  const days = Math.ceil((new Date(recurring.next_due_date) - new Date()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "overdue";
  if (days <= 14) return "due_soon";
  return "scheduled";
}

function applyRecurringFilters(recurringExpenses, filters = {}) {
  return recurringExpenses.filter((recurring) => {
    if (filters.hostId && recurring.host_id !== filters.hostId) return false;
    if (filters.vehicleId && recurring.vehicle_id !== filters.vehicleId) return false;
    if (filters.category && recurring.category !== filters.category) return false;
    if (filters.status && recurring.due_status !== filters.status && recurring.status !== filters.status) return false;
    if (filters.search && !textMatches(`${recurring.host_name || ""} ${recurring.vehicle_name || ""} ${recurring.category || ""} ${recurring.vendor || ""}`, filters.search)) return false;
    return true;
  });
}

export async function loadSharedExpenseEngine({ mode = "host", hostId = "", user = null, filters = {}, limit = 1000, skip = 0 } = {}) {
  assertOperationalScope({ mode, hostId, user });
  const effectiveFilters = getEffectiveOperationalFilters(mode, filters);

  const [hosts, vehicles, bookings, disputes, expenses, recurringExpenses] = await Promise.all([
    mode === "host" ? base44.entities.Host.filter({ id: hostId }, "-created_date", 1) : base44.entities.Host.list("-created_date", limit),
    mode === "host" ? base44.entities.Vehicle.filter({ host_id: hostId }, "-created_date", limit, skip) : base44.entities.Vehicle.list("-created_date", limit),
    mode === "host" ? base44.entities.BookingRequest.filter({ host_id: hostId }, "-created_date", limit, skip) : base44.entities.BookingRequest.list("-created_date", limit),
    mode === "host" ? base44.entities.Dispute.filter({ host_id: hostId }, "-created_date", limit, skip) : base44.entities.Dispute.list("-created_date", limit),
    mode === "host" ? base44.entities.HostExpense.filter({ host_id: hostId }, "-date", limit, skip) : base44.entities.HostExpense.list("-date", limit),
    mode === "host" ? base44.entities.RecurringExpense.filter({ host_id: hostId }, "-next_due_date", limit, skip) : base44.entities.RecurringExpense.list("-next_due_date", limit),
  ]);

  const hostsById = indexById(hosts);
  const vehiclesById = indexById(vehicles);
  const bookingsById = indexById(bookings);
  const disputesByBookingId = Object.fromEntries(disputes.filter((d) => d.booking_request_id).map((d) => [d.booking_request_id, d]));
  const disputesByVehicleId = Object.fromEntries(disputes.filter((d) => d.vehicle_id).map((d) => [d.vehicle_id, d]));

  const enrichedExpenses = expenses
    .map((expense) => {
      const resolvedHostId = resolveHostId(expense, vehiclesById, bookingsById);
      const vehicle = vehiclesById[expense.vehicle_id] || null;
      const booking = bookingsById[expense.booking_request_id] || null;
      const dispute = disputesByBookingId[expense.booking_request_id] || disputesByVehicleId[expense.vehicle_id] || null;
      const host = hostsById[resolvedHostId] || null;
      return {
        ...expense,
        host_id: resolvedHostId,
        host_name: host?.business_name || host?.full_name || "",
        host_email: host?.email || "",
        vehicle_name: expense.vehicle_name || (vehicle ? `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.trim() : ""),
        booking,
        dispute,
        tax_deductible: expense.tax_deductible ?? TAX_DEDUCTIBLE_TYPES.has(expense.expense_type),
      };
    })
    .filter((expense) => mode !== "host" || expense.host_id === hostId);

  const enrichedRecurringExpenses = recurringExpenses
    .map((recurring) => {
      const vehicle = vehiclesById[recurring.vehicle_id] || null;
      const host = hostsById[recurring.host_id] || null;
      return {
        ...recurring,
        host_name: host?.business_name || host?.full_name || "",
        host_email: host?.email || "",
        vehicle_name: recurring.vehicle_name || (vehicle ? `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.trim() : "Fleet"),
        monthly_amount: getRecurringMonthlyAmount(recurring),
        due_status: getRecurringDueStatus(recurring),
      };
    })
    .filter((recurring) => mode !== "host" || recurring.host_id === hostId);

  const filteredExpenses = applyExpenseFilters(enrichedExpenses, { ...effectiveFilters, hostId: mode === "host" ? hostId : effectiveFilters.hostId });
  const filteredRecurringExpenses = applyRecurringFilters(enrichedRecurringExpenses, { ...effectiveFilters, hostId: mode === "host" ? hostId : effectiveFilters.hostId });
  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
  const taxDeductibleTotal = filteredExpenses.filter((expense) => expense.tax_deductible).reduce((sum, expense) => sum + (expense.amount || 0), 0);
  const reimbursableTotal = filteredExpenses.filter((expense) => expense.reimbursable).reduce((sum, expense) => sum + (expense.amount || 0), 0);
  const recurringObligations = filteredRecurringExpenses.filter((expense) => expense.status !== "cancelled").reduce((sum, expense) => sum + (expense.amount || 0), 0);
  const projectedMonthlyRecurring = filteredRecurringExpenses.filter((expense) => expense.status !== "cancelled").reduce((sum, expense) => sum + (expense.monthly_amount || 0), 0);
  const recurringDueSoonCount = filteredRecurringExpenses.filter((expense) => expense.due_status === "due_soon").length;
  const recurringOverdueCount = filteredRecurringExpenses.filter((expense) => expense.due_status === "overdue").length;

  const byVehicle = {};
  const byHost = {};
  const byCategory = {};
  filteredExpenses.forEach((expense) => {
    byVehicle[expense.vehicle_id || "fleet"] = (byVehicle[expense.vehicle_id || "fleet"] || 0) + (expense.amount || 0);
    byHost[expense.host_id || "unknown"] = (byHost[expense.host_id || "unknown"] || 0) + (expense.amount || 0);
    byCategory[expense.expense_type || expense.category || "other"] = (byCategory[expense.expense_type || expense.category || "other"] || 0) + (expense.amount || 0);
  });

  return {
    mode,
    expenses: filteredExpenses,
    recurringExpenses: filteredRecurringExpenses,
    allExpenses: enrichedExpenses,
    allRecurringExpenses: enrichedRecurringExpenses,
    kpis: { totalExpenses, taxDeductibleTotal, reimbursableTotal, recurringObligations, projectedMonthlyRecurring, recurringDueSoonCount, recurringOverdueCount, count: filteredExpenses.length, recurringCount: filteredRecurringExpenses.length },
    breakdowns: { byVehicle, byHost, byCategory },
    sources: { hosts, vehicles, bookings, disputes },
  };
}