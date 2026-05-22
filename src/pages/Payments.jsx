import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/useTenant";
import { DollarSign, ExternalLink, AlertTriangle, Plus, TrendingUp, CreditCard, Banknote, XCircle, CalendarClock, History, RefreshCw } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { toast } from "sonner";
import PaymentHistoryDrawer from "@/components/payments/PaymentHistoryDrawer";
import { OperationalPageHeader } from "@/components/admin/operational";
import { generatePaymentDedupeKey, classifyPaymentSource, classifyPaymentConfidence, normalizePaymentMethod } from "@/lib/financial/paymentLedger";

const PAYMENT_STATUS_STYLE = {
  paid:     "bg-green-500/15 text-green-400 border-green-500/25",
  failed:   "bg-red-500/15 text-red-400 border-red-500/25",
  overdue:  "bg-red-500/15 text-red-400 border-red-500/25",
  due_soon: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  pending:  "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  refunded: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  unpaid:   "bg-white/5 text-white/35 border-white/10",
};

function ActionModal({ booking, onClose, onSuccess }) {
  const [action, setAction] = useState(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const MANUAL_PAYMENT_METHODS = ["Zelle", "Cash", "CashApp", "Venmo", "Check", "Other"];
  const [manualMethod, setManualMethod] = useState("Zelle");
  const { data: bookingVehicles = [] } = useQuery({
    queryKey: ["payment-action-vehicle", booking?.vehicle_id],
    queryFn: () => base44.entities.Vehicle.filter({ id: booking.vehicle_id }),
    enabled: !!booking?.vehicle_id,
  });
  const resolvedHostId = booking.host_id || bookingVehicles[0]?.host_id || "";

  const handleManualPaid = async () => {
    setLoading(true);
    const nextWeek = booking.billing_week_number ? booking.billing_week_number + 1 : 2;
    const nextBillingDate = new Date(booking.next_billing_date || new Date());
    nextBillingDate.setDate(nextBillingDate.getDate() + 7);
    const nextBillingStr = nextBillingDate.toISOString().split("T")[0];
    await base44.entities.BookingRequest.update(booking.id, {
      payment_status: "paid",
      billing_week_number: nextWeek,
      next_billing_date: nextBillingStr,
      payment_failure_reason: "",
      payment_failure_attempts: 0,
      admin_notes: `Week ${nextWeek} paid manually via ${manualMethod}${description ? ` — ${description}` : ""} (admin confirmed ${new Date().toISOString().split("T")[0]})`,
    });
    const paidAt = new Date().toISOString();
    const paymentMethod = normalizePaymentMethod(manualMethod);
    const sourceType = classifyPaymentSource({ paymentMethod, recordedBy: "admin" });
    const dedupeKey = generatePaymentDedupeKey({
      sourceType,
      bookingId: booking.id,
      weekNumber: nextWeek,
      amount: booking.weekly_rate || 0,
      paidAt,
      paymentMethod,
      externalReference: description || ""
    });
    const paymentLog = await base44.entities.PaymentLog.create({
      booking_request_id: booking.id,
      host_id: resolvedHostId,
      customer_email: booking.user_email,
      customer_name: booking.customer_full_name || "",
      vehicle_id: booking.vehicle_id,
      vehicle_name: booking.vehicle_name || "",
      week_number: nextWeek,
      billing_period_start: booking.next_billing_date || paidAt.slice(0, 10),
      billing_period_end: nextBillingStr,
      amount: booking.weekly_rate || 0,
      currency: "usd",
      payment_method: paymentMethod,
      source_type: sourceType,
      source_confidence: classifyPaymentConfidence({ sourceType, paymentMethod, externalReference: description || "" }),
      legacy_flag: false,
      external_reconcilable: !!description,
      dedupe_key: dedupeKey,
      external_reference: description || "",
      status: "paid",
      recorded_by: "admin",
      notes: description || "",
      paid_at: paidAt,
    });
    await base44.entities.ActivityEvent.create({
      event_type: "payment.logged",
      actor_id: "admin",
      actor_email: "admin",
      actor_role: "admin",
      target_entity: "PaymentLog",
      target_id: paymentLog.id,
      host_id: resolvedHostId,
      booking_id: booking.id,
      vehicle_id: booking.vehicle_id || "",
      customer_id: booking.user_email || "",
      summary: `Manual PaymentLog created for week ${nextWeek}`,
      metadata: { payment_log_id: paymentLog.id, dedupe_key: dedupeKey, source_type: sourceType },
      source: "admin_panel",
      user_email: "admin",
      event_title: "Manual PaymentLog created",
      event_status: "success",
    });
    toast.success(`Week ${nextWeek} marked as paid via ${manualMethod}`);
    onSuccess();
    onClose();
    setLoading(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload = {
        action,
        booking_request_id: booking.id,
        amount: amount ? parseFloat(amount) : undefined,
        description,
        reason: description,
      };
      const res = await base44.functions.invoke("adminPaymentAction", payload);
      if (res.data?.ok || res.data?.refund_id || res.data?.payment_intent_id) {
        toast.success(`Action completed successfully`);
        onSuccess();
        onClose();
      } else {
        toast.error(res.data?.error || "Action failed");
      }
    } catch (err) {
      toast.error(err.message || "Action failed");
    } finally {
      setLoading(false);
    }
  };

  const ACTIONS = [
    { id: "manual_paid", label: "💵 Mark as Manually Paid", desc: "Zelle, Cash, CashApp, etc. — advances billing week", needsAmount: false },
    { id: "refund", label: "💸 Refund", desc: "Issue partial or full refund to customer", needsAmount: true, amountLabel: "Refund amount (leave blank for full refund)", optional: true },
    { id: "charge_toll", label: "🛣️ Charge Toll", desc: "Bill customer for unpaid tolls", needsAmount: true, amountLabel: "Toll amount ($)", needsDesc: true, descLabel: "Toll details" },
    { id: "charge_key_fee", label: "🔑 Lost Key Fee", desc: "Charge $250 lost key fee", needsAmount: true, amountLabel: "Amount ($)", defaultAmount: "250" },
    { id: "charge_custom", label: "➕ Custom Charge", desc: "Any additional charge with reason", needsAmount: true, amountLabel: "Amount ($)", needsDesc: true, descLabel: "Reason for charge" },
    { id: "kill_vehicle", label: "⚡ Kill Engine", desc: "Remotely disable vehicle engine now", needsAmount: false },
    { id: "unkill_vehicle", label: "🟢 Restore Engine", desc: "Re-enable vehicle remotely", needsAmount: false },
    { id: "reinstate", label: "✅ Reinstate Rental", desc: "Reinstate suspended rental & re-enable vehicle", needsAmount: false },
  ];

  const selected = ACTIONS.find(a => a.id === action);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] p-6 z-10"
        style={{ background: "hsl(222 28% 9%)", boxShadow: "0 24px 80px hsl(222 28% 5% / 0.9)" }}>
        <h3 className="font-syne font-bold text-white text-lg mb-1">Payment Actions</h3>
        <p className="text-xs text-white/40 mb-5">{booking.customer_full_name} — {booking.vehicle_name}</p>

        <div className="space-y-2 mb-5">
          {ACTIONS.map((a) => (
            (a.id !== "reinstate" || booking.booking_status === "suspended") && (
              <button key={a.id}
                onClick={() => { setAction(a.id); setAmount(a.defaultAmount || ""); setDescription(""); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
                  action === a.id ? "border-primary/50 bg-primary/[0.08]" : "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]"
                }`}>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{a.label}</p>
                  <p className="text-xs text-white/40">{a.desc}</p>
                </div>
              </button>
            )
          ))}
        </div>

        {/* Manual paid options */}
        {action === "manual_paid" && (
          <div className="space-y-3 mb-5">
            <div>
              <label className="text-xs font-semibold text-white/40 mb-1.5 block">Payment Method</label>
              <div className="flex flex-wrap gap-2">
                {MANUAL_PAYMENT_METHODS.map(m => (
                  <button key={m} onClick={() => setManualMethod(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${manualMethod === m ? "border-primary/50 bg-primary/[0.12] text-primary" : "border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08]"}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-white/40 mb-1.5 block">Notes (optional)</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Zelle ref #12345"
                className="w-full h-10 px-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/50" />
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
              Will mark Week {(booking.billing_week_number || 1) + 1} as paid and set next billing date to {(() => { const d = new Date(booking.next_billing_date || new Date()); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })()}
            </div>
          </div>
        )}

        {selected && action !== "manual_paid" && (
          <div className="space-y-3 mb-5">
            {selected.needsAmount && (
              <div>
                <label className="text-xs font-semibold text-white/40 mb-1.5 block">{selected.amountLabel}</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder={selected.optional ? "Leave blank for full refund" : "0.00"}
                  className="w-full h-10 px-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/50" />
              </div>
            )}
            {selected.needsDesc && (
              <div>
                <label className="text-xs font-semibold text-white/40 mb-1.5 block">{selected.descLabel}</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter description..."
                  className="w-full h-10 px-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/50" />
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/60 bg-white/[0.06] border border-white/[0.08] hover:bg-white/10 transition-all">
            Cancel
          </button>
          <button
            onClick={action === "manual_paid" ? handleManualPaid : handleSubmit}
            disabled={!action || loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            {loading ? "Processing…" : action === "manual_paid" ? "Mark as Paid" : "Execute"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Payments() {
  const queryClient = useQueryClient();
  const { tenantFilter } = useTenant();
  const [actionBooking, setActionBooking] = useState(null);
  const [historyBooking, setHistoryBooking] = useState(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [scoreFilter, setScoreFilter] = useState(null); // null | "paid" | "failed" | "due_today" | "due_week"
  const [backfilling, setBackfilling] = useState(false);

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      const res = await base44.functions.invoke("backfillPaymentLogs", {});
      toast.success(`Backfill complete — ${res.data.created} records created, ${res.data.skipped} already existed`);
    } catch (err) {
      toast.error("Backfill failed: " + err.message);
    } finally {
      setBackfilling(false);
    }
  };

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["stripe-payments"],
    queryFn: () => base44.entities.BookingRequest.filter(tenantFilter(), "-updated_date", 300),
  });

  const allPayments = bookings.filter((b) => b.stripe_payment_intent_id || b.payment_status !== "unpaid");

  // Unique vehicles for filter dropdown
  const vehicleOptions = useMemo(() => {
    const seen = new Set();
    return allPayments.filter(b => {
      if (!b.vehicle_name || seen.has(b.vehicle_name)) return false;
      seen.add(b.vehicle_name);
      return true;
    }).map(b => b.vehicle_name);
  }, [allPayments]);

  // Scorecard stats
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  const totalCollected = allPayments.filter(b => b.payment_status === "paid").reduce((s, b) => s + (b.weekly_rate || 0), 0);
  const failedCount = allPayments.filter(b => b.payment_status === "failed").length;

  const dueTodayBookings = allPayments.filter(b => {
    if (!b.next_billing_date) return false;
    return b.next_billing_date.slice(0, 10) === todayStr && ["active", "confirmed", "approved"].includes(b.booking_status);
  });

  const dueThisWeekBookings = allPayments.filter(b => {
    if (!b.next_billing_date) return false;
    const d = new Date(b.next_billing_date);
    return d >= weekStart && d <= weekEnd && ["active", "confirmed", "approved"].includes(b.booking_status);
  });

  const SCORECARDS = [
    { id: "paid", label: "Total Collected", value: `$${totalCollected.toLocaleString()}`, icon: TrendingUp, cls: "border-emerald-500/20 bg-emerald-500/[0.06]", valueCls: "text-emerald-400", filterKey: "paid" },
    { id: "failed", label: "Failed / Overdue", value: failedCount, icon: XCircle, cls: "border-red-500/20 bg-red-500/[0.06]", valueCls: "text-red-400", filterKey: "failed" },
    { id: "due_today", label: "Due Today", value: dueTodayBookings.length, icon: CalendarClock, cls: "border-pink-500/20 bg-pink-500/[0.06]", valueCls: "text-pink-400", filterKey: "due_today" },
    { id: "due_week", label: "Due This Week", value: dueThisWeekBookings.length, icon: CreditCard, cls: "border-yellow-500/20 bg-yellow-500/[0.06]", valueCls: "text-yellow-400", filterKey: "due_week" },
  ];

  // Apply all filters
  const payments = allPayments.filter((b) => {
    if (search) {
      const q = search.toLowerCase();
      if (!`${b.customer_full_name} ${b.user_email} ${b.vehicle_name}`.toLowerCase().includes(q)) return false;
    }
    if (paymentStatus && b.payment_status !== paymentStatus) return false;
    if (vehicleFilter && b.vehicle_name !== vehicleFilter) return false;
    if (dateFrom && new Date(b.submitted_at || b.created_date) < new Date(dateFrom)) return false;
    if (dateTo && new Date(b.submitted_at || b.created_date) > new Date(dateTo + "T23:59:59")) return false;
    // Scorecard filters
    if (scoreFilter === "paid" && b.payment_status !== "paid") return false;
    if (scoreFilter === "failed" && !["failed", "overdue"].includes(b.payment_status)) return false;
    if (scoreFilter === "due_today") {
      if (!b.next_billing_date || b.next_billing_date.slice(0, 10) !== todayStr) return false;
      if (!["active", "confirmed", "approved"].includes(b.booking_status)) return false;
    }
    if (scoreFilter === "due_week") {
      if (!b.next_billing_date) return false;
      const d = new Date(b.next_billing_date);
      if (d < weekStart || d > weekEnd) return false;
      if (!["active", "confirmed", "approved"].includes(b.booking_status)) return false;
    }
    return true;
  });

  const clearFilters = () => {
    setSearch(""); setDateFrom(""); setDateTo(""); setPaymentStatus(""); setVehicleFilter(""); setScoreFilter(null);
  };
  const hasFilters = search || dateFrom || dateTo || paymentStatus || vehicleFilter || scoreFilter;

  // Active filter label
  const scoreLabel = scoreFilter === "due_today" ? `Due Today (${todayStr})` : scoreFilter === "due_week" ? "Due This Week" : null;

  if (!isLoading && allPayments.length === 0) {
    return <EmptyState icon={DollarSign} title="No payments yet" description="Payments will appear here once customers pay." />;
  }

  return (
    <div className="animate-fade-in-up space-y-5">
      {actionBooking && (
        <ActionModal booking={actionBooking} onClose={() => setActionBooking(null)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["stripe-payments"] })} />
      )}
      {historyBooking && (
        <PaymentHistoryDrawer booking={historyBooking} onClose={() => setHistoryBooking(null)} />
      )}

      <OperationalPageHeader
        title="Payments"
        subtitle={`${allPayments.length} payment records · billing visibility and customer payment actions`}
        eyebrow="Operations"
        action={
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-white/70 bg-white/[0.06] border border-white/[0.1] hover:bg-white/10 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${backfilling ? "animate-spin" : ""}`} />
            {backfilling ? "Updating…" : "Sync Payment History"}
          </button>
        }
      />

      {/* Scorecards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SCORECARDS.map(s => {
          const isActive = scoreFilter === s.filterKey;
          return (
            <button key={s.id}
              onClick={() => setScoreFilter(isActive ? null : s.filterKey)}
              className={`text-left rounded-2xl border p-4 transition-all cursor-pointer hover:opacity-90 ${isActive ? "ring-2 ring-primary/50" : ""} ${s.cls}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-white/35 uppercase tracking-wider">{s.label}</p>
                <s.icon className={`h-4 w-4 ${s.valueCls}`} />
              </div>
              <p className={`text-2xl font-black ${s.valueCls}`} style={{ fontFamily: "var(--font-syne)" }}>{s.value}</p>
              {s.id === "due_today" && dueTodayBookings.length > 0 && (
                <p className="text-[10px] text-white/30 mt-1">
                  ${dueTodayBookings.reduce((s, b) => s + (b.weekly_rate || 0), 0).toLocaleString()} to draw
                </p>
              )}
              {s.id === "due_week" && dueThisWeekBookings.length > 0 && (
                <p className="text-[10px] text-white/30 mt-1">
                  ${dueThisWeekBookings.reduce((s, b) => s + (b.weekly_rate || 0), 0).toLocaleString()} this week
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Active filter banner */}
      {scoreLabel && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.06] text-yellow-400 text-sm font-semibold">
          <CalendarClock className="h-4 w-4" />
          Showing: <span className="font-bold">{scoreLabel}</span>
          <span className="text-white/30 font-normal">— {payments.length} booking{payments.length !== 1 ? "s" : ""}, autopay draws at midnight UTC</span>
          <button onClick={() => setScoreFilter(null)} className="ml-auto text-xs text-white/40 hover:text-white underline">Clear</button>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-4 space-y-3 shadow-card">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            className="h-9 px-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-primary/50"
            placeholder="Search customer, vehicle…" value={search} onChange={e => setSearch(e.target.value)} />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="h-9 px-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white/70 text-sm focus:outline-none focus:border-primary/50" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="h-9 px-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white/70 text-sm focus:outline-none focus:border-primary/50" />
        </div>
        <div className="flex gap-3 flex-wrap">
          <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
            className="h-9 px-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white/70 text-sm focus:outline-none focus:border-primary/50">
            <option value="">All Statuses</option>
            {["paid","failed","overdue","due_soon","pending","unpaid","refunded"].map(s => (
              <option key={s} value={s} className="bg-gray-900">{s}</option>
            ))}
          </select>
          <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)}
            className="h-9 px-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white/70 text-sm focus:outline-none focus:border-primary/50">
            <option value="">All Vehicles</option>
            {vehicleOptions.map(v => <option key={v} value={v} className="bg-gray-900">{v}</option>)}
          </select>
          {hasFilters && (
            <button onClick={clearFilters} className="h-9 px-3 rounded-xl text-xs font-semibold text-white/50 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all">
              Clear filters
            </button>
          )}
          <span className="ml-auto text-xs text-white/30 self-center">Showing {payments.length} of {allPayments.length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]" style={{ background: "hsl(222 28% 8% / 0.8)" }}>
                {["Customer", "Vehicle", "Type", "Amount", "Status", "Week #", "Next Charge", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-white/35">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? [1,2,3].map((i) => (
                  <tr key={i} className="border-b border-white/[0.04]">
                    {[1,2,3,4,5,6,7,8].map((j) => (
                      <td key={j} className="px-4 py-3.5"><div className="h-4 rounded bg-white/[0.06] animate-pulse" /></td>
                    ))}
                  </tr>
                ))
                : payments.map((row) => {
                  const statusCls = PAYMENT_STATUS_STYLE[row.payment_status] || "bg-white/5 text-white/35 border-white/10";
                  const isSuspended = row.booking_status === "suspended";
                  return (
                    <tr key={row.id} className={`border-b border-white/[0.04] last:border-0 hover:bg-primary/[0.04] transition-colors ${isSuspended ? "bg-red-500/[0.05]" : ""}`}>
                      <td className="px-4 py-3.5">
                        <div>
                          <p className="text-sm font-medium text-white">{row.customer_full_name || "—"}</p>
                          <p className="text-xs text-white/35">{row.user_email || ""}</p>
                          {isSuspended && (
                            <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full mt-1 inline-flex items-center gap-1">
                              <AlertTriangle className="h-2.5 w-2.5" /> SUSPENDED
                            </span>
                          )}
                          {row.moovetrax_kill_active && !isSuspended && (
                            <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded-full mt-1 inline-flex items-center gap-1">
                              ⚡ KILLED
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-white/60">{row.vehicle_name || "—"}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg border text-purple-400 bg-purple-500/10 border-purple-500/20">
                          {row.booking_type || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm font-bold text-white">
                          {row.total_due_now ? `$${row.total_due_now.toLocaleString()}` : row.weekly_rate ? `$${row.weekly_rate.toLocaleString()}` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusCls}`}>
                          {row.payment_status || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-semibold text-white/60">
                          {row.billing_week_number ? `Week ${row.billing_week_number}` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-white/40">
                          {row.next_billing_date ? format(new Date(row.next_billing_date), "MMM d, yyyy") : row.submitted_at ? format(new Date(row.submitted_at), "MMM d, yyyy") : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          {row.receipt_url && (
                            <a href={row.receipt_url} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors">
                              <ExternalLink className="h-3 w-3" />Receipt
                            </a>
                          )}
                          <button onClick={() => setHistoryBooking(row)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/60 border border-white/[0.08] hover:bg-white/10 transition-all">
                            <History className="h-3 w-3" />History
                          </button>
                          <button onClick={() => setActionBooking(row)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/60 border border-white/[0.08] hover:bg-white/10 transition-all">
                            <Plus className="h-3 w-3" />Actions
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}