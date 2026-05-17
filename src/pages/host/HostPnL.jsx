import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie
} from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { subDays, isAfter } from "date-fns";
import { jsPDF } from "jspdf";
import HostPageHeader from "@/components/host/HostPageHeader";
import { format } from "date-fns";

const COLORS = ["#e91e8c", "#7c3aed", "#f59e0b", "#10b981", "#3b82f6", "#f97316", "#06b6d4"];

const RANGES = [
  { label: "30 Days", days: 30 },
  { label: "90 Days", days: 90 },
  { label: "1 Year", days: 365 },
  { label: "All Time", days: 99999 },
];

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${className}`}>
    {children}
  </div>
);

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg px-3 py-2 text-xs">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-semibold" style={{ color: p.color }}>${Number(p.value || 0).toLocaleString()} {p.name}</p>
      ))}
    </div>
  );
};

export default function HostPnL() {
  const { user } = useAuth();
  const [range, setRange] = useState(30);

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: payouts = [] } = useQuery({ queryKey: ["host-payouts-pnl", host?.id], queryFn: () => base44.entities.HostPayout.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: expenses = [] } = useQuery({ queryKey: ["host-expenses-pnl", host?.id], queryFn: () => base44.entities.HostExpense.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: maintenance = [] } = useQuery({ queryKey: ["host-maint-pnl", host?.id], queryFn: () => base44.entities.HostMaintenanceLog.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: vehicles = [] } = useQuery({ queryKey: ["host-vehicles-pnl", host?.id], queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: insights = [] } = useQuery({ queryKey: ["fleet-insights-pnl", host?.id], queryFn: () => base44.entities.FleetInsight.filter({ host_id: host.id }), enabled: !!host?.id });

  const cutoff = subDays(new Date(), range);
  const inRange = (d) => range >= 99999 || (d && isAfter(new Date(d), cutoff));

  // --- Revenue ---
  const rangedPayouts = payouts.filter(p => inRange(p.payout_date || p.created_date));
  const grossRevenue = rangedPayouts.reduce((s, p) => s + (p.gross_booking_amount || p.gross_collected || 0), 0);
  const netPayout = rangedPayouts.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
  const platformFeesPaid = rangedPayouts.reduce((s, p) => s + (p.uride_platform_fee_amount || p.platform_fee || 0), 0);
  const stripeFeesPaid = rangedPayouts.reduce((s, p) => s + (p.stripe_fee_amount || 0), 0);

  // --- Costs ---
  const totalExpenses = expenses.filter(e => inRange(e.date)).reduce((s, e) => s + (e.amount || 0), 0);
  const totalMaintenance = maintenance.filter(m => inRange(m.date)).reduce((s, m) => s + (m.cost || 0), 0);
  const totalCosts = totalExpenses + totalMaintenance;

  // --- Net profit ---
  const netProfit = netPayout - totalCosts;
  const profitMargin = netPayout > 0 ? ((netProfit / netPayout) * 100).toFixed(1) : 0;

  // Monthly trend
  const monthlyMap = {};
  rangedPayouts.forEach(p => {
    const d = new Date(p.payout_date || p.created_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[key]) monthlyMap[key] = { payout: 0, costs: 0 };
    monthlyMap[key].payout += p.net_host_payout || p.net_payout || 0;
  });
  [...expenses.filter(e => inRange(e.date)), ...maintenance.filter(m => inRange(m.date))].forEach(item => {
    const d = new Date(item.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[key]) monthlyMap[key] = { payout: 0, costs: 0 };
    monthlyMap[key].costs += item.amount || item.cost || 0;
  });
  const trendData = Object.entries(monthlyMap).sort().map(([month, v]) => ({
    month: month.slice(5),
    payout: Math.round(v.payout),
    costs: Math.round(v.costs),
    profit: Math.round(v.payout - v.costs),
  }));

  // Per-vehicle P&L
  const vehiclePnL = vehicles.map(v => {
    const vInsights = insights.filter(i => i.vehicle_id === v.id);
    const rev = vInsights.reduce((s, i) => s + (i.gross_revenue || 0), 0);
    const exp = expenses.filter(e => e.vehicle_id === v.id && inRange(e.date)).reduce((s, e) => s + (e.amount || 0), 0);
    const maint = maintenance.filter(m => m.vehicle_id === v.id && inRange(m.date)).reduce((s, m) => s + (m.cost || 0), 0);
    const net = rev - exp - maint;
    return {
      name: `${v.year} ${v.make} ${v.model}`.slice(0, 18),
      revenue: Math.round(rev),
      costs: Math.round(exp + maint),
      net: Math.round(net),
    };
  }).filter(v => v.revenue > 0 || v.costs > 0).sort((a, b) => b.net - a.net);

  // Expense breakdown pie
  const expByType = {};
  expenses.filter(e => inRange(e.date)).forEach(e => {
    expByType[e.expense_type] = (expByType[e.expense_type] || 0) + (e.amount || 0);
  });
  if (totalMaintenance > 0) expByType["maintenance"] = (expByType["maintenance"] || 0) + totalMaintenance;
  const expPieData = Object.entries(expByType).map(([name, value], i) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1).replace("_", " "),
    value: Math.round(value),
    color: COLORS[i % COLORS.length],
  }));

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`${host?.business_name || "Host"} — P&L Report`, 20, 25);
    doc.setFontSize(11);
    doc.text(`Generated: ${format(new Date(), "MMM d, yyyy")} · Last ${range === 99999 ? "All Time" : `${range} days`}`, 20, 35);
    doc.setFontSize(14); doc.text("Income", 20, 50);
    doc.setFontSize(11);
    doc.text(`Gross Revenue: $${Math.round(grossRevenue).toLocaleString()}`, 25, 60);
    doc.text(`Platform Fees Deducted: -$${Math.round(platformFeesPaid).toLocaleString()}`, 25, 68);
    doc.text(`Stripe Fees Deducted: -$${Math.round(stripeFeesPaid).toLocaleString()}`, 25, 76);
    doc.text(`Net Payout Received: $${Math.round(netPayout).toLocaleString()}`, 25, 84);
    doc.setFontSize(14); doc.text("Costs", 20, 98);
    doc.setFontSize(11);
    doc.text(`Operating Expenses: -$${Math.round(totalExpenses).toLocaleString()}`, 25, 108);
    doc.text(`Maintenance Costs: -$${Math.round(totalMaintenance).toLocaleString()}`, 25, 116);
    doc.setFontSize(14); doc.text("Net Profit", 20, 130);
    doc.setFontSize(13);
    doc.text(`$${Math.round(netProfit).toLocaleString()} (${profitMargin}% margin)`, 25, 140);
    doc.save(`host-pnl-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  return (
    <div className="space-y-5">
      <HostPageHeader
        title="P&L Dashboard"
        subtitle="Your complete profit & loss statement"
        action={
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-white/10 backdrop-blur-sm rounded-2xl p-1 border border-white/20">
              {RANGES.map(r => (
                <button key={r.days} onClick={() => setRange(r.days)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${range === r.days ? "bg-white text-gray-900 shadow-sm" : "text-white/60 hover:text-white"}`}>
                  {r.label}
                </button>
              ))}
            </div>
            <button onClick={exportPDF} className="px-4 py-2 rounded-2xl text-sm font-bold text-white border border-white/20 bg-white/10 hover:bg-white/20 transition-all">
              Export PDF
            </button>
          </div>
        }
      />

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Gross Revenue", value: `$${Math.round(grossRevenue).toLocaleString()}`, color: "text-emerald-600", bg: "bg-emerald-50", icon: DollarSign, up: true },
          { label: "Net Payout", value: `$${Math.round(netPayout).toLocaleString()}`, color: "text-blue-600", bg: "bg-blue-50", icon: Wallet, up: true },
          { label: "Total Costs", value: `$${Math.round(totalCosts).toLocaleString()}`, color: "text-red-500", bg: "bg-red-50", icon: TrendingDown, up: false },
          { label: "Net Profit", value: `$${Math.round(netProfit).toLocaleString()}`, color: netProfit >= 0 ? "text-pink-600" : "text-red-600", bg: netProfit >= 0 ? "bg-pink-50" : "bg-red-50", icon: TrendingUp, up: netProfit >= 0 },
        ].map((s, i) => (
          <Card key={i} className="!p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{s.label}</p>
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${s.bg}`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
            </div>
            <p className={`text-2xl font-black ${s.color}`} style={{ fontFamily: "var(--font-syne)" }}>{s.value}</p>
            <div className="flex items-center gap-1 mt-1">
              {s.up ? <ArrowUpRight className="h-3 w-3 text-emerald-500" /> : <ArrowDownRight className="h-3 w-3 text-red-500" />}
              <p className="text-[10px] text-gray-400">{s.up ? "earning" : "spending"}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Deductions breakdown */}
      <Card>
        <h3 className="font-bold text-gray-900 text-sm mb-4">Income Waterfall</h3>
        <div className="space-y-3">
          {[
            { label: "Gross Revenue Collected", value: grossRevenue, color: "bg-emerald-400", textColor: "text-emerald-700", sign: "" },
            { label: "uRide Platform Fee Deducted", value: platformFeesPaid, color: "bg-orange-400", textColor: "text-orange-600", sign: "−" },
            { label: "Stripe Processing Fees", value: stripeFeesPaid, color: "bg-red-400", textColor: "text-red-600", sign: "−" },
            { label: "Net Payout Received", value: netPayout, color: "bg-blue-400", textColor: "text-blue-700", sign: "=" },
            { label: "Operating Expenses", value: totalExpenses, color: "bg-red-300", textColor: "text-red-600", sign: "−" },
            { label: "Maintenance Costs", value: totalMaintenance, color: "bg-red-200", textColor: "text-red-500", sign: "−" },
            { label: "Net Profit", value: netProfit, color: netProfit >= 0 ? "bg-pink-500" : "bg-red-600", textColor: netProfit >= 0 ? "text-pink-700 font-black" : "text-red-700 font-black", sign: "=" },
          ].map((row, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-4 text-center text-xs font-bold text-gray-400">{row.sign}</span>
              <div className="flex-1 flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-600">{row.label}</span>
                <span className={`text-sm font-bold ${row.textColor}`}>${Math.abs(Math.round(row.value)).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 p-3 rounded-xl bg-gray-50 flex items-center justify-between">
          <span className="text-sm font-bold text-gray-700">Profit Margin</span>
          <span className={`text-lg font-black ${parseFloat(profitMargin) >= 0 ? "text-pink-600" : "text-red-600"}`} style={{ fontFamily: "var(--font-syne)" }}>{profitMargin}%</span>
        </div>
      </Card>

      {/* Monthly trend */}
      {trendData.length > 0 && (
        <Card>
          <h3 className="font-bold text-gray-900 text-sm mb-4">Monthly P&L Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="payoutGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e91e8c" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#e91e8c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="payout" name="Net Payout" stroke="#10b981" strokeWidth={2} fill="url(#payoutGrad)" dot={false} />
              <Area type="monotone" dataKey="profit" name="Net Profit" stroke="#e91e8c" strokeWidth={2} fill="url(#profitGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-5 mt-2">
            <div className="flex items-center gap-2"><div className="h-2 w-4 rounded-full bg-emerald-500" /><span className="text-xs text-gray-400">Net Payout</span></div>
            <div className="flex items-center gap-2"><div className="h-2 w-4 rounded-full bg-pink-500" /><span className="text-xs text-gray-400">Net Profit</span></div>
          </div>
        </Card>
      )}

      {/* Per-vehicle P&L + Expense breakdown */}
      <div className="grid lg:grid-cols-2 gap-5">
        {vehiclePnL.length > 0 && (
          <Card>
            <h3 className="font-bold text-gray-900 text-sm mb-4">Per-Vehicle P&L</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={vehiclePnL} layout="vertical">
                <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#374151", fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[0, 4, 4, 0]} opacity={0.7} />
                <Bar dataKey="costs" name="Costs" fill="#f87171" radius={[0, 4, 4, 0]} opacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {expPieData.length > 0 && (
          <Card>
            <h3 className="font-bold text-gray-900 text-sm mb-4">Expense Breakdown</h3>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={expPieData} cx="50%" cy="50%" innerRadius={38} outerRadius={65} dataKey="value">
                    {expPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {expPieData.map(e => (
                  <div key={e.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: e.color }} />
                      <span className="text-gray-500">{e.name}</span>
                    </div>
                    <span className="font-bold text-gray-800">${e.value.toLocaleString()}</span>
                  </div>
                ))}
                <div className="pt-1 border-t border-gray-100 flex justify-between text-xs">
                  <span className="font-bold text-gray-700">Total</span>
                  <span className="font-black text-red-600">${Math.round(totalCosts).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}