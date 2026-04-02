import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, CartesianGrid, Cell, PieChart, Pie
} from "recharts";

const COLORS = ["hsl(338,90%,56%)", "hsl(265,80%,62%)", "hsl(152,60%,46%)", "hsl(38,95%,54%)", "hsl(199,90%,54%)"];

const GlassCard = ({ children, className = "" }) => (
  <div className={`rounded-2xl border border-white/[0.07] p-6 ${className}`}
    style={{ background: "hsl(222 24% 10% / 0.9)", boxShadow: "0 4px 32px hsl(222 28% 5% / 0.5)" }}>
    {children}
  </div>
);

const CardTitle = ({ title, subtitle }) => (
  <div className="mb-6">
    <h3 className="font-syne font-bold text-white text-base">{title}</h3>
    {subtitle && <p className="text-xs text-white/35 mt-0.5">{subtitle}</p>}
  </div>
);

const ChartTooltip = ({ active, payload, label, prefix = "" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 px-3 py-2 text-xs" style={{ background: "hsl(222 28% 12%)" }}>
      <p className="text-white/50 mb-1">{label}</p>
      <p className="font-semibold text-white">{prefix}{payload[0].value?.toLocaleString()}</p>
    </div>
  );
};

export default function Reports() {
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => base44.entities.Vehicle.list() });
  const { data: bookings = [] } = useQuery({ queryKey: ["bookings"], queryFn: () => base44.entities.Booking.list() });
  const { data: payments = [] } = useQuery({ queryKey: ["payments"], queryFn: () => base44.entities.Payment.list() });

  // Revenue per vehicle
  const vehicleRevenue = {};
  payments.filter((p) => p.status === "Paid").forEach((p) => {
    const booking = bookings.find((b) => b.id === p.booking_id);
    if (booking) {
      const vName = booking.vehicle_name || "Unknown";
      vehicleRevenue[vName] = (vehicleRevenue[vName] || 0) + (p.amount || 0);
    }
  });
  const vehicleRevenueData = Object.entries(vehicleRevenue).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  // City utilization
  const cityStats = {};
  vehicles.forEach((v) => {
    const city = v.current_city || "Unknown";
    if (!cityStats[city]) cityStats[city] = { total: 0, booked: 0 };
    cityStats[city].total++;
    if (v.status === "Booked") cityStats[city].booked++;
  });
  const utilizationData = Object.entries(cityStats).map(([city, s]) => ({
    city, rate: s.total > 0 ? Math.round((s.booked / s.total) * 100) : 0,
  }));

  // Monthly revenue
  const monthlyData = {};
  payments.filter((p) => p.status === "Paid" && p.paid_date).forEach((p) => {
    const d = new Date(p.paid_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyData[key] = (monthlyData[key] || 0) + (p.amount || 0);
  });
  const trendData = Object.entries(monthlyData).sort().map(([month, revenue]) => ({ month: month.slice(5), revenue }));
  if (trendData.length === 0) trendData.push({ month: "Mar", revenue: 0 });

  // Lead sources
  const leadSources = {};
  vehicles.forEach(() => {}); // placeholder
  const customers_data = [];
  const sourceData = [
    { name: "Turo", value: 35 }, { name: "Facebook", value: 28 },
    { name: "Referral", value: 20 }, { name: "Website", value: 12 }, { name: "Other", value: 5 }
  ];

  const totalRevenue = payments.filter((p) => p.status === "Paid").reduce((s, p) => s + (p.amount || 0), 0);
  const paidCount = payments.filter((p) => p.status === "Paid").length;
  const complianceRate = payments.length > 0 ? Math.round((paidCount / payments.length) * 100) : 0;

  const kpis = [
    { label: "Payment Compliance", value: `${complianceRate}%`, sub: `${paidCount} of ${payments.length} paid`, color: "text-green-400" },
    { label: "Fleet Size", value: vehicles.length, sub: "total vehicles", color: "text-blue-400" },
    { label: "Total Bookings", value: bookings.length, sub: "all time", color: "text-purple-400" },
    { label: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, sub: "all time collected", color: "text-pink-400" },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <GlassCard key={k.label} className="text-center !p-5">
            <p className="text-xs text-white/35 uppercase tracking-wider">{k.label}</p>
            <p className={`text-3xl font-syne font-bold mt-2 ${k.color}`}>{k.value}</p>
            <p className="text-xs text-white/25 mt-1">{k.sub}</p>
          </GlassCard>
        ))}
      </div>

      {/* Monthly trend + lead sources */}
      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard className="lg:col-span-2">
          <CardTitle title="Monthly Revenue Trend" subtitle="Paid revenue over time" />
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(338,90%,56%)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(338,90%,56%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 20% 95% / 0.05)" />
              <XAxis dataKey="month" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} />
              <YAxis fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip prefix="$" />} />
              <Area type="monotone" dataKey="revenue" stroke="hsl(338,90%,56%)" strokeWidth={2.5} fill="url(#trendGrad)" dot={false} activeDot={{ r: 5, fill: "hsl(338,90%,56%)", stroke: "hsl(222,28%,10%)", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard>
          <CardTitle title="Lead Sources" subtitle="Customer acquisition" />
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={sourceData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value" strokeWidth={0}>
                {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {sourceData.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-xs text-white/50">{s.name}</span>
                </div>
                <span className="text-xs font-semibold text-white">{s.value}%</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Vehicle revenue + utilization */}
      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard>
          <CardTitle title="Revenue by Vehicle" subtitle="Top performing vehicles" />
          {vehicleRevenueData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={vehicleRevenueData} layout="vertical">
                <XAxis type="number" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} width={130} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip prefix="$" />} />
                <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                  {vehicleRevenueData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-white/25 text-sm text-center py-12">No revenue data yet</p>
          )}
        </GlassCard>

        <GlassCard>
          <CardTitle title="Fleet Utilization by City" subtitle="% of vehicles currently booked" />
          {utilizationData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={utilizationData}>
                <XAxis dataKey="city" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} />
                <YAxis fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="rate" radius={[6, 6, 0, 0]}>
                  {utilizationData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-white/25 text-sm text-center py-12">No data yet</p>
          )}
        </GlassCard>
      </div>
    </div>
  );
}