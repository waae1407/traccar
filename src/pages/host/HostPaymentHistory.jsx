import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { format } from "date-fns";
import { DollarSign, Search, TrendingUp, CreditCard, Banknote, AlertCircle } from "lucide-react";
import HostPageHeader from "@/components/host/HostPageHeader";

const METHOD_STYLE = {
  stripe: "bg-blue-50 text-blue-700",
  zelle: "bg-purple-50 text-purple-700",
  cash: "bg-green-50 text-green-700",
  cashapp: "bg-emerald-50 text-emerald-700",
  venmo: "bg-cyan-50 text-cyan-700",
  check: "bg-yellow-50 text-yellow-700",
  other: "bg-gray-50 text-gray-500",
};

export default function HostPaymentHistory() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["host-payment-logs", host?.id],
    queryFn: () => base44.entities.PaymentLog.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const filtered = logs.filter(l => {
    if (search) {
      const q = search.toLowerCase();
      if (!`${l.customer_name} ${l.customer_email} ${l.vehicle_name}`.toLowerCase().includes(q)) return false;
    }
    if (methodFilter !== "all" && l.payment_method !== methodFilter) return false;
    if (dateFrom && new Date(l.paid_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(l.paid_at) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  }).sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at));

  const totalCollected = filtered.filter(l => l.status === "paid").reduce((s, l) => s + (l.amount || 0), 0);
  const stripeCount = filtered.filter(l => l.payment_method === "stripe").length;
  const manualCount = filtered.filter(l => l.payment_method !== "stripe").length;

  const METHODS = ["all", "stripe", "zelle", "cash", "cashapp", "venmo", "check", "other"];

  return (
    <div className="space-y-5">
      <HostPageHeader title="Payment History" subtitle="Full payment log for your customers" />

      {/* Scorecards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Collected", value: `$${totalCollected.toLocaleString()}`, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Stripe Payments", value: stripeCount, icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Manual Payments", value: manualCount, icon: Banknote, color: "text-purple-600", bg: "bg-purple-50" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
            <div className={`h-8 w-8 rounded-xl flex items-center justify-center mx-auto mb-2 ${s.bg}`}>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <p className="text-lg font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>{s.value}</p>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:border-pink-400"
            placeholder="Search customer or vehicle…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-pink-400" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm text-gray-700 focus:outline-none focus:border-pink-400" />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {METHODS.map(m => (
            <button key={m} onClick={() => setMethodFilter(m)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all capitalize"
              style={{
                background: methodFilter === m ? "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" : "#fff",
                borderColor: methodFilter === m ? "transparent" : "#e5e7eb",
                color: methodFilter === m ? "white" : "#6b7280",
              }}>
              {m === "all" ? "All Methods" : m}
            </button>
          ))}
        </div>
      </div>

      {/* Log table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14">
            <DollarSign className="h-7 w-7 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">No payment history found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(log => (
              <div key={log.id} className="px-4 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{log.customer_name}</p>
                  <p className="text-xs text-gray-400 truncate">{log.vehicle_name} · Week {log.week_number}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${METHOD_STYLE[log.payment_method] || METHOD_STYLE.other}`}>
                    {log.payment_method}
                  </span>
                  <span className="text-sm font-bold text-gray-900">${(log.amount || 0).toLocaleString()}</span>
                </div>
                <div className="text-right flex-shrink-0 hidden sm:block">
                  <p className="text-xs text-gray-400">{log.paid_at ? format(new Date(log.paid_at), "MMM d, yyyy") : "—"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}