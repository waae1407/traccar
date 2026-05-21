import React from "react";
import { Lightbulb, AlertTriangle, RefreshCw } from "lucide-react";
import { startOfMonth } from "date-fns";

export default function ExpenseInsights({ expenses, vehicles, maintenanceLogs, paymentLogs }) {
  const insights = [];
  const alerts = [];

  const now = new Date();
  const monthStart = startOfMonth(now);

  // Highest cost vehicle this month
  const monthExpenses = expenses.filter(e => e.date && new Date(e.date) >= monthStart);
  const byCostMap = {};
  monthExpenses.forEach(e => {
    if (e.vehicle_name) byCostMap[e.vehicle_name] = (byCostMap[e.vehicle_name] || 0) + (e.amount || 0);
  });
  const topCostEntry = Object.entries(byCostMap).sort((a, b) => b[1] - a[1])[0];
  if (topCostEntry) {
    insights.push(`${topCostEntry[0]} had the highest expense this month ($${Math.round(topCostEntry[1]).toLocaleString()}).`);
  }

  // Best ROI vehicle
  const vehicleRevMap = {};
  paymentLogs.filter(p => p.status === "paid").forEach(p => {
    if (p.vehicle_id) vehicleRevMap[p.vehicle_id] = (vehicleRevMap[p.vehicle_id] || 0) + (p.amount || 0);
  });
  const vehicleCostMap = {};
  expenses.forEach(e => { if (e.vehicle_id) vehicleCostMap[e.vehicle_id] = (vehicleCostMap[e.vehicle_id] || 0) + (e.amount || 0); });
  maintenanceLogs.forEach(m => { if (m.vehicle_id) vehicleCostMap[m.vehicle_id] = (vehicleCostMap[m.vehicle_id] || 0) + (m.cost || 0); });

  let bestROIVehicle = null, bestROI = -Infinity;
  Object.keys(vehicleRevMap).forEach(vid => {
    const rev = vehicleRevMap[vid] || 0;
    const cost = vehicleCostMap[vid] || 0;
    if (cost > 0 && rev > 0) {
      const roi = (rev - cost) / cost;
      if (roi > bestROI) { bestROI = roi; bestROIVehicle = vid; }
    }
  });
  if (bestROIVehicle) {
    const v = vehicles.find(v => v.id === bestROIVehicle);
    if (v) insights.push(`${v.year} ${v.make} ${v.model} has the best ROI at ${(bestROI * 100).toFixed(0)}%.`);
  }

  // Reimbursable pending
  const reimbursable = expenses.filter(e => e.reimbursable);
  if (reimbursable.length > 0) {
    const total = reimbursable.reduce((s, e) => s + (e.amount || 0), 0);
    alerts.push(`${reimbursable.length} expense${reimbursable.length !== 1 ? "s" : ""} ($${Math.round(total).toLocaleString()}) awaiting reimbursement.`);
  }

  // Vehicles with repeated repair costs
  const repairByVehicle = {};
  expenses.filter(e => ["repair", "damage"].includes(e.expense_type)).forEach(e => {
    if (e.vehicle_id) repairByVehicle[e.vehicle_id] = (repairByVehicle[e.vehicle_id] || 0) + 1;
  });
  const repeatedRepairs = Object.entries(repairByVehicle).filter(([, c]) => c >= 3);
  if (repeatedRepairs.length > 0) {
    const v = vehicles.find(v => v.id === repeatedRepairs[0][0]);
    if (v) alerts.push(`${v.year} ${v.make} ${v.model} has ${repeatedRepairs[0][1]} repair records — potential liability.`);
  }

  // High-value single expenses
  const bigExpenses = expenses.filter(e => (e.amount || 0) >= 500 && e.date && new Date(e.date) >= monthStart);
  if (bigExpenses.length > 0) {
    alerts.push(`${bigExpenses.length} high-cost expense${bigExpenses.length !== 1 ? "s" : ""} ($500+) logged this month.`);
  }

  if (insights.length === 0 && alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.length > 0 && (
        <div className="bg-yellow-50 rounded-2xl border border-yellow-200 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <p className="text-xs font-bold text-yellow-800 uppercase tracking-wider">Needs Attention</p>
          </div>
          {alerts.map((a, i) => (
            <p key={i} className="text-xs text-yellow-700">• {a}</p>
          ))}
        </div>
      )}
      {insights.length > 0 && (
        <div className="bg-blue-50 rounded-2xl border border-blue-200 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="h-4 w-4 text-blue-500" />
            <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">Fleet Insights</p>
          </div>
          {insights.map((ins, i) => (
            <p key={i} className="text-xs text-blue-700">• {ins}</p>
          ))}
        </div>
      )}
    </div>
  );
}