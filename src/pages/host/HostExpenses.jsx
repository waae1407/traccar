import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Plus, Receipt, Loader2, Upload, Trash2, X, RefreshCw, Bell } from "lucide-react";
import { uploadFile } from "@/utils/uploadFile";
import HostPageHeader from "@/components/host/HostPageHeader";
import ExpenseFilters, { DEFAULT_FILTERS, EXPENSE_TYPES, TYPE_COLORS } from "@/components/host/expenses/ExpenseFilters";
import FleetProfitability from "@/components/host/expenses/FleetProfitability";
import ExpenseInsights from "@/components/host/expenses/ExpenseInsights";
import ExpenseDrawer from "@/components/host/expenses/ExpenseDrawer";
import RecurringExpenseForm from "@/components/host/expenses/RecurringExpenseForm";
import RecurringExpenseSection from "@/components/host/expenses/RecurringExpenseSection";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays, startOfYear, isWithinInterval, differenceInDays } from "date-fns";

const inputClass = "w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400 text-sm";

const TAX_DEDUCTIBLE_TYPES = new Set(["fuel", "insurance", "repair", "registration", "maintenance", "gps", "tires", "toll", "parking"]);

function getDateRange(range) {
  const now = new Date();
  if (range === "this_week") return { start: startOfWeek(now), end: now };
  if (range === "this_month") return { start: startOfMonth(now), end: endOfMonth(now) };
  if (range === "last30") return { start: subDays(now, 30), end: now };
  if (range === "last90") return { start: subDays(now, 90), end: now };
  if (range === "this_year") return { start: startOfYear(now), end: now };
  return null;
}

function matchesCostRange(amount, range) {
  if (!range) return true;
  const a = amount || 0;
  if (range === "0-100") return a >= 0 && a <= 100;
  if (range === "100-500") return a > 100 && a <= 500;
  if (range === "500-1000") return a > 500 && a <= 1000;
  if (range === "1000+") return a > 1000;
  return true;
}

export default function HostExpenses() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [form, setForm] = useState({
    vehicle_id: "", expense_type: "fuel", amount: "",
    date: format(new Date(), "yyyy-MM-dd"), description: "",
    receipt_url: "", reimbursable: false, recurring: false,
  });

  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({
    queryKey: ["host-vehicles", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: recurringExpenses = [] } = useQuery({
    queryKey: ["host-recurring-expenses", host?.id],
    queryFn: () => base44.entities.RecurringExpense.filter({ host_id: host.id }, "-created_date", 200),
    enabled: !!host?.id,
  });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["host-expenses", host?.id],
    queryFn: () => base44.entities.HostExpense.filter({ host_id: host.id }, "-date", 500),
    enabled: !!host?.id,
  });

  const { data: paymentLogs = [] } = useQuery({
    queryKey: ["host-payments-exp", host?.id, vehicles.map(v => v.id).join(",")],
    queryFn: async () => {
      const results = [];
      if (host?.id) { try { const r = await base44.entities.PaymentLog.filter({ host_id: host.id }, "-paid_at", 200); results.push(...r); } catch (_) {} }
      if (vehicles.length > 0) {
        const perV = await Promise.all(vehicles.slice(0, 15).map(v => base44.entities.PaymentLog.filter({ vehicle_id: v.id }, "-paid_at", 50).catch(() => [])));
        results.push(...perV.flat());
      }
      const seen = new Set();
      return results.filter(l => { if (seen.has(l.id)) return false; seen.add(l.id); return true; });
    },
    enabled: !!host?.id,
  });

  const { data: maintenanceLogs = [] } = useQuery({
    queryKey: ["host-maint-exp", host?.id],
    queryFn: () => base44.entities.HostMaintenanceLog.filter({ host_id: host.id }, "-date", 200),
    enabled: !!host?.id,
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ["host-payouts-exp", host?.id],
    queryFn: () => base44.entities.HostPayout.filter({ host_id: host.id }, "-created_date", 200),
    enabled: !!host?.id,
  });

  const vehicleMap = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v])), [vehicles]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadFile(file);
    setF("receipt_url", res.file_url);
    setUploading(false);
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const exp = await base44.entities.HostExpense.create(data);
      base44.entities.ActivityEvent.create({
        event_type: "maintenance.logged",
        actor_email: user.email,
        actor_role: "host",
        target_entity: "HostExpense",
        target_id: exp.id,
        target_label: data.vehicle_name || "Fleet",
        host_id: host.id,
        vehicle_id: data.vehicle_id || undefined,
        summary: "Expense logged: " + data.expense_type + " $" + data.amount + (data.vehicle_name ? " \u2014 " + data.vehicle_name : ""),
        source: "host_portal",
        event_status: "success",
      }).catch(() => {});
      return exp;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["host-expenses"] });
      setShowForm(false);
      setForm({ vehicle_id: "", expense_type: "fuel", amount: "", date: format(new Date(), "yyyy-MM-dd"), description: "", receipt_url: "", reimbursable: false, recurring: false });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.HostExpense.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-expenses"] }),
  });

  const createRecurringMutation = useMutation({
    mutationFn: async (data) => {
      const rec = await base44.entities.RecurringExpense.create(data);
      base44.entities.ActivityEvent.create({
        event_type: "maintenance.logged",
        actor_email: user.email, actor_role: "host",
        target_entity: "RecurringExpense", target_id: rec.id,
        target_label: data.vehicle_name || "Fleet",
        host_id: host.id, vehicle_id: data.vehicle_id || undefined,
        summary: "Recurring expense: " + data.category + " $" + data.amount + "/" + data.frequency,
        source: "host_portal", event_status: "success",
      }).catch(() => {});
      return rec;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-recurring-expenses"] }),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const vehicle = vehicles.find(v => v.id === form.vehicle_id);
    createMutation.mutate({
      ...form,
      host_id: host.id,
      amount: Number(form.amount),
      vehicle_name: vehicle ? vehicle.year + " " + vehicle.make + " " + vehicle.model : "",
      tax_deductible: TAX_DEDUCTIBLE_TYPES.has(form.expense_type),
    });
  };

  const enrichedExpenses = useMemo(() =>
    expenses.map(e => ({
      ...e,
      tax_deductible: e.tax_deductible ?? TAX_DEDUCTIBLE_TYPES.has(e.expense_type),
    })),
    [expenses]
  );

  const kpis = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const totalExpenses = enrichedExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const monthlyExpenses = enrichedExpenses
      .filter(e => e.date && isWithinInterval(new Date(e.date), { start: monthStart, end: monthEnd }))
      .reduce((s, e) => s + (e.amount || 0), 0);
    const totalRevenue = paymentLogs.filter(p => p.status === "paid").reduce((s, p) => s + (p.amount || 0), 0);
    const maintCost = maintenanceLogs.reduce((s, m) => s + (m.cost || 0), 0);
    const totalCosts = totalExpenses + maintCost;
    const netProfit = totalRevenue - totalCosts;
    const vehicleIds = new Set(enrichedExpenses.map(e => e.vehicle_id).filter(Boolean));
    const avgPerVehicle = vehicleIds.size > 0 ? totalExpenses / vehicleIds.size : 0;
    const reimbursableTotal = enrichedExpenses.filter(e => e.reimbursable).reduce((s, e) => s + (e.amount || 0), 0);
    const taxDeductibleTotal = enrichedExpenses.filter(e => e.tax_deductible).reduce((s, e) => s + (e.amount || 0), 0);
    const byCostMap = {};
    enrichedExpenses.forEach(e => {
      if (e.vehicle_name) byCostMap[e.vehicle_name] = (byCostMap[e.vehicle_name] || 0) + (e.amount || 0);
    });
    const topVehicle = Object.entries(byCostMap).sort((a, b) => b[1] - a[1])[0];
    return { totalExpenses, monthlyExpenses, netProfit, avgPerVehicle, reimbursableTotal, taxDeductibleTotal, topVehicle };
  }, [enrichedExpenses, paymentLogs, maintenanceLogs]);

  const filtered = useMemo(() => {
    return enrichedExpenses.filter(e => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (
          !(e.vehicle_name || "").toLowerCase().includes(q) &&
          !(e.description || "").toLowerCase().includes(q) &&
          !(e.expense_type || "").toLowerCase().includes(q)
        ) return false;
      }
      if (filters.vehicleId && e.vehicle_id !== filters.vehicleId) return false;
      if (filters.expenseType && e.expense_type !== filters.expenseType) return false;
      if (filters.dateRange) {
        const range = getDateRange(filters.dateRange);
        if (range && e.date) {
          if (!isWithinInterval(new Date(e.date), { start: range.start, end: range.end })) return false;
        }
      }
      if (!matchesCostRange(e.amount, filters.costRange)) return false;
      if (filters.reimbursable === "yes" && !e.reimbursable) return false;
      if (filters.reimbursable === "no" && e.reimbursable) return false;
      return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [enrichedExpenses, filters]);

  const byCategory = useMemo(() => {
    const map = {};
    filtered.forEach(e => { map[e.expense_type] = (map[e.expense_type] || 0) + (e.amount || 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([type, total]) => ({
      type, total, label: EXPENSE_TYPES.find(t => t.value === type)?.label || type, color: TYPE_COLORS[type] || "#6b7280",
    }));
  }, [filtered]);

  const handleExport = () => {
    const rows = [
      ["Vehicle", "Expense Type", "Amount", "Date", "Description", "Tax Deductible", "Reimbursable", "Recurring"],
      ...filtered.map(e => [
        e.vehicle_name || "", EXPENSE_TYPES.find(t => t.value === e.expense_type)?.label || e.expense_type || "",
        e.amount || "", e.date || "", (e.description || "").replace(/"/g, '""'),
        e.tax_deductible ? "Yes" : "No", e.reimbursable ? "Yes" : "No", e.recurring ? "Yes" : "No",
      ]),
    ];
    exportCSV(rows, "expenses-" + new Date().toISOString().split("T")[0] + ".csv");
  };

  const handleExportTax = () => {
    const taxItems = filtered.filter(e => e.tax_deductible);
    const rows = [
      ["Vehicle", "Category", "Amount", "Date", "Description"],
      ...taxItems.map(e => [e.vehicle_name || "Fleet", EXPENSE_TYPES.find(t => t.value === e.expense_type)?.label || e.expense_type, e.amount || "", e.date || "", e.description || ""]),
    ];
    exportCSV(rows, "tax-summary-" + new Date().toISOString().split("T")[0] + ".csv");
  };

  function exportCSV(rows, filename) {
    const csv = rows.map(r => r.map(v => '"' + v + '"').join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const vehicleLabel = (v) => v.year + " " + v.make + " " + v.model + (v.plate ? " \u00b7 " + v.plate : "");

  const dueSoonRecurring = recurringExpenses.filter(r => {
    if (r.status !== "active" || !r.next_due_date) return false;
    return differenceInDays(new Date(r.next_due_date), new Date()) <= 7;
  });

  const CAT_LABELS = { insurance: "Insurance", gps_subscription: "GPS", loan_payment: "Loan", storage_parking: "Storage", software_tools: "Software", service_contract: "Contract", registration: "Registration", fuel: "Fuel", cleaning: "Cleaning", other: "Other" };

  return (
    <div className="space-y-5">
      <HostPageHeader
        title="Expenses"
        subtitle="Fleet financial intelligence \u00b7 costs, profitability & insights"
        action={
          <div className="flex gap-2">
            <button onClick={() => setShowRecurringForm(true)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-2xl text-xs font-bold text-gray-600 bg-white border border-gray-200 shadow-sm hover:bg-gray-50">
              <RefreshCw className="h-3.5 w-3.5 text-blue-500" /> Recurring
            </button>
            <button onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white shadow-lg"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              <Plus className="h-4 w-4" /> Add Expense
            </button>
          </div>
        }
      />

      {/* KPI CARDS */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <KpiCard value={"$" + Math.round(kpis.totalExpenses).toLocaleString()} label="Total Expenses" color="text-red-500" bg="bg-white border-gray-100" />
        <KpiCard value={"$" + Math.round(kpis.monthlyExpenses).toLocaleString()} label="This Month" color="text-orange-500" bg="bg-orange-50 border-orange-200" />
        <KpiCard value={kpis.netProfit >= 0 ? "+$" + Math.round(kpis.netProfit).toLocaleString() : "-$" + Math.round(Math.abs(kpis.netProfit)).toLocaleString()}
          label="Net Profit" color={kpis.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}
          bg={kpis.netProfit >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"} />
        <KpiCard value={"$" + Math.round(kpis.avgPerVehicle).toLocaleString()} label="Avg/Vehicle" color="text-gray-700" bg="bg-white border-gray-100" />
        <KpiCard value={"$" + Math.round(kpis.reimbursableTotal).toLocaleString()} label="Reimbursable"
          color={kpis.reimbursableTotal > 0 ? "text-yellow-600" : "text-gray-400"}
          bg={kpis.reimbursableTotal > 0 ? "bg-yellow-50 border-yellow-200" : "bg-white border-gray-100"} />
        <KpiCard value={"$" + Math.round(kpis.taxDeductibleTotal).toLocaleString()} label="Tax Deductible" color="text-purple-600" bg="bg-purple-50 border-purple-200" />
      </div>

      {/* SMART INSIGHTS + ALERTS */}
      <ExpenseInsights
        expenses={enrichedExpenses}
        vehicles={vehicles}
        maintenanceLogs={maintenanceLogs}
        paymentLogs={paymentLogs}
      />

      {/* RECURRING DUE SOON ALERTS */}
      {dueSoonRecurring.length > 0 && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="h-4 w-4 text-orange-500" />
            <p className="text-xs font-bold text-orange-800 uppercase tracking-wider">Recurring Expenses Due Soon</p>
          </div>
          <div className="space-y-1">
            {dueSoonRecurring.map(r => {
              const days = differenceInDays(new Date(r.next_due_date), new Date());
              return (
                <p key={r.id} className="text-xs text-orange-700">
                  {days < 0 ? "OVERDUE" : "Due in " + days + "d"}: {CAT_LABELS[r.category] || r.category} {"\u2014"} ${(r.amount || 0).toLocaleString()} ({r.vehicle_name || "Fleet"})
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* RECURRING EXPENSES SECTION */}
      <RecurringExpenseSection recurringExpenses={recurringExpenses} vehicles={vehicles} hostId={host?.id} user={user} />

      {/* ADD EXPENSE FORM */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-pink-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 text-sm">New Expense</h3>
            <button type="button" onClick={() => setShowForm(false)}><X className="h-4 w-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Vehicle</label>
              <select className={inputClass} value={form.vehicle_id} onChange={e => setF("vehicle_id", e.target.value)}>
                <option value="">Fleet / General</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{vehicleLabel(v)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Expense Type</label>
              <select className={inputClass} value={form.expense_type} onChange={e => setF("expense_type", e.target.value)}>
                {EXPENSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Amount ($) *</label>
              <input className={inputClass} type="number" step="0.01" required value={form.amount} onChange={e => setF("amount", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Date *</label>
              <input className={inputClass} type="date" required value={form.date} onChange={e => setF("date", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Description / Vendor</label>
            <input className={inputClass} value={form.description} onChange={e => setF("description", e.target.value)} placeholder="Vendor name or notes…" />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700">
              <input type="checkbox" checked={form.reimbursable} onChange={e => setF("reimbursable", e.target.checked)} className="rounded border-gray-300 text-pink-500" />
              Reimbursable
            </label>
          </div>
          <div className="flex items-center justify-between">
            <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {form.receipt_url ? "Receipt \u2713" : "Upload Receipt"}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 bg-gray-100">Cancel</button>
              <button type="submit" disabled={createMutation.isPending} className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                {createMutation.isPending ? "Saving\u2026" : "Add Expense"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* FLEET PROFITABILITY */}
      <FleetProfitability
        vehicles={vehicles}
        expenses={enrichedExpenses}
        paymentLogs={paymentLogs}
        maintenanceLogs={maintenanceLogs}
        payouts={payouts}
      />

      {/* FILTERS */}
      <ExpenseFilters
        filters={filters}
        onChange={setFilters}
        vehicles={vehicles}
        resultCount={filtered.length}
        onExport={handleExport}
        onExportTax={handleExportTax}
      />

      {/* CATEGORY BREAKDOWN */}
      {byCategory.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">By Category</p>
          <div className="space-y-2">
            {byCategory.map(c => {
              const totalFiltered = filtered.reduce((s, e) => s + (e.amount || 0), 0);
              const pct = totalFiltered > 0 ? (c.total / totalFiltered) * 100 : 0;
              return (
                <div key={c.type} className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-gray-600">{c.label}</span>
                      <span className="text-xs font-bold text-gray-900">${c.total.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100">
                      <div className="h-full rounded-full" style={{ width: pct + "%", background: c.color }} />
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* EXPENSE LIST */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-sm">Expense Records</h3>
          <p className="text-xs text-gray-400">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</p>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Receipt className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">
              {expenses.length === 0
                ? "No expenses recorded yet. Add your first expense to track fleet costs."
                : "No expenses match these filters."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(e => {
              const color = TYPE_COLORS[e.expense_type] || "#6b7280";
              const typeLabel = EXPENSE_TYPES.find(t => t.value === e.expense_type)?.label || e.expense_type;
              const isHighCost = (e.amount || 0) >= 500;
              return (
                <button key={e.id} onClick={() => setSelectedExpense(e)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors text-left">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + "18" }}>
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{typeLabel}</p>
                      {e.tax_deductible && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-100">TAX</span>}
                      {e.reimbursable && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-600 border border-yellow-100">REIMB</span>}
                      {e.recurring && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">REC</span>}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{e.vehicle_name || "Fleet"} {"\u00b7"} {e.date}{e.description ? " \u00b7 " + e.description : ""}</p>
                  </div>
                  {e.receipt_url && <Receipt className="h-3.5 w-3.5 text-pink-400 flex-shrink-0" />}
                  <p className={"text-sm font-bold flex-shrink-0 " + (isHighCost ? "text-red-600" : e.reimbursable ? "text-yellow-600" : "text-gray-700")}>
                    ${(e.amount || 0).toLocaleString()}
                  </p>
                  <button onClick={(ev) => { ev.stopPropagation(); deleteMutation.mutate(e.id); }}
                    className="p-1 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 flex-shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* RECURRING EXPENSE FORM MODAL */}
      {showRecurringForm && (
        <RecurringExpenseForm
          vehicles={vehicles}
          hostId={host?.id}
          onSave={async (data) => { await createRecurringMutation.mutateAsync(data); setShowRecurringForm(false); }}
          onClose={() => setShowRecurringForm(false)}
        />
      )}

      {/* DETAIL DRAWER */}
      {selectedExpense && (
        <ExpenseDrawer
          expense={selectedExpense}
          vehicle={vehicleMap[selectedExpense.vehicle_id] || null}
          onClose={() => setSelectedExpense(null)}
        />
      )}
    </div>
  );
}

function KpiCard({ value, label, color, bg }) {
  return (
    <div className={"rounded-3xl border shadow-sm p-3 text-center " + bg}>
      <p className={"text-lg font-black " + color} style={{ fontFamily: "var(--font-syne)" }}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{label}</p>
    </div>
  );
}