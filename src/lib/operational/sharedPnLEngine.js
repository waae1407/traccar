import { base44 } from "@/api/base44Client";
import { assertOperationalScope, isWithinSharedDateRange } from "./sharedOperationalFilters";
import { loadSharedExpenseEngine } from "./sharedExpenseEngine";
import { loadSharedMaintenanceEngine } from "./sharedMaintenanceEngine";
import { loadSharedPayoutEngine } from "./sharedPayoutEngine";

function indexById(records = []) {
  return Object.fromEntries(records.filter(Boolean).map((record) => [record.id, record]));
}

function resolveHostId(record, vehiclesById, bookingsById) {
  return record.host_id || vehiclesById[record.vehicle_id]?.host_id || bookingsById[record.booking_request_id]?.host_id || "";
}

export async function loadSharedPnLEngine({ mode = "host", hostId = "", filters = {}, limit = 1000 } = {}) {
  assertOperationalScope({ mode, hostId });

  const [hosts, vehicles, bookings, disputes, paymentLogs, expenseEngine, maintenanceEngine, payoutEngine] = await Promise.all([
    base44.entities.Host.list("-created_date", 500),
    base44.entities.Vehicle.list("-created_date", 1000),
    base44.entities.BookingRequest.list("-created_date", limit),
    base44.entities.Dispute.list("-created_date", 500),
    mode === "host" ? base44.entities.PaymentLog.filter({ host_id: hostId }, "-paid_at", limit) : base44.entities.PaymentLog.list("-paid_at", limit),
    loadSharedExpenseEngine({ mode, hostId, filters, limit }),
    loadSharedMaintenanceEngine({ mode, hostId, filters, limit }),
    loadSharedPayoutEngine({ mode, hostId, filters, limit }),
  ]);

  const vehiclesById = indexById(vehicles);
  const bookingsById = indexById(bookings);
  const hostsById = indexById(hosts);

  const scopedPaymentLogs = paymentLogs
    .map((log) => ({ ...log, host_id: resolveHostId(log, vehiclesById, bookingsById) }))
    .filter((log) => mode !== "host" || log.host_id === hostId)
    .filter((log) => !filters.hostId || log.host_id === filters.hostId)
    .filter((log) => !filters.vehicleId || log.vehicle_id === filters.vehicleId)
    .filter((log) => !filters.bookingId || log.booking_request_id === filters.bookingId)
    .filter((log) => isWithinSharedDateRange(log.paid_at || log.created_date, filters.dateRange));

  const paidLogs = scopedPaymentLogs.filter((log) => log.status === "paid");
  const grossRevenue = paidLogs.reduce((sum, log) => sum + (log.amount || 0), 0);
  const netPayout = payoutEngine.payouts.reduce((sum, payout) => sum + (payout.net_host_payout || payout.net_payout || 0), 0);
  const platformFees = payoutEngine.payouts.reduce((sum, payout) => sum + (payout.uride_platform_fee_amount || payout.platform_fee || 0), 0);
  const stripeFees = payoutEngine.payouts.reduce((sum, payout) => sum + (payout.stripe_fee_amount || 0), 0);
  const expenses = expenseEngine.kpis.totalExpenses;
  const maintenance = maintenanceEngine.kpis.totalCost;
  const disputeExposure = disputes
    .filter((dispute) => mode !== "host" || dispute.host_id === hostId)
    .filter((dispute) => !filters.hostId || dispute.host_id === filters.hostId)
    .reduce((sum, dispute) => sum + (dispute.stripe_dispute_amount || dispute.resolution_amount_to_customer || 0), 0);

  const vehicleProfitability = {};
  vehicles.forEach((vehicle) => {
    if (mode === "host" && vehicle.host_id !== hostId) return;
    if (filters.hostId && vehicle.host_id !== filters.hostId) return;
    if (filters.vehicleId && vehicle.id !== filters.vehicleId) return;
    vehicleProfitability[vehicle.id] = {
      vehicle_id: vehicle.id,
      vehicle_name: `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.trim(),
      host_id: vehicle.host_id || "",
      host_name: hostsById[vehicle.host_id]?.business_name || hostsById[vehicle.host_id]?.full_name || "",
      revenue: 0,
      expenses: 0,
      maintenance: 0,
      payouts: 0,
      profit: 0,
    };
  });

  paidLogs.forEach((log) => {
    if (vehicleProfitability[log.vehicle_id]) vehicleProfitability[log.vehicle_id].revenue += log.amount || 0;
  });
  expenseEngine.expenses.forEach((expense) => {
    if (vehicleProfitability[expense.vehicle_id]) vehicleProfitability[expense.vehicle_id].expenses += expense.amount || 0;
  });
  maintenanceEngine.records.forEach((record) => {
    if (vehicleProfitability[record.vehicle_id]) vehicleProfitability[record.vehicle_id].maintenance += record.cost || 0;
  });
  payoutEngine.payouts.forEach((payout) => {
    if (vehicleProfitability[payout.vehicle_id]) vehicleProfitability[payout.vehicle_id].payouts += payout.net_host_payout || payout.net_payout || 0;
  });

  Object.values(vehicleProfitability).forEach((row) => {
    row.profit = row.revenue - row.expenses - row.maintenance - row.payouts;
  });

  const hostProfitability = {};
  Object.values(vehicleProfitability).forEach((row) => {
    if (!hostProfitability[row.host_id]) {
      hostProfitability[row.host_id] = { host_id: row.host_id, host_name: row.host_name, revenue: 0, expenses: 0, maintenance: 0, payouts: 0, profit: 0, vehicle_count: 0 };
    }
    hostProfitability[row.host_id].revenue += row.revenue;
    hostProfitability[row.host_id].expenses += row.expenses;
    hostProfitability[row.host_id].maintenance += row.maintenance;
    hostProfitability[row.host_id].payouts += row.payouts;
    hostProfitability[row.host_id].profit += row.profit;
    hostProfitability[row.host_id].vehicle_count += 1;
  });

  const netPlatformRevenue = grossRevenue - netPayout - stripeFees;
  const operatingProfit = grossRevenue - netPayout - expenses - maintenance - disputeExposure - stripeFees;

  return {
    mode,
    kpis: { grossRevenue, netPayout, platformFees, stripeFees, expenses, maintenance, disputeExposure, netPlatformRevenue, operatingProfit },
    vehicleProfitability: Object.values(vehicleProfitability),
    hostProfitability: Object.values(hostProfitability),
    engines: { expenseEngine, maintenanceEngine, payoutEngine },
    sources: { hosts, vehicles, bookings, disputes, paymentLogs: scopedPaymentLogs },
  };
}