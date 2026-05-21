import React, { useState } from "react";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";

function fmt(n) { return (n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
function fmtDollar(n) { return `$${fmt(Math.abs(n || 0))}`; }

export default function FleetProfitability({ vehicles, expenses, paymentLogs, maintenanceLogs, payouts }) {
  const [expanded, setExpanded] = useState(true);
  const [sort, setSort] = useState("profit");

  const rows = vehicles.map(v => {
    const vExpenses = expenses.filter(e => e.vehicle_id === v.id);
    const vMaintenance = maintenanceLogs.filter(m => m.vehicle_id === v.id);
    const vPayments = paymentLogs.filter(p => p.vehicle_id === v.id && p.status === "paid");
    const vPayouts = payouts.filter(p => p.vehicle_id === v.id);

    const totalRevenue = vPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const totalExpenses = vExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const totalMaintenance = vMaintenance.reduce((s, m) => s + (m.cost || 0), 0);
    const totalCosts = totalExpenses + totalMaintenance;
    const netProfit = totalRevenue - totalCosts;
    const roi = totalCosts > 0 ? ((netProfit / totalCosts) * 100) : null;
    const paymentCount = vPayments.length;

    return {
      id: v.id,
      name: `${v.year} ${v.make} ${v.model}`,
      plate: v.plate,
      status: v.status,
      totalRevenue,
      totalExpenses: totalCosts,
      expensesOnly: totalExpenses,
      maintenanceCost: totalMaintenance,
      netProfit,
      roi,
      paymentCount,
    };
  }).filter(r => r.totalRevenue > 0 || r.totalExpenses > 0);

  const sorted = [...rows].sort((a, b) => {
    if (sort === "profit") return b.netProfit - a.netProfit;
    if (sort === "revenue") return b.totalRevenue - a.totalRevenue;
    if (sort === "cost") return b.totalExpenses - a.totalExpenses;
    return 0;
  });

  if (rows.length === 0) return null;

  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalCosts = rows.reduce((s, r) => s + r.totalExpenses, 0);
  const totalNet = totalRevenue - totalCosts;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Fleet Profitability</h3>
          <p className="text-xs text-gray-400 mt-0.5">Revenue vs. costs per vehicle</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-black ${totalNet >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {totalNet >= 0 ? "+" : ""}{fmtDollar(totalNet)} net
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <>
          {/* Fleet totals */}
          <div className="grid grid-cols-3 gap-px bg-gray-100">
            <div className="bg-white p-3 text-center">
              <p className="text-sm font-black text-emerald-600">${fmt(totalRevenue)}</p>
              <p className="text-[10px] text-gray-400">Total Revenue</p>
            </div>
            <div className="bg-white p-3 text-center">
              <p className="text-sm font-black text-red-500">${fmt(totalCosts)}</p>
              <p className="text-[10px] text-gray-400">Total Costs</p>
            </div>
            <div className="bg-white p-3 text-center">
              <p className={`text-sm font-black ${totalNet >= 0 ? "text-emerald-600" : "text-red-500"}`}>{totalNet >= 0 ? "+" : ""}{fmtDollar(totalNet)}</p>
              <p className="text-[10px] text-gray-400">Net Profit</p>
            </div>
          </div>

          {/* Sort tabs */}
          <div className="flex gap-1 px-4 pt-3 pb-1">
            {[["profit", "By Profit"], ["revenue", "By Revenue"], ["cost", "By Cost"]].map(([v, l]) => (
              <button key={v} onClick={() => setSort(v)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${sort === v ? "bg-pink-100 text-pink-700" : "text-gray-500 hover:text-gray-700"}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Vehicle rows */}
          <div className="divide-y divide-gray-50">
            {sorted.map((r, i) => {
              const isProfit = r.netProfit >= 0;
              return (
                <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${i === 0 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-gray-800 truncate">{r.name}</p>
                      {r.plate && <span className="text-[10px] text-gray-400">· {r.plate}</span>}
                    </div>
                    <div className="flex gap-3 mt-0.5 text-[10px] text-gray-400">
                      <span>Rev: ${fmt(r.totalRevenue)}</span>
                      <span>Costs: ${fmt(r.totalExpenses)}</span>
                      {r.roi !== null && <span>ROI: {r.roi.toFixed(0)}%</span>}
                    </div>
                    {/* Mini progress bar */}
                    {r.totalRevenue > 0 && (
                      <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-400"
                          style={{ width: `${Math.min(100, Math.max(0, (r.netProfit / r.totalRevenue) * 100))}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-black ${isProfit ? "text-emerald-600" : "text-red-500"}`}>
                      {isProfit ? "+" : ""}{fmtDollar(r.netProfit)}
                    </p>
                    {isProfit
                      ? <TrendingUp className="h-3 w-3 text-emerald-400 ml-auto" />
                      : <TrendingDown className="h-3 w-3 text-red-400 ml-auto" />}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}