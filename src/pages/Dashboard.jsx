import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/lib/useTenant";
import { Car, Users, CalendarDays, DollarSign, FileKey, AlertTriangle, ArrowUpRight, Clock, Bell } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import StatusBadge from "@/components/shared/StatusBadge";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid
} from "recharts";

const CHART_COLORS = ["hsl(338,90%,56%)", "hsl(265,80%,62%)", "hsl(152,60%,46%)", "hsl(38,95%,54%)", "hsl(199,90%,54%)"];

const GlassCard = ({ children, className = "" }) => (
  <div className={`rounded-2xl border border-white/[0.07] p-6 ${className}`}
    style={{ background: "hsl(222 24% 10% / 0.9)", boxShadow: "0 4px 32px hsl(222 28% 5% / 0.5)" }}>
    {children}
  </div>
);

const ChartTooltip = ({ active, payload, label, prefix = "" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 px-3 py-2 text-xs" style={{ background: "hsl(222 28% 12%)", boxShadow: "0 8px 32px hsl(222 28% 5% / 0.8)" }}>
      <p className="text-white/50 mb-1">{label}</p>
      <p className="font-semibold text-white">{prefix}{payload[0].value?.toLocaleString()}</p>
    </div>
  );
};

export default function Dashboard() {
  const { tenantFilter, companyId, isSuperadmin, overrideCompanyId } = useTenant();
  const scopeKey = companyId || "all";

  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles", scopeKey], queryFn: () => base44.entities.Vehicle.filter(tenantFilter()) });
  const { data: customers = [] } = useQuery({ queryKey: ["customers", scopeKey], queryFn: () => base44.entities.Customer.filter(tenantFilter()) });
  const { data: bookings = [] } = useQuery({ queryKey: ["bookings", scopeKey], queryFn: () => base44.entities.Booking.filter(tenantFilter()) });
  const { data: payments = [] } = useQuery({ queryKey: ["payments", scopeKey], queryFn: () => base44.entities.Payment.filter(tenantFilter()) });
  const { data: contracts = [] } = useQuery({ queryKey: ["contracts", scopeKey], queryFn: () => base44.entities.RentToOwnContract.filter(tenantFilter()) });
  const { data: bookingRequests = [] } = useQuery({ queryKey: ["booking-requests-admin", scopeKey], queryFn: () => base44.entities.BookingRequest.filter(tenantFilter(), "-created_date", 200), refetchInterval: 30_000 });

  const pendingReviews = bookingRequests.filter((b) => b.booking_status === "pending_review");
  const unopenedPending = pendingReviews.filter((b) => !b.viewed_by_admin);
  const today = new Date(); today.setHours(0,0,0,0);
  const pendingToday = pendingReviews.filter((b) => {
    const d = new Date(b.submitted_at || b.created_date); d.setHours(0,0,0,0);
    return d.getTime() === today.getTime();
  });

  // Real active rentals from BookingRequests (source of truth)
  const activeRentals = bookingRequests.filter((b) => ["approved", "confirmed", "active", "pending_review"].includes(b.booking_status)).length;
  const availableVehicles = vehicles.filter((v) => v.status === "Available").length;
  const overduePayments = payments.filter((p) => p.status === "Overdue");
  const activeContracts = contracts.filter((c) => c.status === "Active").length +
    bookingRequests.filter((b) => b.booking_type === "Rent-to-Own" && ["approved", "confirmed", "active"].includes(b.booking_status)).length;

  // Real revenue: BookingRequests (paid) + legacy Payment records
  const revenueFromRequests = bookingRequests
    .filter((b) => b.payment_status === "paid")
    .reduce((s, b) => s + (b.total_due_now || 0), 0);
  const revenueFromPayments = payments.filter((p) => p.status === "Paid").reduce((s, p) => s + (p.amount || 0), 0);
  const totalRevenue = revenueFromRequests + revenueFromPayments;

  const now = new Date();
  const thisMonthRevenue = bookingRequests
    .filter((b) => {
      if (b.payment_status !== "paid") return false;
      const dateStr = b.agreement_accepted_at || b.submitted_at || b.created_date;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, b) => s + (b.total_due_now || 0), 0)
    + payments.filter((p) => {
      if (!p.paid_date || p.status !== "Paid") return false;
      const d = new Date(p.paid_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s, p) => s + (p.amount || 0), 0);

  // Monthly trend (BookingRequests + legacy Payments)
  const monthlyData = {};
  bookingRequests.filter((b) => b.payment_status === "paid").forEach((b) => {
    const dateStr = b.agreement_accepted_at || b.submitted_at || b.created_date;
    if (!dateStr) return;
    const d = new Date(dateStr);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyData[key] = (monthlyData[key] || 0) + (b.total_due_now || 0);
  });
  payments.filter((p) => p.status === "Paid" && p.paid_date).forEach((p) => {
    const d = new Date(p.paid_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyData[key] = (monthlyData[key] || 0) + (p.amount || 0);
  });
  const trendData = Object.entries(monthlyData).sort().map(([month, revenue]) => ({ month: month.slice(5), revenue }));

  // Fleet status pie
  const statusCounts = {};
  vehicles.forEach((v) => { statusCounts[v.status] = (statusCounts[v.status] || 0) + 1; });
  const fleetPie = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  if (fleetPie.length === 0) {
    fleetPie.push({ name: "No Data", value: 1 });
  }

  // Payment method breakdown
  const methodData = {};
  payments.filter((p) => p.status === "Paid").forEach((p) => {
    methodData[p.payment_method || "Other"] = (methodData[p.payment_method || "Other"] || 0) + (p.amount || 0);
  });
  const methodChart = Object.entries(methodData).map(([name, value]) => ({ name, value }));

  // Use BookingRequests as the source of recent activity (real data)
  const recentBookings = [...bookingRequests]
    .filter((b) => b.booking_status !== "draft")
    .slice(0, 5);

  const stats = [
    { title: "Active Rentals", value: activeRentals, icon: CalendarDays, colorIndex: 0 },
    { title: "Available Vehicles", value: availableVehicles, icon: Car, colorIndex: 2 },
    { title: "Total Revenue", value: `$${totalRevenue.toLocaleString()}`, icon: DollarSign, colorIndex: 1 },
    { title: "Monthly Revenue", value: `$${thisMonthRevenue.toLocaleString()}`, icon: DollarSign, colorIndex: 3 },
    { title: "Total Customers", value: customers.length, icon: Users, colorIndex: 5 },
    { title: "Active RTO", value: activeContracts, icon: FileKey, colorIndex: 4 },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* Pending Reviews Alert Widget */}
      {pendingReviews.length > 0 && (
        <div className="rounded-2xl border-2 border-yellow-400/40 overflow-hidden"
          style={{ background: "linear-gradient(135deg, hsl(45 95% 60% / 0.12) 0%, hsl(38 95% 54% / 0.08) 100%)" }}>
          <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, hsl(45 95% 55%), hsl(38 95% 50%))" }} />
          <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center flex-shrink-0">
                <Bell className="h-6 w-6 text-yellow-400" />
              </div>
              <div>
                <p className="font-bold text-yellow-300 text-base">
                  {pendingReviews.length} Pending {pendingReviews.length === 1 ? "Booking" : "Bookings"} Awaiting Review
                </p>
                <div className="flex items-center gap-4 mt-1 text-xs text-white/50">
                  <span>{unopenedPending.length} unopened</span>
                  <span>·</span>
                  <span>{pendingToday.length} new today</span>
                </div>
              </div>
            </div>
            <Link
              to="/bookings-admin"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-black transition-all hover:opacity-90 active:scale-95 flex-shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(45 95% 60%), hsl(38 95% 54%))" }}
            >
              Review Now <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((s) => <StatCard key={s.title} {...s} />)}
      </div>

      {/* Revenue area chart + fleet pie */}
      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-syne font-bold text-white text-base">Revenue Trend</h3>
              <p className="text-xs text-white/35 mt-0.5">Monthly collected revenue</p>
            </div>
            <span className="text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-lg">+12.4%</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData.length > 0 ? trendData : [{ month: "01", revenue: 0 }]}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(338,90%,56%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(338,90%,56%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(210 20% 95% / 0.05)" />
              <XAxis dataKey="month" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} />
              <YAxis fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip prefix="$" />} />
              <Area type="monotone" dataKey="revenue" stroke="hsl(338,90%,56%)" strokeWidth={2.5} fill="url(#revGrad)" dot={false} activeDot={{ r: 5, fill: "hsl(338,90%,56%)", stroke: "hsl(222,28%,10%)", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard>
          <div className="mb-5">
            <h3 className="font-syne font-bold text-white text-base">Fleet Status</h3>
            <p className="text-xs text-white/35 mt-0.5">{vehicles.length} total vehicles</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={fleetPie} cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={3} dataKey="value" strokeWidth={0}>
                {fleetPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {fleetPie.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-xs text-white/50">{item.name}</span>
                </div>
                <span className="text-xs font-semibold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Payment methods bar + recent bookings + overdue */}
      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard>
          <div className="mb-5">
            <h3 className="font-syne font-bold text-white text-base">Payment Methods</h3>
            <p className="text-xs text-white/35 mt-0.5">Revenue by method</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={methodChart.length > 0 ? methodChart : [{ name: "No Data", value: 0 }]}>
              <XAxis dataKey="name" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} />
              <YAxis fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip prefix="$" />} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="url(#barGrad)">
                {methodChart.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-syne font-bold text-white text-base">Recent Bookings</h3>
              <p className="text-xs text-white/35 mt-0.5">Latest activity</p>
            </div>
            <Link to="/bookings" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {recentBookings.length > 0 ? recentBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] transition-colors border border-white/[0.04]">
                <div className="min-w-0">
                  <p className="font-medium text-white text-sm truncate">{b.customer_full_name || "Customer"}</p>
                  <p className="text-xs text-white/35 mt-0.5 truncate">{b.vehicle_name} · {b.booking_type}</p>
                </div>
                <StatusBadge status={b.booking_status} />
              </div>
            )) : (
              <p className="text-white/25 text-sm text-center py-6">No bookings yet</p>
            )}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-syne font-bold text-white text-base">Overdue Payments</h3>
              <p className="text-xs text-white/35 mt-0.5">Requires attention</p>
            </div>
            <Link to="/payments" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {overduePayments.length > 0 ? overduePayments.slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-red-500/[0.07] border border-red-500/20 hover:bg-red-500/10 transition-colors">
                <div className="min-w-0">
                  <p className="font-medium text-white text-sm truncate">{p.customer_name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3 text-red-400" />
                    <p className="text-xs text-red-400/80">{p.due_date ? format(new Date(p.due_date), "MMM d") : "N/A"}</p>
                  </div>
                </div>
                <p className="font-bold text-red-400 text-sm">${p.amount?.toLocaleString()}</p>
              </div>
            )) : (
              <div className="flex flex-col items-center py-6">
                <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
                  <span className="text-green-400 text-lg">✓</span>
                </div>
                <p className="text-white/25 text-sm">All payments on time</p>
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}