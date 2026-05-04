import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { BarChart2, TrendingUp, Users, DollarSign, Download } from "lucide-react";
import HostPageHeader from "@/components/host/HostPageHeader";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { subDays, format, startOfWeek, isAfter } from "date-fns";
import { jsPDF } from "jspdf";

const RANGES = [
  { label: "30 Days", days: 30 },
  { label: "90 Days", days: 90 },
  { label: "This Year", days: 365 },
];

const PIE_COLORS = ["#e91e8c", "#7c3aed", "#f59e0b", "#10b981", "#3b82f6", "#f97316", "#06b6d4", "#6b7280"];

export default function HostReports() {
  const { user } = useAuth();
  const [range, setRange] = useState(30);

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: payouts = [] } = useQuery({ queryKey: ["host-payouts", host?.id], queryFn: () => base44.entities.HostPayout.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: vehicles = [] } = useQuery({ queryKey: ["host-vehicles", host?.id], queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: bookings = [] } = useQuery({ queryKey: ["host-bookings", host?.id], queryFn: () => base44.entities.BookingRequest.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: expenses = [] } = useQuery({ queryKey: ["host-expenses", host?.id], queryFn: () => base44.entities.HostExpense.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: maintenance = [] } = useQuery({ queryKey: ["host-maintenance", host?.id], queryFn: () => base44.entities.HostMaintenanceLog.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: customers = [] } = useQuery({ queryKey: ["host-customers", host?.id], queryFn: () => base44.entities.HostCustomer.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: insights = [] } = useQuery({ queryKey: ["fleet-insights", host?.id], queryFn: () => base44.entities.FleetInsight.filter({ host_id: host.id }), enabled: !!host?.id });

  const cutoff = subDays(new Date(), range);
  const inRange = (d) => d && isAfter(new Date(d), cutoff);

  // Revenue data by week
  const revenueByWeek = payouts
    .filter(p => inRange(p.period_start))
    .reduce((acc, p) => {
      const week = p.period_start?.slice(0, 7) || "?";
      acc[week] = (acc[week] || 0) + (p.net_payout || 0);
      return acc;
    }, {});
  const revenueChartData = Object.entries(revenueByWeek).sort().map(([week, net]) => ({ week, net }));

  // Expense by category
  const expenseByType = expenses
    .filter(e => inRange(e.date))
    .reduce((acc, e) => { acc[e.expense_type] = (acc[e.expense_type] || 0) + (e.amount || 0); return acc; }, {});
  const expensePieData = Object.entries(expenseByType).map(([name, value], i) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, color: PIE_COLORS[i % PIE_COLORS.length] }));

  // Fleet performance
  const fleetPerformance = vehicles.map(v => {
    const vInsights = insights.filter(i => i.vehicle_id === v.id);
    const revenue = vInsights.reduce((s, i) => s + (i.gross_revenue || 0), 0);
    const util = vInsights.length > 0 ? vInsights.reduce((s, i) => s + (i.utilization_rate || 0), 0) / vInsights.length : 0;
    return { name: `${v.year} ${v.make.slice(0, 4)} ${v.model.slice(0, 5)}`, revenue, util: Math.round(util * 100) };
  }).filter(v => v.revenue > 0).sort((a, b) => b.revenue - a.revenue);

  // Profit data
  const totalRevenue = payouts.filter(p => inRange(p.period_start)).reduce((s, p) => s + (p.gross_collected || 0), 0);
  const totalNet = payouts.filter(p => inRange(p.period_start)).reduce((s, p) => s + (p.net_payout || 0), 0);
  const totalExpenses = expenses.filter(e => inRange(e.date)).reduce((s, e) => s + (e.amount || 0), 0);
  const totalMaintenance = maintenance.filter(m => inRange(m.date)).reduce((s, m) => s + (m.cost || 0), 0);
  const netProfit = totalNet - totalExpenses - totalMaintenance;

  const topCustomers = [...customers].sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0)).slice(0, 5);
  const completedBookings = bookings.filter(b => b.booking_status === "completed").length;
  const completionRate = bookings.length > 0 ? Math.round((completedBookings / bookings.length) * 100) : 0;

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`${host?.business_name || "Host"} — Business Report`, 20, 25);
    doc.setFontSize(11);
    doc.text(`Generated: ${format(new Date(), "MMM d, yyyy")}`, 20, 35);
    doc.text(`Period: Last ${range} days`, 20, 43);
    doc.setFontSize(14);
    doc.text("Revenue Summary", 20, 58);
    doc.setFontSize(11);
    doc.text(`Gross Revenue: $${totalRevenue.toLocaleString()}`, 25, 68);
    doc.text(`Net Payout: $${totalNet.toLocaleString()}`, 25, 76);
    doc.text(`Total Expenses: $${totalExpenses.toLocaleString()}`, 25, 84);
    doc.text(`Net Profit: $${netProfit.toLocaleString()}`, 25, 92);
    doc.setFontSize(14);
    doc.text("Fleet Performance", 20, 108);
    doc.setFontSize(11);
    fleetPerformance.forEach((v, i) => {
      doc.text(`${v.name}: $${v.revenue.toLocaleString()} revenue, ${v.util}% utilization`, 25, 118 + i * 8);
    });
    doc.save(`uride-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  return (
    <div className="space-y-5">
      <HostPageHeader
        title="Reports"
        subtitle="Business performance analytics"
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
            <button onClick={exportPDF} className="flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-bold text-white shadow-lg border border-white/20 bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-all">
              <Download className="h-4 w-4" /> Export PDF
            </button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Gross Revenue", value: `$${totalRevenue.toLocaleString()}`, color: "text-emerald-600", bg: "bg-emerald-50", icon: DollarSign },
          { label: "Net Payout", value: `$${totalNet.toLocaleString()}`, color: "text-blue-600", bg: "bg-blue-50", icon: TrendingUp },
          { label: "Total Expenses", value: `$${(totalExpenses + totalMaintenance).toLocaleString()}`, color: "text-red-500", bg: "bg-red-50", icon: BarChart2 },
          { label: "Net Profit", value: `$${netProfit.toLocaleString()}`, color: netProfit >= 0 ? "text-pink-600" : "text-red-600", bg: "bg-pink-50", icon: TrendingUp },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{s.label}</p>
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${s.bg}`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
            </div>
            <p className={`text-xl font-black ${s.color}`} style={{ fontFamily: "var(--font-syne)" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue Chart */}
      {revenueChartData.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 mb-4 text-sm">Net Payout by Month</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={revenueChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="week" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12 }} formatter={v => [`$${v}`, "Net Payout"]} />
              <Bar dataKey="net" radius={[6, 6, 0, 0]} fill="url(#gradBar)" name="Net Payout" />
              <defs>
                <linearGradient id="gradBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(338 90% 56%)" />
                  <stop offset="100%" stopColor="hsl(265 80% 62%)" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Fleet Performance */}
        {fleetPerformance.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-4 text-sm">Fleet Performance</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={fleetPerformance} layout="vertical">
                <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#374151", fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12 }} formatter={v => [`$${v}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="hsl(338 90% 56% / 0.8)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Expense Breakdown */}
        {expensePieData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-4 text-sm">Expense Breakdown</h3>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={expensePieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value">
                    {expensePieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {expensePieData.map(c => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                      <span className="text-gray-600">{c.name}</span>
                    </div>
                    <span className="font-bold text-gray-900">${c.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top Customers */}
        {topCustomers.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-4 text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-pink-500" /> Top Customers
            </h3>
            <div className="space-y-3">
              {topCustomers.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3">
                  <span className="text-xs font-black text-gray-300 w-4">#{i + 1}</span>
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                    {c.full_name?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.full_name}</p>
                    <p className="text-xs text-gray-400">{c.booking_count} bookings</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-600">${(c.total_spent || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Booking stats */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 mb-4 text-sm">Booking Summary</h3>
          <div className="space-y-4">
            {[
              { label: "Total Bookings", value: bookings.length, color: "text-gray-900" },
              { label: "Completed", value: completedBookings, color: "text-emerald-600" },
              { label: "Completion Rate", value: `${completionRate}%`, color: "text-pink-600" },
              { label: "Active Customers", value: customers.filter(c => c.customer_status === "active").length, color: "text-blue-600" },
              { label: "Storefront Views", value: host?.storefront_views || 0, color: "text-violet-600" },
            ].map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-500">{s.label}</span>
                <span className={`text-base font-black ${s.color}`} style={{ fontFamily: "var(--font-syne)" }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}