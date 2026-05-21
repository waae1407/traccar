import React, { useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Star, AlertTriangle, Minus } from "lucide-react";

function fmt(n) { return Math.abs(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }

function StatusBadge({ net, margin, maintCost, grossRevenue }) {
  if (net > 0 && margin >= 40) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">⭐ Top Performer</span>;
  if (net > 0) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Profitable</span>;
  if (grossRevenue === 0 && maintCost > 0) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">No Revenue</span>;
  if (net < -500) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">Losing Money</span>;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">Needs Review</span>;
}

function VehicleRow({ row, isFirst, isLast }) {
  const [expanded, setExpanded] = useState(false);
  const isProfit = row.net >= 0;
  const margin = row.grossRevenue > 0 ? ((row.net / row.grossRevenue) * 100) : 0;

  return (
    <>
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors text-left border-b border-gray-50 last:border-0">
        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${isFirst ? "bg-yellow-100 text-yellow-700" : isLast ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-500"}`}>
          {isFirst ? <Star className="h-3.5 w-3.5" /> : isLast ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-900 truncate">{row.name}</p>
            {row.plate && <span className="text-[10px] text-gray-400">{row.plate}</span>}
            <StatusBadge net={row.net} margin={margin} maintCost={row.maintCost} grossRevenue={row.grossRevenue} />
          </div>
          <div className="flex gap-3 mt-0.5 text-[10px] text-gray-400">
            <span>Rev: ${fmt(row.grossRevenue)}</span>
            <span>Costs: ${fmt(row.totalCosts)}</span>
            {row.maintCost > 0 && <span>Maint: ${fmt(row.maintCost)}</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-black ${isProfit ? "text-emerald-600" : "text-red-500"}`}>
            {isProfit ? "+" : "-"}${fmt(row.net)}
          </p>
          <p className={`text-[10px] ${isProfit ? "text-emerald-400" : "text-red-400"}`}>{margin.toFixed(0)}% margin</p>
        </div>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="bg-gray-50 border-b border-gray-100 px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DetailCell label="Gross Revenue" value={`$${fmt(row.grossRevenue)}`} color="text-emerald-600" />
            <DetailCell label="Net Payout" value={`$${fmt(row.netPayout)}`} color="text-blue-600" />
            <DetailCell label="Expenses" value={`$${fmt(row.expCost)}`} color="text-red-500" />
            <DetailCell label="Maintenance" value={`$${fmt(row.maintCost)}`} color="text-orange-500" />
            <DetailCell label="Dispute Costs" value={`$${fmt(row.disputeCost)}`} color={row.disputeCost > 0 ? "text-red-500" : "text-gray-400"} />
            <DetailCell label="Net Profit" value={`${isProfit ? "+" : "-"}$${fmt(row.net)}`} color={isProfit ? "text-emerald-600" : "text-red-500"} />
            <DetailCell label="Profit Margin" value={`${margin.toFixed(1)}%`} color={isProfit ? "text-emerald-600" : "text-red-500"} />
            <DetailCell label="Payments" value={String(row.paymentCount)} color="text-gray-700" />
          </div>
        </div>
      )}
    </>
  );
}

function DetailCell({ label, value, color }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
      <p className={`text-sm font-black ${color}`}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

export default function VehicleProfitabilityTable({ rows }) {
  const [sort, setSort] = useState("net");
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => {
    if (sort === "net") return b.net - a.net;
    if (sort === "revenue") return b.grossRevenue - a.grossRevenue;
    if (sort === "cost") return b.totalCosts - a.totalCosts;
    return 0;
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-gray-900 text-sm">Vehicle Profitability</h3>
        <div className="flex gap-1">
          {[["net", "By Profit"], ["revenue", "By Revenue"], ["cost", "By Cost"]].map(([v, l]) => (
            <button key={v} onClick={() => setSort(v)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${sort === v ? "bg-pink-100 text-pink-700" : "text-gray-500 hover:text-gray-700"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div>
        {sorted.map((row, i) => (
          <VehicleRow key={row.id} row={row} isFirst={i === 0} isLast={i === sorted.length - 1} />
        ))}
      </div>
    </div>
  );
}