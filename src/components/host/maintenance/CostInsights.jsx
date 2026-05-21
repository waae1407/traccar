import React from "react";
import { DollarSign, TrendingUp, Repeat } from "lucide-react";
import { startOfMonth } from "date-fns";

export default function CostInsights({ logs }) {
  if (logs.length === 0) return null;

  const monthStart = startOfMonth(new Date());
  const monthlyLogs = logs.filter(l => l.date && new Date(l.date) >= monthStart);
  const monthlyTotal = monthlyLogs.reduce((s, l) => s + (l.cost || 0), 0);

  const avgCost = logs.filter(l => l.cost > 0).reduce((s, l) => s + (l.cost || 0), 0) / Math.max(1, logs.filter(l => l.cost > 0).length);

  // Per vehicle cost
  const byCostMap = {};
  logs.forEach(l => {
    if (!l.vehicle_name) return;
    byCostMap[l.vehicle_name] = (byCostMap[l.vehicle_name] || 0) + (l.cost || 0);
  });
  const topVehicle = Object.entries(byCostMap).sort((a, b) => b[1] - a[1])[0];

  // Repeated issues: same service type on same vehicle 2+ times
  const serviceCount = {};
  logs.forEach(l => {
    const key = `${l.vehicle_name}__${l.service_type}`;
    serviceCount[key] = (serviceCount[key] || 0) + 1;
  });
  const repeated = Object.entries(serviceCount).filter(([, count]) => count >= 2).map(([key, count]) => {
    const [vehicle, type] = key.split("__");
    return { vehicle, type, count };
  }).sort((a, b) => b.count - a.count).slice(0, 3);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="font-bold text-gray-900 text-sm mb-4 flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-pink-500" /> Cost Insights
      </h3>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-center">
          <p className="text-base font-black text-pink-600">${Math.round(monthlyTotal).toLocaleString()}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">This Month</p>
        </div>
        <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-center">
          <p className="text-base font-black text-gray-900">${Math.round(avgCost).toLocaleString()}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Avg Per Service</p>
        </div>
        <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-center">
          <p className="text-base font-black text-gray-900">{Object.keys(byCostMap).length}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Vehicles Tracked</p>
        </div>
      </div>

      {topVehicle && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-100 mb-3">
          <TrendingUp className="h-4 w-4 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-xs font-bold text-red-800">Highest Maintenance Cost</p>
            <p className="text-[11px] text-red-600">{topVehicle[0]} — ${topVehicle[1].toLocaleString()}</p>
          </div>
        </div>
      )}

      {repeated.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Repeat className="h-3.5 w-3.5 text-orange-400" />
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Repeated Issues</p>
          </div>
          {repeated.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs text-gray-600 py-1 border-b border-gray-50 last:border-0">
              <span>{r.vehicle}</span>
              <span className="text-gray-400">{r.type?.replace(/_/g, " ")} × {r.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}