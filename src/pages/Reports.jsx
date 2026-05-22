import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, Cell, PieChart, Pie } from "recharts";
import {
  OperationalPageShell,
  OperationalHero,
  OperationalKpiGrid,
  OperationalFilterBar,
  OperationalAdvancedFilters,
  OperationalExportToolbar,
  OperationalDataSection,
} from "@/components/operational";

const downloadCsv = (rows, filename) => {
  const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const COLORS = ["hsl(338,90%,56%)", "hsl(265,80%,62%)", "hsl(152,60%,46%)", "hsl(38,95%,54%)", "hsl(199,90%,54%)"];

const ChartTooltip = ({ active, payload, label, prefix = "" }) => {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-white/10 px-3 py-2 text-xs" style={{ background: "hsl(222 28% 12%)" }}><p className="mb-1 text-white/50">{label}</p><p className="font-semibold text-white">{prefix}{payload[0].value?.toLocaleString()}</p></div>;
};

export default function Reports() {
  const [filters, setFilters] = useState({ search: "", dateFrom: "", dateTo: "", bookingStatus: "", paymentStatus: "" });

  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => base44.entities.Vehicle.list() });
  const { data: bookings = [] } = useQuery({ queryKey: ["bookings"], queryFn: () => base44.entities.Booking.list() });
  const { data: payments = [] } = useQuery({ queryKey: ["payments"], queryFn: () => base44.entities.Payment.list() });
  const { data: customers = [] } = useQuery({ queryKey: ["customers-report"], queryFn: () => base44.entities.Customer.list() });
  const { data: bookingRequests = [] } = useQuery({ queryKey: ["booking-requests-report"], queryFn: () => base44.entities.BookingRequest.list("-created_date", 500) });

  const filteredBookingRequests = bookingRequests.filter((b) => {
    if (filters.search && !`${b.customer_full_name} ${b.user_email} ${b.vehicle_name}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.bookingStatus && b.booking_status !== filters.bookingStatus) return false;
    if (filters.paymentStatus && b.payment_status !== filters.paymentStatus) return false;
    const dateRef = b.agreement_accepted_at || b.submitted_at || b.created_date;
    if (filters.dateFrom && dateRef && new Date(dateRef) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo && dateRef && new Date(dateRef) > new Date(filters.dateTo + "T23:59:59")) return false;
    return true;
  });

  const paidRequests = filteredBookingRequests.filter((b) => b.payment_status === "paid" && b.total_due_now > 0);
  const vehicleRevenue = {};
  paidRequests.forEach((b) => { const vName = b.vehicle_name || "Unknown"; vehicleRevenue[vName] = (vehicleRevenue[vName] || 0) + (b.total_due_now || 0); });
  payments.filter((p) => p.status === "Paid").forEach((p) => { const booking = bookings.find((b) => b.id === p.booking_id); if (booking) { const vName = booking.vehicle_name || "Unknown"; vehicleRevenue[vName] = (vehicleRevenue[vName] || 0) + (p.amount || 0); } });
  const vehicleRevenueData = Object.entries(vehicleRevenue).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  const cityStats = {};
  vehicles.forEach((v) => { const city = v.city || v.current_city || "Unknown"; if (!cityStats[city]) cityStats[city] = { total: 0, booked: 0 }; cityStats[city].total++; if (v.status === "Booked") cityStats[city].booked++; });
  const utilizationData = Object.entries(cityStats).map(([city, s]) => ({ city, rate: s.total > 0 ? Math.round((s.booked / s.total) * 100) : 0 }));

  const monthlyData = {};
  paidRequests.forEach((b) => { const dateStr = b.agreement_accepted_at || b.submitted_at || b.created_date; if (!dateStr) return; const d = new Date(dateStr); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; monthlyData[key] = (monthlyData[key] || 0) + (b.total_due_now || 0); });
  payments.filter((p) => p.status === "Paid" && p.paid_date).forEach((p) => { const d = new Date(p.paid_date); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; monthlyData[key] = (monthlyData[key] || 0) + (p.amount || 0); });
  const trendData = Object.entries(monthlyData).sort().map(([month, revenue]) => ({ month: month.slice(5), revenue }));
  if (trendData.length === 0) trendData.push({ month: new Date().toISOString().slice(5, 7), revenue: 0 });

  const leadSourceCounts = {};
  customers.forEach((c) => { const src = c.lead_source || "Other"; leadSourceCounts[src] = (leadSourceCounts[src] || 0) + 1; });
  const totalCustomers = customers.length || 1;
  const sourceData = Object.entries(leadSourceCounts).length > 0 ? Object.entries(leadSourceCounts).map(([name, count]) => ({ name, value: Math.round((count / totalCustomers) * 100) })) : [{ name: "Website", value: 100 }];

  const revenueFromRequests = paidRequests.reduce((s, b) => s + (b.total_due_now || 0), 0);
  const revenueFromPayments = payments.filter((p) => p.status === "Paid").reduce((s, p) => s + (p.amount || 0), 0);
  const totalRevenue = revenueFromRequests + revenueFromPayments;
  const totalBookings = filteredBookingRequests.filter((b) => !["draft", "cancelled"].includes(b.booking_status)).length;
  const paidCount = paidRequests.length + payments.filter((p) => p.status === "Paid").length;
  const totalTransactions = paidCount + payments.filter((p) => p.status !== "Paid").length + filteredBookingRequests.filter((b) => b.payment_status === "unpaid" && b.booking_status !== "draft").length;
  const complianceRate = totalTransactions > 0 ? Math.round((paidCount / totalTransactions) * 100) : 0;

  const kpis = [
    { label: "Payment Compliance", value: complianceRate, type: "percent", note: `${paidCount} paid transactions`, variant: "success" },
    { label: "Fleet Size", value: vehicles.length, note: "total vehicles", variant: "info" },
    { label: "Total Bookings", value: totalBookings, note: "active & completed", variant: "primary" },
    { label: "Total Revenue", value: totalRevenue, type: "currency", note: "all time collected", variant: "primary" },
  ];

  const exportReports = () => downloadCsv([
    ["Customer", "Email", "Vehicle", "Booking Status", "Payment Status", "Total Due", "Submitted"],
    ...filteredBookingRequests.map(b => [b.customer_full_name || "", b.user_email || "", b.vehicle_name || "", b.booking_status || "", b.payment_status || "", b.total_due_now || 0, b.submitted_at || b.created_date || ""]),
  ], `reports-${new Date().toISOString().split("T")[0]}.csv`);

  return (
    <OperationalPageShell mode="admin">
      <OperationalHero mode="admin" title="Reports" subtitle="Revenue, utilization, lead source, and vehicle performance reporting" eyebrow="Operations" actions={<OperationalExportToolbar mode="admin" exports={[{ label: "Export", onClick: exportReports }]} />} />
      <OperationalKpiGrid mode="admin" metrics={kpis} />
      <OperationalFilterBar mode="admin" filters={filters} onChange={setFilters} resultCount={filteredBookingRequests.length} totalCount={bookingRequests.length} placeholder="Search customer, email, vehicle..." />
      <OperationalAdvancedFilters mode="admin" filters={filters} onChange={setFilters} fields={[
        { key: "dateFrom", label: "From date", type: "date" },
        { key: "dateTo", label: "To date", type: "date" },
        { key: "bookingStatus", label: "booking status", options: ["active", "confirmed", "completed", "cancelled", "pending_review", "approved", "rejected"] },
        { key: "paymentStatus", label: "payment status", options: ["paid", "pending", "failed", "overdue", "unpaid", "refunded"] },
      ]} />

      <div className="grid gap-4 lg:grid-cols-3">
        <OperationalDataSection mode="admin" title="Monthly Revenue Trend" subtitle="Paid revenue over time" className="lg:col-span-2" bodyClassName="p-4">
          <ResponsiveContainer width="100%" height={260}><AreaChart data={trendData}><defs><linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(338,90%,56%)" stopOpacity={0.35} /><stop offset="100%" stopColor="hsl(338,90%,56%)" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="hsl(210 20% 95% / 0.05)" /><XAxis dataKey="month" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} /><YAxis fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip prefix="$" />} /><Area type="monotone" dataKey="revenue" stroke="hsl(338,90%,56%)" strokeWidth={2.5} fill="url(#trendGrad)" dot={false} /></AreaChart></ResponsiveContainer>
        </OperationalDataSection>
        <OperationalDataSection mode="admin" title="Lead Sources" subtitle="Customer acquisition" bodyClassName="p-4">
          <ResponsiveContainer width="100%" height={200}><PieChart><Pie data={sourceData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value" strokeWidth={0}>{sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip content={<ChartTooltip />} /></PieChart></ResponsiveContainer>
          <div className="mt-2 space-y-2">{sourceData.map((s, i) => <div key={s.name} className="flex items-center justify-between"><div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /><span className="text-xs text-white/50">{s.name}</span></div><span className="text-xs font-semibold text-white">{s.value}%</span></div>)}</div>
        </OperationalDataSection>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <OperationalDataSection mode="admin" title="Revenue by Vehicle" subtitle="Top performing vehicles" empty={vehicleRevenueData.length === 0} emptyTitle="No revenue data yet" bodyClassName="p-4">
          {vehicleRevenueData.length > 0 && <ResponsiveContainer width="100%" height={280}><BarChart data={vehicleRevenueData} layout="vertical"><XAxis type="number" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} width={130} axisLine={false} tickLine={false} /><Tooltip content={<ChartTooltip prefix="$" />} /><Bar dataKey="revenue" radius={[0, 6, 6, 0]}>{vehicleRevenueData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.85} />)}</Bar></BarChart></ResponsiveContainer>}
        </OperationalDataSection>
        <OperationalDataSection mode="admin" title="Fleet Utilization by City" subtitle="% of vehicles currently booked" empty={utilizationData.length === 0} emptyTitle="No data yet" bodyClassName="p-4">
          {utilizationData.length > 0 && <ResponsiveContainer width="100%" height={280}><BarChart data={utilizationData}><XAxis dataKey="city" fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} /><YAxis fontSize={11} tick={{ fill: "hsl(210 12% 52%)" }} axisLine={false} tickLine={false} unit="%" /><Tooltip content={<ChartTooltip />} /><Bar dataKey="rate" radius={[6, 6, 0, 0]}>{utilizationData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.85} />)}</Bar></BarChart></ResponsiveContainer>}
        </OperationalDataSection>
      </div>
    </OperationalPageShell>
  );
}