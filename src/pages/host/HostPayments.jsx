import React, { useState } from "react";

function ExpandablePaymentRow({ b, cfg, Icon }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setExpanded(e => !e)}>
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${cfg.cls}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{b.customer_full_name}</p>
          <p className={`text-xs text-gray-400 ${expanded ? "" : "truncate"}`}>
            {b.vehicle_name}
            {b.next_billing_date ? ` · Next: ${format(new Date(b.next_billing_date), "MMM d, yyyy")}` : ""}
            {b.billing_week_number ? ` · Week ${b.billing_week_number}` : ""}
          </p>
          {b.payment_failure_reason && (
            <p className={`text-xs text-red-500 mt-0.5 ${expanded ? "" : "truncate"}`}>⚠ {b.payment_failure_reason}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-gray-900">${(b.weekly_rate || 0).toLocaleString()}<span className="text-xs text-gray-400 font-normal">/wk</span></p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 ml-13 pl-1 space-y-1 text-xs text-gray-500 border-t border-gray-100 pt-3">
          {b.user_email && <p><span className="font-semibold text-gray-700">Email:</span> {b.user_email}</p>}
          {b.customer_phone && <p><span className="font-semibold text-gray-700">Phone:</span> {b.customer_phone}</p>}
          {b.start_date && <p><span className="font-semibold text-gray-700">Start Date:</span> {format(new Date(b.start_date), "MMM d, yyyy")}</p>}
          {b.next_billing_date && <p><span className="font-semibold text-gray-700">Next Billing:</span> {format(new Date(b.next_billing_date), "MMM d, yyyy")}</p>}
          {b.billing_week_number && <p><span className="font-semibold text-gray-700">Week:</span> {b.billing_week_number}</p>}
          {b.booking_type && <p><span className="font-semibold text-gray-700">Booking Type:</span> {b.booking_type}</p>}
          {b.payment_failure_reason && <p className="text-red-500"><span className="font-semibold">Failure Reason:</span> {b.payment_failure_reason}</p>}
          {b.notes && <p><span className="font-semibold text-gray-700">Notes:</span> {b.notes}</p>}
          {b.admin_notes && <p><span className="font-semibold text-gray-700">Admin Notes:</span> {b.admin_notes}</p>}
        </div>
      )}
    </div>
  );
}
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { DollarSign, AlertTriangle, CheckCircle2, Clock, XCircle, Search, UserCheck, X } from "lucide-react";
import HostPageHeader from "@/components/host/HostPageHeader";
import HostPaymentHistory from "@/pages/host/HostPaymentHistory";
import PaymentOperationalAlertPanel from "@/components/payments/PaymentOperationalAlertPanel";
import { format } from "date-fns";
import { Plus, Banknote } from "lucide-react";
import PaymentFormDialog from "@/components/payments/PaymentFormDialog";
import { toast } from "sonner";

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
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [activeTab, setActiveTab] = useState("overview");
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const recordPaymentMutation = useMutation({
    mutationFn: async (data) => {
      const b = bookings.find(x => x.id === data.booking_id);
      if (!b) throw new Error("Please select a booking to record payment against.");
      await base44.entities.PaymentLog.create({
        host_id: host?.id,
        customer_email: b.user_email || "manual@payment",
        customer_name: data.customer_name || b.customer_full_name,
        booking_request_id: data.booking_id,
        week_number: b.billing_week_number || 1,
        vehicle_id: b.vehicle_id,
        vehicle_name: b.vehicle_name,
        amount: data.amount,
        payment_method: data.payment_method.toLowerCase(),
        status: data.status.toLowerCase(),
        paid_at: data.paid_date ? new Date(data.paid_date).toISOString() : new Date().toISOString(),
        source_type: "admin_manual"
      });
    },
    onSuccess: () => {
      qc.invalidateQueries();
      setShowPaymentForm(false);
      toast.success("Payment recorded successfully");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to record payment");
    }
  });

  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({
    queryKey: ["host-vehicles-payments", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const vehicleIds = new Set(vehicles.map(v => v.id));

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["host-payments-bookings", host?.id, vehicles.length],
    queryFn: async () => {
      if (vehicles.length === 0) return [];
      const all = await base44.entities.BookingRequest.list("-created_date", 200);
      return all.filter(b => vehicleIds.has(b.vehicle_id));
    },
    enabled: !!host?.id && vehicles.length >= 0,
  });

  const approveMutation = useMutation({
    mutationFn: async (booking) => {
      await base44.entities.BookingRequest.update(booking.id, {
        booking_status: "confirmed",
        review_status: "approved",
        reviewed_at: new Date().toISOString(),
      });
      // Mark vehicle as Booked
      await base44.entities.Vehicle.update(booking.vehicle_id, { status: "Booked" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-payments-bookings"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (booking) => {
      await base44.entities.BookingRequest.update(booking.id, {
        booking_status: "rejected",
        review_status: "rejected",
        reviewed_at: new Date().toISOString(),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-payments-bookings"] }),
  });

  // Pending bookings awaiting host approval
  const pendingBookings = bookings.filter(b =>
    b.booking_status === "pending_review" && b.customer_full_name
  );

  // Only show bookings with meaningful payment info
  const paymentBookings = bookings.filter(b =>
    !["draft", "cancelled", "pending_review", "rejected"].includes(b.booking_status) && b.customer_full_name
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
      <div className="flex items-start justify-between">
        <HostPageHeader
          title="Payments"
          subtitle="Payment status across all your active rentals"
        />
        <button
          onClick={() => setShowPaymentForm(true)}
          className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          <Banknote className="h-4 w-4" />
          Record Payment
        </button>
      </div>

      <PaymentFormDialog 
        open={showPaymentForm} 
        onOpenChange={setShowPaymentForm}
        onSave={(data) => recordPaymentMutation.mutate(data)}
        isSaving={recordPaymentMutation.isPending}
      />

      <PaymentOperationalAlertPanel scope="host" hostId={host?.id} limit={3} />

      <div className="flex gap-2 rounded-2xl bg-white border border-gray-100 p-1 shadow-sm">
        {[
          { id: "overview", label: "Overview" },
          { id: "history", label: "History" },
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
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Collected", value: `$${totalCollected.toLocaleString()}`, color: "text-emerald-600", bg: "bg-emerald-50", icon: DollarSign, filterKey: "Paid" },
          { label: "Active Rentals", value: totalActive, color: "text-blue-600", bg: "bg-blue-50", icon: CheckCircle2, filterKey: "All" },
          { label: "Overdue", value: totalOverdue, color: "text-red-600", bg: "bg-red-50", icon: AlertTriangle, filterKey: "Overdue" },
          { label: "Failed Payments", value: totalFailed, color: "text-orange-600", bg: "bg-orange-50", icon: XCircle, filterKey: "Failed" },
        ].map(s => {
          const isActive = filter === s.filterKey;
          return (
            <button key={s.label} onClick={() => setFilter(s.filterKey)}
              className="text-left bg-white rounded-3xl border shadow-sm p-4 transition-all hover:shadow-md active:scale-[0.97]"
              style={{ borderColor: isActive ? "hsl(338 90% 56% / 0.4)" : "#f3f4f6", boxShadow: isActive ? "0 0 0 2px hsl(338 90% 56% / 0.15)" : undefined }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{s.label}</p>
                <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${s.bg}`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
              </div>
              <p className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>{s.value}</p>
            </button>
          );
        })}
      </div>

      {/* Pending Approvals */}
      {pendingBookings.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-amber-100" style={{ background: "linear-gradient(135deg, #fffbeb, #fef3c7)" }}>
            <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <UserCheck className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">{pendingBookings.length} Pending Approval{pendingBookings.length > 1 ? "s" : ""}</p>
              <p className="text-xs text-amber-600">Review and approve or reject these booking requests</p>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingBookings.map(b => (
              <div key={b.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{b.customer_full_name}</p>
                    <p className="text-xs text-gray-400">{b.vehicle_name} · {b.booking_type}</p>
                    <p className="text-xs text-gray-400">{b.user_email}</p>
                    {b.start_date && <p className="text-xs text-gray-400">Start: {format(new Date(b.start_date), "MMM d, yyyy")}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-black text-gray-900">${(b.weekly_rate || 0).toLocaleString()}<span className="text-xs text-gray-400 font-normal">/wk</span></p>
                    <p className="text-xs text-gray-400">Week 1 paid ✓</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approveMutation.mutate(b)}
                    disabled={approveMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, hsl(152 60% 46%), hsl(199 90% 54%))" }}>
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </button>
                  <button
                    onClick={() => rejectMutation.mutate(b)}
                    disabled={rejectMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition-all disabled:opacity-50">
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                <ExpandablePaymentRow key={b.id} b={b} cfg={cfg} Icon={Icon} />
              );
            })}
          </div>
        )}
      </div>
      </> : <HostPaymentHistory />}
    </div>
  );
}