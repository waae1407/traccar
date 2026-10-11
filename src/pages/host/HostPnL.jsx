import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Wallet, Download } from "lucide-react";
import { isWithinInterval, format } from "date-fns";
import HostPageHeader from "@/components/host/HostPageHeader";
import HostReports from "@/pages/host/HostReports";
import PnLFilters, { DEFAULT_FILTERS, getDateBounds, getPrevBounds } from "@/components/host/pnl/PnLFilters";
import VehicleProfitabilityTable from "@/components/host/pnl/VehicleProfitabilityTable";
import PnLInsights from "@/components/host/pnl/PnLInsights";
import PnLDetailSheet from "@/components/shared/PnLDetailSheet";

const EXPENSE_TYPE_LABELS = {
  fuel: "Fuel", insurance: "Insurance", repair: "Repair", cleaning: "Cleaning",
  registration: "Registration", toll: "Toll", parking: "Parking", maintenance: "Maintenance",
  tires: "Tires", damage: "Damage", gps: "GPS", other: "Other",
};
const COLORS = ["#e91e8c", "#7c3aed", "#f59e0b", "#10b981", "#3b82f6", "#f97316", "#06b6d4", "#64748b"];

function inBounds(dateStr, bounds) {
  if (!bounds || !dateStr) return true;
  try { return isWithinInterval(new Date(dateStr), bounds); } catch { return false; }
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg px-3 py-2 text-xs">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} className="font-semibold" style={{ color: p.color }}>${Number(p.value || 0).toLocaleString()} {p.name}</p>)}
    </div>
  );
};

function KpiCard({ label, value, sub, color, icon: Icon, bg, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-2xl border shadow-sm p-4 text-left transition-all disabled:cursor-default ${bg} ${onClick ? "hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]" : ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
        {Icon && <Icon className={`h-4 w-4 ${color}`} />}
      </div>
      <p className={`text-2xl font-black ${color}`} style={{ fontFamily: "var(--font-syne)" }}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-1">{sub}</p>}
    </button>
  );
}

export default function HostPnL() {
  const { user } = useAuth();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = useState("overview");
  const [detail, setDetail] = useState(null);

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({ queryKey: ["host-vehicles-pnl", host?.id], queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: payouts = [] } = useQuery({ queryKey: ["host-payouts-pnl", host?.id], queryFn: () => base44.entities.HostPayout.filter({ host_id: host.id }, "-created_date", 300), enabled: !!host?.id });
  const { data: paymentLogs = [] } = useQuery({ queryKey: ["host-payments-pnl", host?.id], queryFn: () => base44.entities.PaymentLog.filter({ host_id: host.id }, "-paid_at", 300).catch(() => []), enabled: !!host?.id });
  const { data: expenses = [] } = useQuery({ queryKey: ["host-expenses-pnl", host?.id], queryFn: () => base44.entities.HostExpense.filter({ host_id: host.id }, "-date", 300), enabled: !!host?.id });
  const { data: maintenance = [] } = useQuery({ queryKey: ["host-maint-pnl", host?.id], queryFn: () => base44.entities.HostMaintenanceLog.filter({ host_id: host.id }, "-date", 300), enabled: !!host?.id });
  const { data: disputes = [] } = useQuery({ queryKey: ["host-disputes-pnl", host?.id], queryFn: () => base44.entities.Dispute.filter({ host_id: host.id }, "-created_date", 100).catch(() => []), enabled: !!host?.id });

  const bounds = useMemo(() => getDateBounds(filters.dateRange), [filters.dateRange]);
  const prevBounds = useMemo(() => getPrevBounds(filters.dateRange), [filters.dateRange]);

  const inFilter = (item, dateKey) => {
    if (filters.vehicleId && item.vehicle_id !== filters.vehicleId) return false;
    return inBounds(item[dateKey], bounds);
  };

  const rangedPayouts = useMemo(() => payouts.filter(p => p.status !== 'voided_duplicate' && inBounds(p.payout_date || p.created_date, bounds)), [payouts, bounds]);
  const paidPayouts = useMemo(() => rangedPayouts.filter(p => p.status === 'paid'), [rangedPayouts]);
  const grossRevenue = useMemo(() => paidPayouts.reduce((s, p) => s + (p.gross_booking_amount || p.gross_collected || 0), 0), [paidPayouts]);
  const netPayout = useMemo(() => paidPayouts.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0), [paidPayouts]);
  const platformFees = useMemo(() => paidPayouts.reduce((s, p) => s + (p.uride_platform_fee_amount || p.platform_fee || 0), 0), [paidPayouts]);
  const stripeFees = useMemo(() => paidPayouts.reduce((s, p) => s + (p.stripe_fee_amount || 0), 0), [paidPayouts]);
  const pendingPayoutTotal = useMemo(() => rangedPayouts.filter(p => p.status === 'pending').reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0), [rangedPayouts]);

  const rangedExpenses = useMemo(() => expenses.filter(e => inFilter(e, "date")), [expenses, filters, bounds]);
  const rangedMaint = useMemo(() => maintenance.filter(m => inFilter(m, "date")), [maintenance, filters, bounds]);
  const totalExpenses = useMemo(() => rangedExpenses.reduce((s, e) => s + (e.amount || 0), 0), [rangedExpenses]);
  const totalMaint = useMemo(() => rangedMaint.reduce((s, m) => s + (m.cost || 0), 0), [rangedMaint]);
  const totalCosts = totalExpenses + totalMaint;
  const netProfit = netPayout - totalCosts;
  const profitMargin = grossRevenue > 0 ? ((netProfit / grossRevenue) * 100) : 0;

  const prevNetProfit = useMemo(() => {
    if (!prevBounds) return null;
    const prevP = payouts.filter(p => p.status === 'paid' && inBounds(p.payout_date || p.created_date, prevBounds));
    const pnp = prevP.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
    const pe = expenses.filter(e => inBounds(e.date, prevBounds)).reduce((s, e) => s + (e.amount || 0), 0);
    const pm = maintenance.filter(m => inBounds(m.date, prevBounds)).reduce((s, m) => s + (m.cost || 0), 0);
    return pnp - pe - pm;
  }, [payouts, expenses, maintenance, prevBounds]);

  const vehicleRows = useMemo(() => {
    return vehicles.filter(v => !filters.vehicleId || v.id === filters.vehicleId).map(v => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const name = `${v.year} ${v.make} ${v.model}`;
        if (!name.toLowerCase().includes(q) && !(v.vin || "").toLowerCase().includes(q) && !(v.plate || "").toLowerCase().includes(q)) return null;
      }
      const vPayments = paymentLogs.filter(p => p.vehicle_id === v.id && p.status === "paid" && inBounds(p.paid_at || p.created_date, bounds));
      const vGross = vPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const vPayoutItems = payouts.filter(p => {
        if (p.status !== 'paid') return false;
        const linked = paymentLogs.find(pl => pl.vehicle_id === v.id && pl.booking_request_id === p.booking_request_id);
        return linked && inBounds(p.payout_date || p.created_date, bounds);
      });
      const vNetPayout = vPayoutItems.reduce((s, p) => s + (p.net_host_payout || p.net_payout || 0), 0);
      const vExpCost = expenses.filter(e => e.vehicle_id === v.id && inBounds(e.date, bounds)).reduce((s, e) => s + (e.amount || 0), 0);
      const vMaintCost = maintenance.filter(m => m.vehicle_id === v.id && inBounds(m.date, bounds)).reduce((s, m) => s + (m.cost || 0), 0);
      const vDisputeCost = disputes.filter(d => d.vehicle_id === v.id && inBounds(d.created_date, bounds)).reduce((s, d) => s + (d.resolution_amount_to_customer || 0), 0);
      const totalVCosts = vExpCost + vMaintCost + vDisputeCost;
      if (vGross === 0 && totalVCosts === 0) return null;
      return {
        id: v.id, name: `${v.year} ${v.make} ${v.model}`, plate: v.plate,
        grossRevenue: Math.round(vGross), netPayout: Math.round(vNetPayout),
        expCost: Math.round(vExpCost), maintCost: Math.round(vMaintCost),
        disputeCost: Math.round(vDisputeCost), totalCosts: Math.round(totalVCosts),
        net: Math.round(vNetPayout - totalVCosts), paymentCount: vPayments.length,
      };
    }).filter(Boolean);
  }, [vehicles, paymentLogs, payouts, expenses, maintenance, disputes, bounds, filters]);

  const sortedV = [...vehicleRows].sort((a, b) => b.net - a.net);
  const bestVehicle = sortedV[0];

  const trendData = useMemo(() => {
    const map = {};
    paidPayouts.forEach(p => {
      const d = new Date(p.payout_date || p.created_date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map[k]) map[k] = { payout: 0, costs: 0 };
      map[k].payout += p.net_host_payout || p.net_payout || 0;
    });
    [...rangedExpenses, ...rangedMaint].forEach(item => {
      const d = new Date(item.date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map[k]) map[k] = { payout: 0, costs: 0 };
      map[k].costs += item.amount || item.cost || 0;
    });
    return Object.entries(map).sort().map(([month, v]) => ({
      month: month.slice(5), payout: Math.round(v.payout),
      costs: Math.round(v.costs), profit: Math.round(v.payout - v.costs),
    }));
  }, [paidPayouts, rangedExpenses, rangedMaint]);

  const expBreakdown = useMemo(() => {
    const map = {};
    rangedExpenses.forEach(e => { map[e.expense_type] = (map[e.expense_type] || 0) + (e.amount || 0); });
    if (totalMaint > 0) map["maintenance"] = (map["maintenance"] || 0) + totalMaint;
    return Object.entries(map).map(([type, total], i) => ({
      type, total: Math.round(total), label: EXPENSE_TYPE_LABELS[type] || type, color: COLORS[i % COLORS.length],
    })).sort((a, b) => b.total - a.total);
  }, [rangedExpenses, totalMaint]);

  function exportCSV(rows, headers, filename) {
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }

  const periodChange = prevNetProfit !== null ? netProfit - prevNetProfit : null;
  const feeRate = grossRevenue > 0 ? ((platformFees + stripeFees) / grossRevenue * 100).toFixed(1) : "0";

  // ── Helper maps for detail sheets ──
  const vehicleMap = {}; vehicles.forEach(v => { vehicleMap[v.id] = v; });
  const paymentVehicleMap = {};
  paymentLogs.forEach(p => { if (p.vehicle_id && !paymentVehicleMap[p.booking_request_id]) paymentVehicleMap[p.booking_request_id] = p.vehicle_id; });
  const payoutVehicleName = (payout) => {
    const vid = paymentVehicleMap[payout.booking_request_id];
    const v = vid ? vehicleMap[vid] : null;
    return v ? `${v.year} ${v.make} ${v.model}` : "—";
  };

  // ── Detail data for clickable cards ──
  const detailGross = {
    title: "Gross Revenue",
    subtitle: `${paidPayouts.length} paid payout${paidPayouts.length !== 1 ? "s" : ""}${rangedPayouts.length > paidPayouts.length ? ` · ${rangedPayouts.length - paidPayouts.length} pending` : ""}`,
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "vehicle", label: "Vehicle" },
      { key: "gross", label: "Gross", type: "currency" },
      { key: "status", label: "Status", type: "status" },
    ],
    rows: paidPayouts.map(p => ({ _id: p.id, date: p.payout_date || p.created_date, vehicle: payoutVehicleName(p), gross: p.gross_booking_amount || p.gross_collected || 0, status: p.status })),
    summary: [{ label: "Total Gross", value: `$${Math.round(grossRevenue).toLocaleString()}` }],
  };

  const detailNetPayout = {
    title: "Net Payout",
    subtitle: `After ${feeRate}% in fees`,
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "vehicle", label: "Vehicle" },
      { key: "gross", label: "Gross", type: "currency" },
      { key: "platformFee", label: "Platform Fee", type: "currency" },
      { key: "stripeFee", label: "Stripe Fee", type: "currency" },
      { key: "net", label: "Net Payout", type: "currency" },
    ],
    rows: paidPayouts.map(p => ({ _id: p.id, date: p.payout_date || p.created_date, vehicle: payoutVehicleName(p), gross: p.gross_booking_amount || 0, platformFee: p.uride_platform_fee_amount || p.platform_fee || 0, stripeFee: p.stripe_fee_amount || 0, net: p.net_host_payout || p.net_payout || 0 })),
    summary: [
      { label: "Total Net Payout", value: `$${Math.round(netPayout).toLocaleString()}` },
      { label: "Total Fees", value: `$${Math.round(platformFees + stripeFees).toLocaleString()}` },
    ],
  };

  const detailCosts = {
    title: "Total Costs",
    subtitle: "Expenses + Maintenance in this period",
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "category", label: "Category" },
      { key: "vehicle", label: "Vehicle" },
      { key: "amount", label: "Amount", type: "currency" },
    ],
    rows: [
      ...rangedExpenses.map(e => {
        const v = e.vehicle_id ? vehicleMap[e.vehicle_id] : null;
        return { _id: e.id, date: e.date, category: EXPENSE_TYPE_LABELS[e.expense_type] || e.expense_type || "Expense", vehicle: v ? `${v.year} ${v.make} ${v.model}` : "—", amount: e.amount };
      }),
      ...rangedMaint.map(m => {
        const v = m.vehicle_id ? vehicleMap[m.vehicle_id] : null;
        return { _id: m.id, date: m.date, category: "Maintenance", vehicle: v ? `${v.year} ${v.make} ${v.model}` : "—", amount: m.cost };
      }),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)),
    summary: [
      { label: "Total Expenses", value: `$${Math.round(totalExpenses).toLocaleString()}` },
      { label: "Total Maintenance", value: `$${Math.round(totalMaint).toLocaleString()}` },
      { label: "Grand Total", value: `$${Math.round(totalCosts).toLocaleString()}` },
    ],
  };

  const detailNetProfit = {
    title: "Net Profit",
    subtitle: "P&L calculation breakdown",
    columns: [
      { key: "component", label: "Component" },
      { key: "amount", label: "Amount", type: "currency" },
    ],
    rows: [
      { _id: "payout", component: "Net Payout Received", amount: netPayout },
      { _id: "expenses", component: "Operating Expenses", amount: -totalExpenses },
      { _id: "maint", component: "Maintenance Costs", amount: -totalMaint },
      { _id: "profit", component: "Net Profit", amount: netProfit },
    ],
    summary: [{ label: "Profit Margin", value: `${profitMargin.toFixed(1)}%` }],
  };

  const detailMargin = {
    title: "Profit Margin",
    subtitle: "Margin calculation",
    columns: [
      { key: "component", label: "Component" },
      { key: "amount", label: "Amount", type: "currency" },
    ],
    rows: [
      { _id: "gross", component: "Gross Revenue", amount: grossRevenue },
      { _id: "net", component: "Net Profit", amount: netProfit },
    ],
    summary: [{ label: "Margin", value: `${profitMargin.toFixed(1)}%` }],
  };

  const detailAvgProfit = {
    title: "Per-Vehicle Profit",
    subtitle: `${vehicleRows.length} vehicle${vehicleRows.length !== 1 ? "s" : ""} with activity`,
    columns: [
      { key: "vehicle", label: "Vehicle" },
      { key: "gross", label: "Gross", type: "currency" },
      { key: "costs", label: "Costs", type: "currency" },
      { key: "net", label: "Net Profit", type: "currency" },
    ],
    rows: vehicleRows.map(r => ({ _id: r.id, vehicle: r.name, gross: r.grossRevenue, costs: r.totalCosts, net: r.net })),
    summary: [{ label: "Avg Profit / Vehicle", value: vehicleRows.length > 0 ? `$${Math.round(netProfit / vehicleRows.length).toLocaleString()}` : "—" }],
  };

  const detailBestVehicle = {
    title: "Best Performing Vehicle",
    subtitle: bestVehicle ? bestVehicle.name : "No data",
    columns: [
      { key: "component", label: "Metric" },
      { key: "amount", label: "Amount", type: "currency" },
    ],
    rows: bestVehicle ? [
      { _id: "gross", component: "Gross Revenue", amount: bestVehicle.grossRevenue },
      { _id: "payout", component: "Net Payout", amount: bestVehicle.netPayout },
      { _id: "exp", component: "Expenses", amount: bestVehicle.expCost },
      { _id: "maint", component: "Maintenance", amount: bestVehicle.maintCost },
      { _id: "dispute", component: "Disputes", amount: bestVehicle.disputeCost },
      { _id: "net", component: "Net Profit", amount: bestVehicle.net },
    ] : [],
    summary: bestVehicle ? [{ label: "Profit Margin", value: `${bestVehicle.grossRevenue > 0 ? ((bestVehicle.net / bestVehicle.grossRevenue) * 100).toFixed(1) : 0}%` }] : [],
  };

  const detailPriorPeriod = {
    title: "Period Comparison",
    subtitle: "Current vs. prior period",
    columns: [
      { key: "component", label: "Period" },
      { key: "amount", label: "Net Profit", type: "currency" },
    ],
    rows: [
      { _id: "prev", component: "Prior Period", amount: prevNetProfit ?? 0 },
      { _id: "curr", component: "Current Period", amount: netProfit },
      { _id: "change", component: "Change", amount: periodChange ?? 0 },
    ],
    summary: [{ label: "Change", value: periodChange !== null ? `${periodChange >= 0 ? "+" : ""}$${Math.round(periodChange).toLocaleString()}` : "No prior data" }],
  };

  const detailPending = {
    title: "Pending Payouts",
    subtitle: `${rangedPayouts.filter(p => p.status === "pending").length} payout${rangedPayouts.filter(p => p.status === "pending").length !== 1 ? "s" : ""} awaiting transfer`,
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "vehicle", label: "Vehicle" },
      { key: "gross", label: "Gross", type: "currency" },
      { key: "net", label: "Net Payout", type: "currency" },
      { key: "status", label: "Status", type: "status" },
    ],
    rows: rangedPayouts.filter(p => p.status === "pending").map(p => ({ _id: p.id, date: p.payout_date || p.created_date, vehicle: payoutVehicleName(p), gross: p.gross_booking_amount || 0, net: p.net_host_payout || p.net_payout || 0, status: p.status })),
    summary: [{ label: "Total Pending", value: `$${Math.round(pendingPayoutTotal).toLocaleString()}` }],
  };

  const waterfallRows = [
    { label: "Gross Revenue Collected", value: grossRevenue, sign: "", bold: false, color: "text-emerald-700", bar: "bg-emerald-400" },
    { label: "uRide Platform Fee", value: platformFees, sign: "\u2212", bold: false, color: "text-orange-600", bar: "bg-orange-400" },
    { label: "Stripe Processing Fees", value: stripeFees, sign: "\u2212", bold: false, color: "text-red-500", bar: "bg-red-400" },
    { label: "Net Payout Received", value: netPayout, sign: "=", bold: true, color: "text-blue-700", bar: "bg-blue-400" },
    ...expBreakdown.map(e => ({ label: e.label, value: e.total, sign: "\u2212", bold: false, color: "text-red-500", bar: "bg-red-300" })),
    { label: "Net Profit", value: netProfit, sign: "=", bold: true, color: netProfit >= 0 ? "text-pink-700" : "text-red-700", bar: netProfit >= 0 ? "bg-pink-500" : "bg-red-600" },
  ];

  return (
    <div className="space-y-5">
      <HostPageHeader
        title={"P\u0026L Dashboard"}
        subtitle="Fleet profitability command center"
        action={
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => exportCSV([["Gross Revenue", grossRevenue], ["Platform Fees", -platformFees], ["Net Payout", netPayout], ["Expenses", -totalExpenses], ["Maintenance", -totalMaint], ["Net Profit", netProfit], ["Margin %", profitMargin.toFixed(1)]], ["Item", "Amount"], `pnl-${format(new Date(), "yyyy-MM-dd")}.csv`)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-xs font-bold text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50">
              <Download className="h-3.5 w-3.5" /> P+L CSV
            </button>
            <button onClick={() => exportCSV(vehicleRows.map(r => [r.name, r.grossRevenue, r.netPayout, r.expCost, r.maintCost, r.disputeCost, r.net, `${r.grossRevenue > 0 ? ((r.net / r.grossRevenue) * 100).toFixed(1) : 0}%`]), ["Vehicle", "Gross Revenue", "Net Payout", "Expenses", "Maintenance", "Disputes", "Net Profit", "Margin"], `vehicles-${format(new Date(), "yyyy-MM-dd")}.csv`)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-xs font-bold text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50">
              <Download className="h-3.5 w-3.5" /> Vehicles
            </button>
            <button onClick={() => exportCSV(expBreakdown.map(e => [e.label, e.total, `${totalCosts > 0 ? ((e.total / totalCosts) * 100).toFixed(1) : 0}%`]), ["Category", "Amount", "% of Total"], `expenses-${format(new Date(), "yyyy-MM-dd")}.csv`)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-xs font-bold text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50">
              <Download className="h-3.5 w-3.5" /> Expenses
            </button>
          </div>
        }
      />

      <div className="flex gap-2 rounded-2xl bg-white border border-gray-100 p-1 shadow-sm">
        {[
          { id: "overview", label: "P&L Overview" },
          { id: "reports", label: "Reports & Exports" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 rounded-xl px-4 py-2 text-sm font-bold transition-all"
            style={activeTab === tab.id ? { color: "white", background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : { color: "#6b7280" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? <>
      <PnLFilters filters={filters} onChange={setFilters} vehicles={vehicles} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Gross Revenue" value={`$${Math.round(grossRevenue).toLocaleString()}`} color="text-emerald-600" bg="bg-emerald-50 border-emerald-100" icon={DollarSign} sub={`${paidPayouts.length} paid${rangedPayouts.length > paidPayouts.length ? ` · ${rangedPayouts.length - paidPayouts.length} pending` : ''}`} onClick={() => setDetail(detailGross)} />
        <KpiCard label="Net Payout" value={`$${Math.round(netPayout).toLocaleString()}`} color="text-blue-600" bg="bg-blue-50 border-blue-100" icon={Wallet} sub={`After ${feeRate}% fees`} onClick={() => setDetail(detailNetPayout)} />
        <KpiCard label="Total Costs" value={`$${Math.round(totalCosts).toLocaleString()}`} color="text-red-500" bg="bg-red-50 border-red-100" icon={TrendingDown} sub={`Exp $${Math.round(totalExpenses).toLocaleString()} + Maint $${Math.round(totalMaint).toLocaleString()}`} onClick={() => setDetail(detailCosts)} />
        <KpiCard label="Net Profit" value={netProfit >= 0 ? `+$${Math.round(netProfit).toLocaleString()}` : `-$${Math.abs(Math.round(netProfit)).toLocaleString()}`}
          color={netProfit >= 0 ? "text-pink-600" : "text-red-600"} bg={netProfit >= 0 ? "bg-pink-50 border-pink-100" : "bg-red-50 border-red-100"} icon={TrendingUp} sub={`${profitMargin.toFixed(1)}% margin`} onClick={() => setDetail(detailNetProfit)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Profit Margin" value={`${profitMargin.toFixed(1)}%`} color={profitMargin >= 20 ? "text-emerald-600" : profitMargin >= 0 ? "text-yellow-600" : "text-red-500"} bg="bg-white border-gray-100" onClick={() => setDetail(detailMargin)} />
        <KpiCard label="Avg Profit / Vehicle" value={vehicleRows.length > 0 ? `${Math.round(netProfit / vehicleRows.length) >= 0 ? "+" : "-"}$${Math.abs(Math.round(netProfit / vehicleRows.length)).toLocaleString()}` : "\u2014"} color="text-gray-700" bg="bg-white border-gray-100" onClick={() => setDetail(detailAvgProfit)} />
        <KpiCard label="Best Vehicle" value={bestVehicle ? bestVehicle.name.split(" ").slice(1).join(" ") : "\u2014"} color="text-emerald-600" bg="bg-emerald-50 border-emerald-100" sub={bestVehicle ? `+$${Math.round(bestVehicle.net).toLocaleString()}` : undefined} onClick={() => setDetail(detailBestVehicle)} />
        <KpiCard label="vs. Prior Period" value={periodChange !== null ? `${periodChange >= 0 ? "+" : ""}$${Math.round(periodChange).toLocaleString()}` : "No data"} color={periodChange === null ? "text-gray-400" : periodChange >= 0 ? "text-emerald-600" : "text-red-500"} bg="bg-white border-gray-100" onClick={() => setDetail(detailPriorPeriod)} />
        <KpiCard label="Pending Payouts" value={pendingPayoutTotal > 0 ? `$${Math.round(pendingPayoutTotal).toLocaleString()}` : "—"} color={pendingPayoutTotal > 0 ? "text-yellow-600" : "text-gray-400"} bg="bg-yellow-50 border-yellow-100" icon={Wallet} sub={`${rangedPayouts.filter(p => p.status === "pending").length} awaiting transfer`} onClick={() => setDetail(detailPending)} />
      </div>

      <PnLInsights vehicleRows={vehicleRows} grossRevenue={grossRevenue} totalCosts={totalCosts} netProfit={netProfit} prevNetProfit={prevNetProfit} dateRange={filters.dateRange} />

      {vehicleRows.length > 0
        ? <VehicleProfitabilityTable rows={vehicleRows} />
        : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
            <TrendingUp className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Profitability will appear after revenue and expenses are recorded.</p>
          </div>
        )
      }

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-4">Income Waterfall</h3>
        <div className="space-y-1.5">
          {waterfallRows.map((row, i) => {
            const maxVal = grossRevenue || 1;
            const barW = Math.min(100, Math.max(2, (Math.abs(row.value) / maxVal) * 100));
            return (
              <div key={i} className={`flex items-center gap-3 py-1.5 ${row.bold ? "border-t border-gray-100 mt-1 pt-2.5" : ""}`}>
                <span className="w-3 text-[10px] font-bold text-gray-400 flex-shrink-0">{row.sign}</span>
                <span className={`text-xs flex-1 ${row.bold ? "font-bold text-gray-800" : "text-gray-600"}`}>{row.label}</span>
                <div className="hidden sm:block w-24 h-1.5 rounded-full bg-gray-100 flex-shrink-0">
                  <div className={`h-full rounded-full ${row.bar}`} style={{ width: `${barW}%` }} />
                </div>
                <span className={`text-xs font-bold flex-shrink-0 w-20 text-right ${row.color} ${row.bold ? "text-sm" : ""}`}>
                  ${Math.abs(Math.round(row.value)).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 p-3 rounded-xl bg-gray-50 flex items-center justify-between">
          <span className="text-sm font-bold text-gray-700">Profit Margin</span>
          <span className={`text-lg font-black ${profitMargin >= 0 ? "text-pink-600" : "text-red-600"}`} style={{ fontFamily: "var(--font-syne)" }}>{profitMargin.toFixed(1)}%</span>
        </div>
      </div>

      {expBreakdown.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 text-sm mb-4">Expense Breakdown</h3>
          <div className="space-y-2">
            {expBreakdown.map(e => {
              const pct = totalCosts > 0 ? (e.total / totalCosts) * 100 : 0;
              return (
                <div key={e.type} className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: e.color }} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-gray-600">{e.label}</span>
                      <span className="text-xs font-bold text-gray-900">${e.total.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: e.color }} />
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0 w-8 text-right">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {trendData.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 text-sm mb-4">Monthly Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="payoutG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profitG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e91e8c" stopOpacity={0.3} /><stop offset="100%" stopColor="#e91e8c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <ReTooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="payout" name="Net Payout" stroke="#10b981" strokeWidth={2} fill="url(#payoutG)" dot={false} />
              <Area type="monotone" dataKey="profit" name="Net Profit" stroke="#e91e8c" strokeWidth={2} fill="url(#profitG)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-5 mt-2">
            <div className="flex items-center gap-2"><div className="h-2 w-4 rounded-full bg-emerald-500" /><span className="text-xs text-gray-400">Net Payout</span></div>
            <div className="flex items-center gap-2"><div className="h-2 w-4 rounded-full bg-pink-500" /><span className="text-xs text-gray-400">Net Profit</span></div>
          </div>
        </div>
      )}
      </> : <HostReports />}
      <PnLDetailSheet open={!!detail} onOpenChange={(v) => !v && setDetail(null)} mode="host" {...(detail || {})} />
    </div>
  );
}