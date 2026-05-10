import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { DollarSign, AlertTriangle, CheckCircle2, Clock, XCircle, Search } from "lucide-react";
import HostPageHeader from "@/components/host/HostPageHeader";
import { format } from "date-fns";

const PAYMENT_STATUS_CONFIG = {
  paid: { label: "Paid", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  pending: { label: "Pending", cls: "bg-blue-50 text-blue-700", icon: Clock },
  unpaid: { label: "Unpaid", cls: "bg-gray-50 text-gray-500", icon: Clock },
  failed: { label: "Failed", cls: "bg-red-50 text-red-600", icon: XCircle },
  overdue: { label: "Overdue", cls: "bg-red-50 text-red-600", icon: AlertTriangle },
  due_soon: { label: "Due Soon", cls: "bg-yellow-50 text-yellow-700", icon: AlertTriangle },
  refunded: { label: "Refunded", cls: "bg-purple-50 text-purple-600", icon: DollarSign },
};

const FILTERS = ["All", "Paid", "Overdue", "Failed", "Pending", "Due Soon"];

export default function HostPayments() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["host-payments-bookings", host?.id],
    queryFn: () => base44.entities.BookingRequest.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  // Only show bookings with meaningful payment info
  const paymentBookings = bookings.filter(b =>
    !["draft", "cancelled"].includes(b.booking_status) && b.customer_full_name
  );

  const filtered = paymentBookings.filter(b => {
    const matchesFilter = filter === "All" || b.payment_status === filter.toLowerCase().replace(" ", "_");
    const matchesSearch = !search ||
      b.customer_full_name?.toLowerCase().includes(search.toLowerCase()) ||
      b.vehicle_name?.toLowerCase().includes(search.toLowerCase()) ||
      b.user_email?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Summary stats
  const totalCollected = paymentBookings
    .filter(b => b.payment_status === "paid")
    .reduce((s, b) => s + (b.weekly_rate || 0), 0);
  const totalOverdue = paymentBookings.filter(b => b.payment_status === "overdue").length;
  const totalFailed = paymentBookings.filter(b => b.payment_status === "failed").length;
  const totalActive = paymentBookings.filter(b => ["active", "confirmed"].includes(b.booking_status)).length;

  return (
    <div className="space-y-5">
      <HostPageHeader
        title="Payments"
        subtitle="Payment status across all your active rentals"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Collected", value: `$${totalCollected.toLocaleString()}`, color: "text-emerald-600", bg: "bg-emerald-50", icon: DollarSign },
          { label: "Active Rentals", value: totalActive, color: "text-blue-600", bg: "bg-blue-50", icon: CheckCircle2 },
          { label: "Overdue", value: totalOverdue, color: "text-red-600", bg: "bg-red-50", icon: AlertTriangle },
          { label: "Failed Payments", value: totalFailed, color: "text-orange-600", bg: "bg-orange-50", icon: XCircle },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{s.label}</p>
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${s.bg}`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
            </div>
            <p className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters + Search */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400"
            placeholder="Search by customer, vehicle…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition-all"
              style={{
                background: filter === f ? "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" : "#fff",
                borderColor: filter === f ? "transparent" : "#e5e7eb",
                color: filter === f ? "white" : "#6b7280",
              }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Payment list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <DollarSign className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No payments found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(b => {
              const cfg = PAYMENT_STATUS_CONFIG[b.payment_status] || PAYMENT_STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              return (
                <div key={b.id} className="flex items-center gap-3 px-5 py-4">
                  <div className={`h-10 w-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${cfg.cls}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{b.customer_full_name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {b.vehicle_name}
                      {b.next_billing_date ? ` · Next: ${format(new Date(b.next_billing_date), "MMM d")}` : ""}
                      {b.billing_week_number ? ` · Week ${b.billing_week_number}` : ""}
                    </p>
                    {b.payment_failure_reason && (
                      <p className="text-xs text-red-500 mt-0.5 truncate">⚠ {b.payment_failure_reason}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">${(b.weekly_rate || 0).toLocaleString()}<span className="text-xs text-gray-400 font-normal">/wk</span></p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}