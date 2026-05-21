import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie
} from "recharts";
import { TrendingUp, DollarSign, CreditCard, Landmark, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { subDays, isAfter } from "date-fns";

const COLORS = ["hsl(338,90%,56%)", "hsl(265,80%,62%)", "hsl(152,60%,46%)", "hsl(38,95%,54%)", "hsl(199,90%,54%)"];

const RANGES = [
  { label: "30 Days", days: 30 },
  { label: "90 Days", days: 90 },
  { label: "1 Year", days: 365 },
  { label: "All Time", days: 99999 },
];

const GlassCard = ({ children, className = "" }) => (
  <div className={`rounded-2xl border border-white/[0.07] p-5 ${className}`}
    style={{ background: "hsl(222 24% 10% / 0.9)", boxShadow: "0 4px 32px hsl(222 28% 5% / 0.5)" }}>
    {children}
  </div>
);

const Tooltip_ = ({ active, payload, label, prefix = "$" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 px-3 py-2 text-xs" style={{ background: "hsl(222 28% 12%)" }}>
      <p className="text-white/50 mb-1">{label}</p>
      <p className="font-semibold text-white">{prefix}{Number(payload[0].value || 0).toLocaleString()}</p>
    </div>
  );
};

export default function AdminPnL() {
  const [range, setRange] = useState(30);

  const { data: paymentLogs = [] } = useQuery({ queryKey: ["pnl-payment-logs"], queryFn: () => base44.entities.PaymentLog.list("-paid_at", 1000) });
  const { data: hostPayouts = [] } = useQuery({ queryKey: ["pnl-host-payouts"], queryFn: () => base44.entities.HostPayout.list("-created_date", 500) });
  const { data: bookingRequests = [] } = useQuery({ queryKey: ["pnl-bookings"], queryFn: () => base44.entities.BookingRequest.list("-created_date", 500) });
  const { data: vehicles = [] } = useQuery({ queryKey: ["pnl-vehicles"], queryFn: () => base44.entities.Vehicle.list() });

  const cutoff = subDays(new Date(), range);
  const inRange = (d) => range >= 99999 || (d && isAfter(new Date(d), cutoff));

  // --- Core metrics ---
  const paidLogs = paymentLogs.filter(p => p.status === "paid" && inRange(p.paid_at || p.created_date));
  const grossRevenue = paidLogs.reduce((s, p) => s + (p.amount || 0), 0);

  const rangedPayouts = hostPayouts.filter(p => inRange(p.payout_date || p.created_date));
  const totalHostPayouts = rangedPayouts.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
  const totalStripeFees = rangedPayouts.reduce((s, p) => s + (p.stripe_fee_amount || 0), 0);
  const totalPlatformFees = rangedPayouts.reduce((s, p) => s + (p.uride_platform_fee_amount || p.platform_fee || 0), 0);

  // Net platform revenue = platform fees collected (what uRide keeps after paying hosts)
  const netPlatformRevenue = grossRevenue - totalHostPayouts - totalStripeFees;
  const margin = grossRevenue > 0 ? ((netPlatformRevenue / grossRevenue) * 100).toFixed(1) : 0;

  // Active MRR estimate from active bookings
  const activeBookings = bookingRequests.filter(b => b.booking_status === "active" && b.weekly_rate > 0);
  const mrr = activeBookings.reduce((s, b) => s + ((b.weekly_rate || 0) * 4.33), 0);

  // Churn: cancelled in range / (active + cancelled)
  const rangedBookings = bookingRequests.filter(b => inRange(b.created_date));
  const cancelled = rangedBookings.filter(b => b.booking_status === "cancelled").length;
  const total = rangedBookings.length;
  const churnRate = total > 0 ? ((cancelled / total) * 100).toFixed(1) : 0;

  // Monthly trend from payment logs
  const monthlyMap = {};
  paidLogs.forEach(p => {
    const d = new Date(p.paid_at || p.created_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[key]) monthlyMap[key] = { gross: 0, payouts: 0 };
    monthlyMap[key].gross += p.amount || 0;
  });
  rangedPayouts.forEach(p => {
    const d = new Date(p.payout_date || p.created_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[key]) monthlyMap[key] = { gross: 0, payouts: 0 };
    monthlyMap[key].payouts += p.net_host_payout || p.net_payout || 0;
  });
  const trendData = Object.entries(monthlyMap).sort().map(([month, v]) => ({
    month: month.slice(5),
    gross: Math.round(v.gross),
    net: Math.round(v.gross - v.payouts),
  }));

  // City breakdown
  const cityRevMap = {};
  paidLogs.forEach(p => {
    const b = bookingRequests.find(b => b.id === p.booking_request_id);
    const city = b?.city || "Unknown";
    cityRevMap[city] = (cityRevMap[city] || 0) + (p.amount || 0);
  });
  const cityData = Object.entries(cityRevMap).map(([city, rev]) => ({ city, rev: Math.round(rev) }))
    .sort((a, b) => b.rev - a.rev).slice(0, 8);

  // Revenue split pie
  const splitData = [
    { name: "Host Payouts", value: Math.round(totalHostPayouts) },
    { name: "Stripe Fees", value: Math.round(totalStripeFees) },
    { name: "Platform Net", value: Math.round(netPlatformRevenue > 0 ? netPlatformRevenue : 0) },
  ];

  const kpis = [
    {
      label: "Gross Revenue", value: `$${Math.round(grossRevenue).toLocaleString()}`,
      sub: "total collected", icon: DollarSign, color: "text-emerald-400", trend: true,
    },
    {
      label: "Net Platform Revenue", value: `$${Math.round(netPlatformRevenue).toLocaleString()}`,
      sub: `${margin}% margin`, icon: TrendingUp, color: "text-pink-400", trend: netPlatformRevenue >= 0,
    },
    {
      label: "Host Payouts Sent", value: `$${Math.round(totalHostPayouts).toLocaleString()}`,
      sub: "platform expense", icon: Landmark, color: "text-yellow-400", trend: false,
    },
    {
      label: "Est. MRR", value: `$${Math.round(mrr).toLocaleString()}`,
      sub: `${activeBookings.length} active rentals`, icon: CreditCard, color: "text-blue-400", trend: true,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-syne font-bold text-white">Platform P&amp;L</h1>
          <p className="text-sm text-white/40 mt-0.5">uRideHub financial performance</p>
        </div>
        <div className="flex gap-1 rounded-xl p-1 border border-white/[0.07]" style={{ background: "hsl(222 24% 10% / 0.9)" }}>
          {RANGES.map(r => (
            <button key={r.days} onClick={() => setRange(r.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${range === r.days ? "bg-primary text-white" : "text-white/40 hover:text-white"}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <GlassCard key={k.label} className="!p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] text-white/35 uppercase tracking-wider">{k.label}</p>
              <k.icon className={`h-4 w-4 ${k.color}`} />
            </div>
            <p className={`text-2xl font-syne font-bold ${k.color}`}>{k.value}</p>
            <div className="flex items-center gap-1 mt-1">
              {k.trend
                ? <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                : <ArrowDownRight className="h-3 w-3 text-red-400" />}
              <p className="text-[10px] text-white/25">{k.sub}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Stripe Fees Paid", value: `$${Math.round(totalStripeFees).toLocaleString()}`, color: "text-orange-400" },
          { label: "Platform Fee Collected", value: `$${Math.round(totalPlatformFees).toLocaleString()}`, color: "text-purple-400" },
          { label: "Churn Rate", value: `${churnRate}%`, color: "text-red-400" },
          { label: "Active Fleet", value: `${vehicles.filter(v => v.status === "Available" || v.status === "Booked").length} vehicles`, color: "text-cyan-400" },
        ].map((s) => (
          <GlassCard key={s.label} className="!p-4 text-center">
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">{s.label}</p>
            <p className={`text-xl font-syne font-bold ${s.color}`}>{s.value}</p>
          </GlassCard>
        ))}
      </div>

      {/* Revenue trend */}
      <GlassCard>
        <div className="mb-5">
          <h3 className="font-syne font-bold text-white">Revenue Trend</h3>
          <p className="text-xs text-white/35 mt-0.5">Gross collected vs. net platform revenue by month</p>
        </div>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(338,90%,56%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(338,90%,56%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(152,60%,46%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(152,60%,46%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 20% 95% / 0.04)" />
              <XAxis dataKey="month" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} />
              <YAxis fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip content={<Tooltip_ />} />
              <Area type="monotone" dataKey="gross" name="Gross" stroke="hsl(338,90%,56%)" strokeWidth={2} fill="url(#grossGrad)" dot={false} />
              <Area type="monotone" dataKey="net" name="Net" stroke="hsl(152,60%,46%)" strokeWidth={2} fill="url(#netGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-white/25 text-sm text-center py-16">No payment data in this period yet</p>
        )}
        <div className="flex gap-5 mt-3">
          <div className="flex items-center gap-2"><div className="h-2 w-4 rounded-full bg-pink-500" /><span className="text-xs text-white/40">Gross Revenue</span></div>
          <div className="flex items-center gap-2"><div className="h-2 w-4 rounded-full bg-emerald-500" /><span className="text-xs text-white/40">Net Platform</span></div>
        </div>
      </GlassCard>

      {/* City breakdown + Revenue split */}
      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard>
          <div className="mb-5">
            <h3 className="font-syne font-bold text-white">Revenue by City</h3>
            <p className="text-xs text-white/35 mt-0.5">Top markets</p>
          </div>
          {cityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={cityData} layout="vertical">
                <XAxis type="number" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <YAxis type="category" dataKey="city" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} width={80} axisLine={false} tickLine={false} />
                <Tooltip content={<Tooltip_ />} />
                <Bar dataKey="rev" radius={[0, 6, 6, 0]}>
                  {cityData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-white/25 text-sm text-center py-12">No city data yet</p>
          )}
        </GlassCard>

        <GlassCard>
          <div className="mb-5">
            <h3 className="font-syne font-bold text-white">Revenue Split</h3>
            <p className="text-xs text-white/35 mt-0.5">Where every dollar goes</p>
          </div>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={splitData} cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {splitData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-3">
              {splitData.map((s, i) => (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-xs text-white/50">{s.name}</span>
                    </div>
                    <span className="text-xs font-bold text-white">${s.value.toLocaleString()}</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/5">
                    <div className="h-1 rounded-full transition-all" style={{
                      width: `${grossRevenue > 0 ? Math.round((s.value / grossRevenue) * 100) : 0}%`,
                      background: COLORS[i % COLORS.length]
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}