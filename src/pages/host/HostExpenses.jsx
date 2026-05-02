import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Plus, Receipt, Loader2, Upload, Trash2 } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { format, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

const EXPENSE_TYPES = ["fuel", "insurance", "repair", "cleaning", "registration", "toll", "parking", "other"];
const TYPE_COLORS = { fuel: "#f59e0b", insurance: "#3b82f6", repair: "#ef4444", cleaning: "#10b981", registration: "#8b5cf6", toll: "#f97316", parking: "#06b6d4", other: "#6b7280" };
const inputClass = "w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400 text-sm";

export default function HostExpenses() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ vehicle_id: "", expense_type: "fuel", amount: "", date: format(new Date(), "yyyy-MM-dd"), description: "", receipt_url: "", reimbursable: false });

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({ queryKey: ["host-vehicles", host?.id], queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: expenses = [], isLoading } = useQuery({ queryKey: ["host-expenses", host?.id], queryFn: () => base44.entities.HostExpense.filter({ host_id: host.id }), enabled: !!host?.id });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.HostExpense.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["host-expenses"] }); setShowForm(false); setForm({ vehicle_id: "", expense_type: "fuel", amount: "", date: format(new Date(), "yyyy-MM-dd"), description: "", receipt_url: "", reimbursable: false }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.HostExpense.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-expenses"] }),
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const res = await base44.integrations.Core.UploadFile({ file });
    set("receipt_url", res.file_url);
    setUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const vehicle = vehicles.find(v => v.id === form.vehicle_id);
    createMutation.mutate({ ...form, host_id: host.id, amount: Number(form.amount), vehicle_name: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "" });
  };

  const now = new Date();
  const thisMonthExpenses = expenses.filter(e => {
    if (!e.date) return false;
    return isWithinInterval(new Date(e.date), { start: startOfMonth(now), end: endOfMonth(now) });
  });

  const totalThisMonth = thisMonthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalAllTime = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  const byCategory = EXPENSE_TYPES.map(t => ({
    name: t.charAt(0).toUpperCase() + t.slice(1),
    value: expenses.filter(e => e.expense_type === t).reduce((s, e) => s + (e.amount || 0), 0),
    color: TYPE_COLORS[t],
  })).filter(d => d.value > 0);

  const sorted = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>Expenses</h1>
          <p className="text-gray-400 text-sm mt-1">Track and categorize all fleet costs</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          <Plus className="h-4 w-4" /> Add Expense
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">This Month</p>
          <p className="text-2xl font-black text-red-500" style={{ fontFamily: "var(--font-syne)" }}>${totalThisMonth.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">All Time</p>
          <p className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>${totalAllTime.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Chart */}
        {byCategory.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 text-sm mb-4">By Category</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={byCategory} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value">
                  {byCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(val) => [`$${val.toLocaleString()}`, ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-3">
              {byCategory.map(c => (
                <div key={c.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="text-gray-600">{c.name}</span>
                  </div>
                  <span className="font-semibold text-gray-900">${c.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* List */}
        <div className={`${byCategory.length > 0 ? "lg:col-span-2" : "lg:col-span-3"}`}>
          {showForm && (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-pink-200 shadow-sm p-5 mb-4 space-y-3">
              <h3 className="font-bold text-gray-900 text-sm">New Expense</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Vehicle</label>
                  <select className={inputClass} value={form.vehicle_id} onChange={e => set("vehicle_id", e.target.value)}>
                    <option value="">All vehicles</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
                  <select className={inputClass} value={form.expense_type} onChange={e => set("expense_type", e.target.value)}>
                    {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Amount ($)</label>
                  <input className={inputClass} type="number" required value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
                  <input className={inputClass} type="date" required value={form.date} onChange={e => set("date", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                <input className={inputClass} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Optional notes..." />
              </div>
              <div className="flex items-center justify-between">
                <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {form.receipt_url ? "Receipt uploaded ✓" : "Upload Receipt"}
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} />
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 bg-gray-100">Cancel</button>
                  <button type="submit" disabled={createMutation.isPending} className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                    {createMutation.isPending ? "Saving…" : "Add Expense"}
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {isLoading ? <div className="p-5 space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}</div>
            : sorted.length === 0 ? (
              <div className="text-center py-16"><Receipt className="h-8 w-8 text-gray-300 mx-auto mb-3" /><p className="text-gray-400 text-sm">No expenses recorded yet</p></div>
            ) : (
              <div className="divide-y divide-gray-50">
                {sorted.map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-4">
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${TYPE_COLORS[e.expense_type]}20` }}>
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[e.expense_type] }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 capitalize">{e.expense_type}</p>
                      <p className="text-xs text-gray-400 truncate">{e.vehicle_name || "Fleet"} · {e.date}</p>
                    </div>
                    {e.description && <p className="text-xs text-gray-400 truncate max-w-[120px] hidden md:block">{e.description}</p>}
                    {e.receipt_url && <a href={e.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-pink-500 font-semibold flex-shrink-0">View</a>}
                    <p className="text-sm font-bold text-red-500 flex-shrink-0">${(e.amount || 0).toLocaleString()}</p>
                    <button onClick={() => deleteMutation.mutate(e.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 flex-shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}