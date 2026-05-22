import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/useTenant";
import { DollarSign, ExternalLink, AlertTriangle, Plus, TrendingUp, CreditCard, XCircle, CalendarClock, History, RefreshCw } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { toast } from "sonner";
import PaymentHistoryDrawer from "@/components/payments/PaymentHistoryDrawer";
import { generatePaymentDedupeKey, classifyPaymentSource, classifyPaymentConfidence, normalizePaymentMethod } from "@/lib/financial/paymentLedger";
import {
  OperationalPageShell,
  OperationalHero,
  OperationalKpiGrid,
  OperationalFilterBar,
  OperationalAdvancedFilters,
  OperationalExportToolbar,
  OperationalDataSection,
} from "@/components/operational";

const PAYMENT_STATUS_STYLE = {
  paid: "bg-green-500/15 text-green-400 border-green-500/25",
  failed: "bg-red-500/15 text-red-400 border-red-500/25",
  overdue: "bg-red-500/15 text-red-400 border-red-500/25",
  due_soon: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  refunded: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  unpaid: "bg-white/5 text-white/35 border-white/10",
};

function ActionModal({ booking, onClose, onSuccess }) {
  const [action, setAction] = useState(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const MANUAL_PAYMENT_METHODS = ["Zelle", "Cash", "CashApp", "Venmo", "Check", "Other"];
  const [manualMethod, setManualMethod] = useState("Zelle");
  const { data: bookingVehicles = [] } = useQuery({ queryKey: ["payment-action-vehicle", booking?.vehicle_id], queryFn: () => base44.entities.Vehicle.filter({ id: booking.vehicle_id }), enabled: !!booking?.vehicle_id });
  const resolvedHostId = booking.host_id || bookingVehicles[0]?.host_id || "";

  const handleManualPaid = async () => {
    setLoading(true);
    const nextWeek = booking.billing_week_number ? booking.billing_week_number + 1 : 2;
    const nextBillingDate = new Date(booking.next_billing_date || new Date());
    nextBillingDate.setDate(nextBillingDate.getDate() + 7);
    const nextBillingStr = nextBillingDate.toISOString().split("T")[0];
    await base44.entities.BookingRequest.update(booking.id, { payment_status: "paid", billing_week_number: nextWeek, next_billing_date: nextBillingStr, payment_failure_reason: "", payment_failure_attempts: 0, admin_notes: `Week ${nextWeek} paid manually via ${manualMethod}${description ? ` — ${description}` : ""} (admin confirmed ${new Date().toISOString().split("T")[0]})` });
    const paidAt = new Date().toISOString();
    const paymentMethod = normalizePaymentMethod(manualMethod);
    const sourceType = classifyPaymentSource({ paymentMethod, recordedBy: "admin" });
    const dedupeKey = generatePaymentDedupeKey({ sourceType, bookingId: booking.id, weekNumber: nextWeek, amount: booking.weekly_rate || 0, paidAt, paymentMethod, externalReference: description || "" });
    const paymentLog = await base44.entities.PaymentLog.create({ booking_request_id: booking.id, host_id: resolvedHostId, customer_email: booking.user_email, customer_name: booking.customer_full_name || "", vehicle_id: booking.vehicle_id, vehicle_name: booking.vehicle_name || "", week_number: nextWeek, billing_period_start: booking.next_billing_date || paidAt.slice(0, 10), billing_period_end: nextBillingStr, amount: booking.weekly_rate || 0, currency: "usd", payment_method: paymentMethod, source_type: sourceType, source_confidence: classifyPaymentConfidence({ sourceType, paymentMethod, externalReference: description || "" }), legacy_flag: false, external_reconcilable: !!description, dedupe_key: dedupeKey, external_reference: description || "", status: "paid", recorded_by: "admin", notes: description || "", paid_at: paidAt });
    await base44.entities.ActivityEvent.create({ event_type: "payment.logged", actor_id: "admin", actor_email: "admin", actor_role: "admin", target_entity: "PaymentLog", target_id: paymentLog.id, host_id: resolvedHostId, booking_id: booking.id, vehicle_id: booking.vehicle_id || "", customer_id: booking.user_email || "", summary: `Manual PaymentLog created for week ${nextWeek}`, metadata: { payment_log_id: paymentLog.id, dedupe_key: dedupeKey, source_type: sourceType }, source: "admin_panel", user_email: "admin", event_title: "Manual PaymentLog created", event_status: "success" });
    toast.success(`Week ${nextWeek} marked as paid via ${manualMethod}`);
    onSuccess(); onClose(); setLoading(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("adminPaymentAction", { action, booking_request_id: booking.id, amount: amount ? parseFloat(amount) : undefined, description, reason: description });
      if (res.data?.ok || res.data?.refund_id || res.data?.payment_intent_id) { toast.success(`Action completed successfully`); onSuccess(); onClose(); }
      else toast.error(res.data?.error || "Action failed");
    } catch (err) { toast.error(err.message || "Action failed"); }
    finally { setLoading(false); }
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
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/[0.08] p-6" style={{ background: "hsl(222 28% 9%)", boxShadow: "0 24px 80px hsl(222 28% 5% / 0.9)" }}>
        <h3 className="font-syne text-lg font-bold text-white">Payment Actions</h3>
        <p className="mb-5 text-xs text-white/40">{booking.customer_full_name} — {booking.vehicle_name}</p>
        <div className="mb-5 space-y-2">{ACTIONS.map((a) => ((a.id !== "reinstate" || booking.booking_status === "suspended") && <button key={a.id} onClick={() => { setAction(a.id); setAmount(a.defaultAmount || ""); setDescription(""); }} className={`w-full rounded-xl border p-3 text-left transition-all ${action === a.id ? "border-primary/50 bg-primary/[0.08]" : "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]"}`}><p className="text-sm font-semibold text-white">{a.label}</p><p className="text-xs text-white/40">{a.desc}</p></button>))}</div>
        {action === "manual_paid" && <div className="mb-5 space-y-3"><div><label className="mb-1.5 block text-xs font-semibold text-white/40">Payment Method</label><div className="flex flex-wrap gap-2">{MANUAL_PAYMENT_METHODS.map(m => <button key={m} onClick={() => setManualMethod(m)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${manualMethod === m ? "border-primary/50 bg-primary/[0.12] text-primary" : "border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08]"}`}>{m}</button>)}</div></div><input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes or reference" className="h-10 w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50" /></div>}
        {selected && action !== "manual_paid" && <div className="mb-5 space-y-3">{selected.needsAmount && <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={selected.amountLabel} className="h-10 w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50" />}{selected.needsDesc && <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={selected.descLabel} className="h-10 w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50" />}</div>}
        <div className="flex gap-3"><button onClick={onClose} className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.06] py-2.5 text-sm font-medium text-white/60 hover:bg-white/10">Cancel</button><button onClick={action === "manual_paid" ? handleManualPaid : handleSubmit} disabled={!action || loading} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>{loading ? "Processing…" : action === "manual_paid" ? "Mark as Paid" : "Execute"}</button></div>
      </div>
    </div>
  );
}

export default function Payments() {
  const queryClient = useQueryClient();
  const { tenantFilter } = useTenant();
  const [actionBooking, setActionBooking] = useState(null);
  const [historyBooking, setHistoryBooking] = useState(null);
  const [filters, setFilters] = useState({ search: "", dateFrom: "", dateTo: "", paymentStatus: "", vehicleFilter: "" });
  const [scoreFilter, setScoreFilter] = useState(null);
  const [backfilling, setBackfilling] = useState(false);

  const handleBackfill = async () => { setBackfilling(true); try { const res = await base44.functions.invoke("backfillPaymentLogs", {}); toast.success(`Backfill complete — ${res.data.created} records created, ${res.data.skipped} already existed`); } catch (err) { toast.error("Backfill failed: " + err.message); } finally { setBackfilling(false); } };
  const { data: bookings = [], isLoading } = useQuery({ queryKey: ["stripe-payments"], queryFn: () => base44.entities.BookingRequest.filter(tenantFilter(), "-updated_date", 300) });
  const allPayments = bookings.filter((b) => b.stripe_payment_intent_id || b.payment_status !== "unpaid");
  const vehicleOptions = useMemo(() => { const seen = new Set(); return allPayments.filter(b => { if (!b.vehicle_name || seen.has(b.vehicle_name)) return false; seen.add(b.vehicle_name); return true; }).map(b => ({ id: b.vehicle_name, label: b.vehicle_name })); }, [allPayments]);

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  const totalCollected = allPayments.filter(b => b.payment_status === "paid").reduce((s, b) => s + (b.weekly_rate || 0), 0);
  const failedCount = allPayments.filter(b => b.payment_status === "failed").length;
  const dueTodayBookings = allPayments.filter(b => b.next_billing_date?.slice(0, 10) === todayStr && ["active", "confirmed", "approved"].includes(b.booking_status));
  const dueThisWeekBookings = allPayments.filter(b => { if (!b.next_billing_date) return false; const d = new Date(b.next_billing_date); return d >= weekStart && d <= weekEnd && ["active", "confirmed", "approved"].includes(b.booking_status); });

  const scorecards = [
    { id: "paid", label: "Total Collected", value: totalCollected, type: "currency", variant: "success", icon: TrendingUp, filterKey: "paid" },
    { id: "failed", label: "Failed / Overdue", value: failedCount, variant: "danger", icon: XCircle, filterKey: "failed" },
    { id: "due_today", label: "Due Today", value: dueTodayBookings.length, variant: "primary", icon: CalendarClock, filterKey: "due_today", note: dueTodayBookings.length > 0 ? `$${dueTodayBookings.reduce((s, b) => s + (b.weekly_rate || 0), 0).toLocaleString()} to draw` : undefined },
    { id: "due_week", label: "Due This Week", value: dueThisWeekBookings.length, variant: "warning", icon: CreditCard, filterKey: "due_week", note: dueThisWeekBookings.length > 0 ? `$${dueThisWeekBookings.reduce((s, b) => s + (b.weekly_rate || 0), 0).toLocaleString()} this week` : undefined },
  ];

  const payments = allPayments.filter((b) => {
    if (filters.search && !`${b.customer_full_name} ${b.user_email} ${b.vehicle_name}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.paymentStatus && b.payment_status !== filters.paymentStatus) return false;
    if (filters.vehicleId && b.vehicle_name !== filters.vehicleId) return false;
    if (filters.dateFrom && new Date(b.submitted_at || b.created_date) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo && new Date(b.submitted_at || b.created_date) > new Date(filters.dateTo + "T23:59:59")) return false;
    if (scoreFilter === "paid" && b.payment_status !== "paid") return false;
    if (scoreFilter === "failed" && !["failed", "overdue"].includes(b.payment_status)) return false;
    if (scoreFilter === "due_today" && (!b.next_billing_date || b.next_billing_date.slice(0, 10) !== todayStr || !["active", "confirmed", "approved"].includes(b.booking_status))) return false;
    if (scoreFilter === "due_week") { if (!b.next_billing_date) return false; const d = new Date(b.next_billing_date); if (d < weekStart || d > weekEnd || !["active", "confirmed", "approved"].includes(b.booking_status)) return false; }
    return true;
  });

  if (!isLoading && allPayments.length === 0) return <EmptyState icon={DollarSign} title="No payments yet" description="Payments will appear here once customers pay." />;

  return (
    <OperationalPageShell mode="admin">
      {actionBooking && <ActionModal booking={actionBooking} onClose={() => setActionBooking(null)} onSuccess={() => queryClient.invalidateQueries({ queryKey: ["stripe-payments"] })} />}
      {historyBooking && <PaymentHistoryDrawer booking={historyBooking} onClose={() => setHistoryBooking(null)} />}
      <OperationalHero mode="admin" title="Payments" subtitle={`${allPayments.length} payment records · billing visibility and customer payment actions`} eyebrow="Operations" actions={<OperationalExportToolbar mode="admin" syncAction={{ label: "Sync Payment History", loadingLabel: "Updating…", loading: backfilling, onClick: handleBackfill }} />} />
      <OperationalKpiGrid mode="admin" metrics={scorecards.map(s => ({ ...s, active: scoreFilter === s.filterKey, onClick: () => setScoreFilter(scoreFilter === s.filterKey ? null : s.filterKey) }))} />
      {scoreFilter && <div className="flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.06] px-4 py-2.5 text-sm font-semibold text-yellow-400"><CalendarClock className="h-4 w-4" /> Active payment focus: {scoreFilter.replaceAll("_", " ")}<button onClick={() => setScoreFilter(null)} className="ml-auto text-xs text-white/40 underline hover:text-white">Clear</button></div>}
      <OperationalFilterBar mode="admin" filters={filters} onChange={setFilters} vehicles={vehicleOptions} statuses={["paid", "failed", "overdue", "due_soon", "pending", "unpaid", "refunded"]} resultCount={payments.length} totalCount={allPayments.length} placeholder="Search customer, vehicle…" />
      <OperationalAdvancedFilters mode="admin" filters={filters} onChange={setFilters} fields={[{ key: "dateFrom", label: "From date", type: "date" }, { key: "dateTo", label: "To date", type: "date" }]} />
      <OperationalDataSection mode="admin" title="Payment Records" count={payments.length} loading={isLoading} empty={payments.length === 0} emptyIcon={DollarSign} emptyTitle="No payments found">
        <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-white/[0.06] bg-white/[0.03]">{["Customer", "Vehicle", "Type", "Amount", "Status", "Week #", "Next Charge", "Actions"].map((h) => <th key={h} className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-white/35">{h}</th>)}</tr></thead><tbody>{payments.map((row) => { const statusCls = PAYMENT_STATUS_STYLE[row.payment_status] || "bg-white/5 text-white/35 border-white/10"; const isSuspended = row.booking_status === "suspended"; return <tr key={row.id} className={`border-b border-white/[0.04] transition-colors hover:bg-primary/[0.04] ${isSuspended ? "bg-red-500/[0.05]" : ""}`}><td className="px-4 py-3.5"><p className="text-sm font-medium text-white">{row.customer_full_name || "—"}</p><p className="text-xs text-white/35">{row.user_email || ""}</p>{isSuspended && <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-400"><AlertTriangle className="h-2.5 w-2.5" /> SUSPENDED</span>}</td><td className="px-4 py-3.5 text-sm text-white/60">{row.vehicle_name || "—"}</td><td className="px-4 py-3.5"><span className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-400">{row.booking_type || "—"}</span></td><td className="px-4 py-3.5 text-sm font-bold text-white">{row.total_due_now ? `$${row.total_due_now.toLocaleString()}` : row.weekly_rate ? `$${row.weekly_rate.toLocaleString()}` : "—"}</td><td className="px-4 py-3.5"><span className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-semibold ${statusCls}`}>{row.payment_status || "—"}</span></td><td className="px-4 py-3.5 text-xs font-semibold text-white/60">{row.billing_week_number ? `Week ${row.billing_week_number}` : "—"}</td><td className="px-4 py-3.5 text-xs text-white/40">{row.next_billing_date ? format(new Date(row.next_billing_date), "MMM d, yyyy") : row.submitted_at ? format(new Date(row.submitted_at), "MMM d, yyyy") : "—"}</td><td className="px-4 py-3.5"><div className="flex items-center gap-2">{row.receipt_url && <a href={row.receipt_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary"><ExternalLink className="h-3 w-3" />Receipt</a>}<button onClick={() => setHistoryBooking(row)} className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-xs text-white/60 hover:bg-white/10"><History className="h-3 w-3" />History</button><button onClick={() => setActionBooking(row)} className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-xs text-white/60 hover:bg-white/10"><Plus className="h-3 w-3" />Actions</button></div></td></tr>; })}</tbody></table></div>
      </OperationalDataSection>
    </OperationalPageShell>
  );
}