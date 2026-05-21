import React from "react";
import { Lightbulb, AlertTriangle } from "lucide-react";

export default function PnLInsights({ vehicleRows, grossRevenue, totalCosts, netProfit, prevNetProfit, dateRange }) {
  const insights = [];
  const alerts = [];

  if (vehicleRows.length === 0) {
    insights.push("No vehicle data for this period.");
    return null;
  }

  if (grossRevenue === 0) {
    alerts.push("No revenue recorded for this period. Check that payouts are linked to this host.");
    return (
      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
        <div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-yellow-500" /><p className="text-xs font-bold text-yellow-800 uppercase tracking-wider">Attention</p></div>
        {alerts.map((a, i) => <p key={i} className="text-xs text-yellow-700">• {a}</p>)}
      </div>
    );
  }

  // Best/worst vehicle
  const sorted = [...vehicleRows].sort((a, b) => b.net - a.net);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  if (best && best.net > 0) {
    const margin = best.grossRevenue > 0 ? ((best.net / best.grossRevenue) * 100).toFixed(0) : 0;
    insights.push(`${best.name} is your top performer with ${margin}% profit margin.`);
  }

  if (worst && worst.net < 0) {
    alerts.push(`${worst.name} is losing money this period (−$${Math.abs(Math.round(worst.net)).toLocaleString()}).`);
  }

  // Vehicles with no revenue but have costs
  const noRevenue = vehicleRows.filter(v => v.grossRevenue === 0 && v.totalCosts > 0);
  if (noRevenue.length > 0) {
    alerts.push(`${noRevenue.length} vehicle${noRevenue.length !== 1 ? "s" : ""} have expenses but no revenue this period.`);
  }

  // Maintenance > revenue
  const totalMaint = vehicleRows.reduce((s, v) => s + v.maintCost, 0);
  if (totalMaint > grossRevenue && grossRevenue > 0) {
    alerts.push("Maintenance costs exceeded total revenue this period.");
  }

  // Period over period
  if (prevNetProfit !== null && prevNetProfit !== undefined) {
    const change = netProfit - prevNetProfit;
    if (Math.abs(change) > 50) {
      insights.push(`Profit ${change >= 0 ? "increased" : "decreased"} by $${Math.abs(Math.round(change)).toLocaleString()} vs previous period.`);
    }
  } else {
    insights.push("No previous period data to compare.");
  }

  // High dispute costs
  const totalDispute = vehicleRows.reduce((s, v) => s + (v.disputeCost || 0), 0);
  if (totalDispute > 200) {
    alerts.push(`$${Math.round(totalDispute).toLocaleString()} in dispute/chargeback costs this period.`);
  }

  if (insights.length === 0 && alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.length > 0 && (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 space-y-1.5">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-yellow-500" /><p className="text-xs font-bold text-yellow-800 uppercase tracking-wider">Needs Attention</p></div>
          {alerts.map((a, i) => <p key={i} className="text-xs text-yellow-700">• {a}</p>)}
        </div>
      )}
      {insights.length > 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-1.5">
          <div className="flex items-center gap-2 mb-1"><Lightbulb className="h-4 w-4 text-blue-500" /><p className="text-xs font-bold text-blue-800 uppercase tracking-wider">Fleet Insights</p></div>
          {insights.map((ins, i) => <p key={i} className="text-xs text-blue-700">• {ins}</p>)}
        </div>
      )}
    </div>
  );
}