import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/useTenant";
import { DollarSign, ExternalLink, AlertTriangle, Plus } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import AdminFilters from "@/components/shared/AdminFilters";
import { format } from "date-fns";
import { toast } from "sonner";

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

  const MANUAL_PAYMENT_METHODS = ["Zelle", "Cash", "CashApp", "Venmo", "Check", "Other"];
  const [manualMethod, setManualMethod] = useState("Zelle");

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
    toast.success(`Week ${nextWeek} marked as paid via ${manualMethod}`);
    onSuccess();
    onClose();
    setLoading(false);
  };

  const ACTIONS = [
    { id: "manual_paid", label: "💵 Mark as Manually Paid", desc: "Zelle, Cash, CashApp, etc. — advances billing week", needsAmount: false },
    { id: "refund", label: "💸 Refund", desc: "Issue partial or full refund to customer", needsAmount: true, amountLabel: "Refund amount (leave blank for full refund)", optional: true },
    { id: "charge_toll", label: "🛣️ Charge Toll", desc: "Bill customer for unpaid tolls", needsAmount: true, amountLabel: "Toll amount ($)", needsDesc: true, descLabel: "Toll details" },
    { id: "charge_key_fee", label: "🔑 Lost Key Fee", desc: "Charge $250 lost key fee", needsAmount: true, amountLabel: "Amount ($)", defaultAmount: "250" },
    { id: "charge_custom", label: "➕ Custom Charge", desc: "Any additional charge with reason", needsAmount: true, amountLabel: "Amount ($)", needsDesc: true, descLabel: "Reason for charge" },
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

        {/* Action selector */}
        <div className="space-y-2 mb-5">
          {ACTIONS.map((a) => (
            (a.id !== "reinstate" || booking.booking_status === "suspended") && (
              <button
                key={a.id}
                onClick={() => { setAction(a.id); setAmount(a.defaultAmount || ""); setDescription(""); }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
                  action === a.id
                    ? "border-primary/50 bg-primary/[0.08]"
                    : "border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
              >
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

        {/* Form fields for selected action */}
        {selected && action !== "manual_paid" && (
          <div className="space-y-3 mb-5">
            {selected.needsAmount && (
              <div>
                <label className="text-xs font-semibold text-white/40 mb-1.5 block">{selected.amountLabel}</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={selected.optional ? "Leave blank for full refund" : "0.00"}
                  className="w-full h-10 px-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                />
              </div>
            )}
            {selected.needsDesc && (
              <div>
                <label className="text-xs font-semibold text-white/40 mb-1.5 block">{selected.descLabel}</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter description..."
                  className="w-full h-10 px-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                />
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
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
          >
            {loading ? "Processing…" : action === "manual_paid" ? "Mark as Paid" : "Execute"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Payments() {
  const queryClient = useQueryClient();
  const { tenantFilter, companyId } = useTenant();
  const scopeKey = companyId || "all";
  const [actionBooking, setActionBooking] = useState(null);
  const [filters, setFilters] = useState({ search: "", dateFrom: "", dateTo: "", paymentStatus: "", bookingStatus: "" });
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["stripe-payments", scopeKey],
    queryFn: () => base44.entities.BookingRequest.filter(tenantFilter(), "-updated_date", 300),
  });

  const allPayments = bookings.filter((b) => b.stripe_payment_intent_id || b.payment_status !== "unpaid");

  const payments = allPayments.filter((b) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!`${b.customer_full_name} ${b.user_email} ${b.vehicle_name}`.toLowerCase().includes(q)) return false;
    }
    if (filters.paymentStatus && b.payment_status !== filters.paymentStatus) return false;
    if (filters.bookingStatus && b.booking_status !== filters.bookingStatus) return false;
    if (filters.dateFrom && new Date(b.submitted_at || b.created_date) < new Date(filters.dateFrom)) return false;
    if (filters.dateTo && new Date(b.submitted_at || b.created_date) > new Date(filters.dateTo + "T23:59:59")) return false;
    return true;
  });

  if (!isLoading && allPayments.length === 0) {
    return (
      <EmptyState
        icon={DollarSign}
        title="No Stripe payments yet"
        description="Payments made through the checkout flow will appear here automatically."
      />
    );
  }

  return (
    <div className="animate-fade-in-up">
      {actionBooking && (
        <ActionModal
          booking={actionBooking}
          onClose={() => setActionBooking(null)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["stripe-payments", scopeKey] })}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Stripe Payments</h2>
          <p className="text-xs text-white/40 mt-0.5">{allPayments.length} total records</p>
        </div>
      </div>

      <AdminFilters
        filters={filters}
        onChange={setFilter}
        options={{ showSearch: true, showDate: true, showPaymentStatus: true, showBookingStatus: true }}
        resultCount={payments.length}
        totalCount={allPayments.length}
      />

      <div className="rounded-2xl border border-white/[0.07] overflow-hidden"
        style={{ background: "hsl(222 24% 10% / 0.9)", boxShadow: "0 4px 32px hsl(222 28% 5% / 0.5)" }}>
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
                ? [1, 2, 3].map((i) => (
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
                      {/* Customer */}
                      <td className="px-4 py-3.5">
                        <div>
                          <p className="text-sm font-medium text-white">{row.customer_full_name || "—"}</p>
                          <p className="text-xs text-white/35">{row.user_email || ""}</p>
                          {isSuspended && (
                            <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full mt-1 inline-flex items-center gap-1">
                              <AlertTriangle className="h-2.5 w-2.5" /> SUSPENDED
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Vehicle */}
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-white/60">{row.vehicle_name || "—"}</span>
                      </td>
                      {/* Type */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg border text-purple-400 bg-purple-500/10 border-purple-500/20">
                          {row.booking_type || "—"}
                        </span>
                      </td>
                      {/* Amount */}
                      <td className="px-4 py-3.5">
                        <span className="text-sm font-bold text-white">
                          {row.total_due_now ? `$${row.total_due_now.toLocaleString()}` : row.weekly_rate ? `$${row.weekly_rate.toLocaleString()}` : "—"}
                        </span>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusCls}`}>
                          {row.payment_status || "—"}
                        </span>
                      </td>
                      {/* Week # */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-semibold text-white/60">
                          {row.billing_week_number ? `Week ${row.billing_week_number}` : "—"}
                        </span>
                      </td>
                      {/* Next Charge */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-white/40">
                          {row.next_billing_date ? format(new Date(row.next_billing_date), "MMM d, yyyy") : row.submitted_at ? format(new Date(row.submitted_at), "MMM d, yyyy") : "—"}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          {row.receipt_url && (
                            <a href={row.receipt_url} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors">
                              <ExternalLink className="h-3 w-3" />Receipt
                            </a>
                          )}
                          <button
                            onClick={() => setActionBooking(row)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/60 border border-white/[0.08] hover:bg-white/10 transition-all"
                          >
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