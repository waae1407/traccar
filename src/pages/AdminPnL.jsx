import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie } from "recharts";
import { TrendingUp, DollarSign, CreditCard, Landmark } from "lucide-react";
import { subDays, isAfter } from "date-fns";
import { OperationalPageShell, OperationalHero, OperationalKpiGrid, OperationalFilterBar, OperationalDataSection } from "@/components/operational";

const COLORS = ["hsl(338,90%,56%)", "hsl(265,80%,62%)", "hsl(152,60%,46%)", "hsl(38,95%,54%)", "hsl(199,90%,54%)"];
const RANGES = [{ label: "30 Days", value: "30" }, { label: "90 Days", value: "90" }, { label: "1 Year", value: "365" }, { label: "All Time", value: "99999" }];

const Tooltip_ = ({ active, payload, label, prefix = "$" }) => {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-white/10 px-3 py-2 text-xs" style={{ background: "hsl(222 28% 12%)" }}><p className="mb-1 text-white/50">{label}</p><p className="font-semibold text-white">{prefix}{Number(payload[0].value || 0).toLocaleString()}</p></div>;
};

export default function AdminPnL() {
  const [range, setRange] = useState(30);
  const filters = { search: "", dateRange: String(range) };

  const { data: paymentLogs = [] } = useQuery({ queryKey: ["pnl-payment-logs"], queryFn: () => base44.entities.PaymentLog.list("-paid_at", 1000) });
  const { data: hostPayouts = [] } = useQuery({ queryKey: ["pnl-host-payouts"], queryFn: () => base44.entities.HostPayout.list("-created_date", 500) });
  const { data: bookingRequests = [] } = useQuery({ queryKey: ["pnl-bookings"], queryFn: () => base44.entities.BookingRequest.list("-created_date", 500) });
  const { data: vehicles = [] } = useQuery({ queryKey: ["pnl-vehicles"], queryFn: () => base44.entities.Vehicle.list() });

  const cutoff = subDays(new Date(), range);
  const inRange = (d) => range >= 99999 || (d && isAfter(new Date(d), cutoff));
  const paidLogs = paymentLogs.filter(p => p.status === "paid" && inRange(p.paid_at || p.created_date));
  const grossRevenue = paidLogs.reduce((s, p) => s + (p.amount || 0), 0);
  const rangedPayouts = hostPayouts.filter(p => inRange(p.payout_date || p.created_date));
  const totalHostPayouts = rangedPayouts.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
  const totalStripeFees = rangedPayouts.reduce((s, p) => s + (p.stripe_fee_amount || 0), 0);
  const totalPlatformFees = rangedPayouts.reduce((s, p) => s + (p.uride_platform_fee_amount || p.platform_fee || 0), 0);
  const netPlatformRevenue = grossRevenue - totalHostPayouts - totalStripeFees;
  const margin = grossRevenue > 0 ? ((netPlatformRevenue / grossRevenue) * 100).toFixed(1) : 0;
  const activeBookings = bookingRequests.filter(b => b.booking_status === "active" && b.weekly_rate > 0);
  const mrr = activeBookings.reduce((s, b) => s + ((b.weekly_rate || 0) * 4.33), 0);
  const rangedBookings = bookingRequests.filter(b => inRange(b.created_date));
  const cancelled = rangedBookings.filter(b => b.booking_status === "cancelled").length;
  const churnRate = rangedBookings.length > 0 ? ((cancelled / rangedBookings.length) * 100).toFixed(1) : 0;

  const monthlyMap = {};
  paidLogs.forEach(p => { const d = new Date(p.paid_at || p.created_date); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; if (!monthlyMap[key]) monthlyMap[key] = { gross: 0, payouts: 0 }; monthlyMap[key].gross += p.amount || 0; });
  rangedPayouts.forEach(p => { const d = new Date(p.payout_date || p.created_date); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; if (!monthlyMap[key]) monthlyMap[key] = { gross: 0, payouts: 0 }; monthlyMap[key].payouts += p.net_host_payout || p.net_payout || 0; });
  const trendData = Object.entries(monthlyMap).sort().map(([month, v]) => ({ month: month.slice(5), gross: Math.round(v.gross), net: Math.round(v.gross - v.payouts) }));

  const cityRevMap = {};
  paidLogs.forEach(p => { const b = bookingRequests.find(b => b.id === p.booking_request_id); const city = b?.city || "Unknown"; cityRevMap[city] = (cityRevMap[city] || 0) + (p.amount || 0); });
  const cityData = Object.entries(cityRevMap).map(([city, rev]) => ({ city, rev: Math.round(rev) })).sort((a, b) => b.rev - a.rev).slice(0, 8);
  const splitData = [{ name: "Host Payouts", value: Math.round(totalHostPayouts) }, { name: "Stripe Fees", value: Math.round(totalStripeFees) }, { name: "Platform Net", value: Math.round(netPlatformRevenue > 0 ? netPlatformRevenue : 0) }];

  return (
    <OperationalPageShell mode="admin">
      <OperationalHero mode="admin" title="Platform P&L" subtitle="Revenue, payout, margin, and fleet performance visibility" eyebrow="Operations" />
      <OperationalKpiGrid mode="admin" metrics={[
        { label: "Gross Revenue", value: grossRevenue, type: "currency", note: "total collected", icon: DollarSign, variant: "success" },
        { label: "Net Platform Revenue", value: netPlatformRevenue, type: "currency", note: `${margin}% margin`, icon: TrendingUp, variant: netPlatformRevenue >= 0 ? "primary" : "danger" },
        { label: "Host Payouts Sent", value: totalHostPayouts, type: "currency", note: "platform expense", icon: Landmark, variant: "warning" },
        { label: "Est. MRR", value: mrr, type: "currency", note: `${activeBookings.length} active rentals`, icon: CreditCard, variant: "info" },
      ]} />
      <OperationalFilterBar mode="admin" filters={filters} onChange={(next) => setRange(Number(next.dateRange || 30))} dateRanges={RANGES} resultCount={paidLogs.length} totalCount={paymentLogs.length} placeholder="P&L search reserved" />

      <OperationalDataSection mode="admin" title="Secondary Metrics" bodyClassName="p-4">
        <OperationalKpiGrid mode="admin" metrics={[
          { label: "Stripe Fees Paid", value: totalStripeFees, type: "currency", variant: "warning" },
          { label: "Platform Fee Collected", value: totalPlatformFees, type: "currency", variant: "primary" },
          { label: "Churn Rate", value: `${churnRate}%`, variant: "danger" },
          { label: "Active Fleet", value: `${vehicles.filter(v => v.status === "Available" || v.status === "Booked").length} vehicles`, variant: "info" },
        ]} />
      </OperationalDataSection>

      <OperationalDataSection mode="admin" title="Revenue Trend" subtitle="Gross collected vs. net platform revenue by month" empty={trendData.length === 0} emptyTitle="No payment data in this period yet" bodyClassName="p-4">
        {trendData.length > 0 && <ResponsiveContainer width="100%" height={260}><AreaChart data={trendData}><defs><linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(338,90%,56%)" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(338,90%,56%)" stopOpacity={0} /></linearGradient><linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(152,60%,46%)" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(152,60%,46%)" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="hsl(210 20% 95% / 0.04)" /><XAxis dataKey="month" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} /><YAxis fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} /><Tooltip content={<Tooltip_ />} /><Area type="monotone" dataKey="gross" name="Gross" stroke="hsl(338,90%,56%)" strokeWidth={2} fill="url(#grossGrad)" dot={false} /><Area type="monotone" dataKey="net" name="Net" stroke="hsl(152,60%,46%)" strokeWidth={2} fill="url(#netGrad)" dot={false} /></AreaChart></ResponsiveContainer>}
      </OperationalDataSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <OperationalDataSection mode="admin" title="Revenue by City" subtitle="Top markets" empty={cityData.length === 0} emptyTitle="No city data yet" bodyClassName="p-4">
          {cityData.length > 0 && <ResponsiveContainer width="100%" height={240}><BarChart data={cityData} layout="vertical"><XAxis type="number" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} /><YAxis type="category" dataKey="city" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} width={80} axisLine={false} tickLine={false} /><Tooltip content={<Tooltip_ />} /><Bar dataKey="rev" radius={[0, 6, 6, 0]}>{cityData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.85} />)}</Bar></BarChart></ResponsiveContainer>}
        </OperationalDataSection>
        <OperationalDataSection mode="admin" title="Revenue Split" subtitle="Where every dollar goes" bodyClassName="p-4">
          <div className="flex items-center gap-4"><ResponsiveContainer width={160} height={160}><PieChart><Pie data={splitData} cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={3} dataKey="value" strokeWidth={0}>{splitData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie></PieChart></ResponsiveContainer><div className="flex-1 space-y-3">{splitData.map((s, i) => <div key={s.name}><div className="mb-1 flex items-center justify-between"><div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /><span className="text-xs text-white/50">{s.name}</span></div><span className="text-xs font-bold text-white">${s.value.toLocaleString()}</span></div><div className="h-1 rounded-full bg-white/5"><div className="h-1 rounded-full" style={{ width: `${grossRevenue > 0 ? Math.round((s.value / grossRevenue) * 100) : 0}%`, background: COLORS[i % COLORS.length] }} /></div></div>)}</div></div>
        </OperationalDataSection>
      </div>
    </OperationalPageShell>
  );
}