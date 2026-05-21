import { loadSharedExpenseEngine } from "./sharedExpenseEngine";
import { loadSharedMaintenanceEngine } from "./sharedMaintenanceEngine";
import { loadSharedPayoutEngine } from "./sharedPayoutEngine";
import { loadSharedPnLEngine } from "./sharedPnLEngine";

function assertAdmin(user) {
  if (user?.role !== "admin") {
    throw new Error("Admin reconciliation requires an admin user.");
  }
}

function diff(hostValue, adminValue) {
  return Math.round(((hostValue || 0) - (adminValue || 0)) * 100) / 100;
}

function compareTotals(label, hostValue, adminValue) {
  return {
    label,
    hostValue: hostValue || 0,
    adminFilteredValue: adminValue || 0,
    difference: diff(hostValue, adminValue),
    matches: Math.abs(diff(hostValue, adminValue)) < 0.01,
  };
}

export async function runOperationalReconciliation({ user, hostId, filters = {}, limit = 1000 } = {}) {
  assertAdmin(user);
  if (!hostId) throw new Error("hostId is required for host-vs-admin reconciliation.");

  const [hostExpenses, adminExpenses, hostMaintenance, adminMaintenance, hostPayouts, adminPayouts, hostPnL, adminPnL] = await Promise.all([
    loadSharedExpenseEngine({ mode: "host", hostId, filters, limit }),
    loadSharedExpenseEngine({ mode: "admin", filters: { ...filters, hostId }, limit }),
    loadSharedMaintenanceEngine({ mode: "host", hostId, filters, limit }),
    loadSharedMaintenanceEngine({ mode: "admin", filters: { ...filters, hostId }, limit }),
    loadSharedPayoutEngine({ mode: "host", hostId, filters, limit }),
    loadSharedPayoutEngine({ mode: "admin", filters: { ...filters, hostId }, limit }),
    loadSharedPnLEngine({ mode: "host", hostId, filters, limit }),
    loadSharedPnLEngine({ mode: "admin", filters: { ...filters, hostId }, limit }),
  ]);

  const missingHostIdRecords = {
    expenses: adminExpenses.allExpenses.filter((record) => !record.host_id),
    maintenance: adminMaintenance.records.filter((record) => !record.host_id),
    payouts: adminPayouts.payouts.filter((record) => !record.host_id),
    paymentLogs: adminPayouts.sources.paymentLogs.filter((record) => !record.host_id),
  };

  return {
    hostId,
    generatedAt: new Date().toISOString(),
    comparisons: [
      compareTotals("Expenses Total", hostExpenses.kpis.totalExpenses, adminExpenses.kpis.totalExpenses),
      compareTotals("Maintenance Cost", hostMaintenance.kpis.totalCost, adminMaintenance.kpis.totalCost),
      compareTotals("Payout Paid Total", hostPayouts.kpis.totalPaid, adminPayouts.kpis.totalPaid),
      compareTotals("P&L Gross Revenue", hostPnL.kpis.grossRevenue, adminPnL.kpis.grossRevenue),
      compareTotals("P&L Net Payout", hostPnL.kpis.netPayout, adminPnL.kpis.netPayout),
      compareTotals("P&L Expenses", hostPnL.kpis.expenses, adminPnL.kpis.expenses),
      compareTotals("P&L Maintenance", hostPnL.kpis.maintenance, adminPnL.kpis.maintenance),
    ],
    counts: {
      hostExpenseRecords: hostExpenses.expenses.length,
      adminExpenseRecordsForHost: adminExpenses.expenses.length,
      hostMaintenanceRecords: hostMaintenance.records.length,
      adminMaintenanceRecordsForHost: adminMaintenance.records.length,
      hostPayoutRecords: hostPayouts.payouts.length,
      adminPayoutRecordsForHost: adminPayouts.payouts.length,
      synthesizedPayoutRows: adminPayouts.synthesizedPayouts.filter((row) => row.host_id === hostId).length,
      legacyMaintenanceRecords: adminMaintenance.legacyMaintenanceRecords.filter((row) => row.host_id === hostId).length,
    },
    missingHostIdRecords,
    engines: {
      hostExpenses,
      adminExpenses,
      hostMaintenance,
      adminMaintenance,
      hostPayouts,
      adminPayouts,
      hostPnL,
      adminPnL,
    },
  };
}