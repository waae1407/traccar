import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/useTenant";
import { DollarSign, ExternalLink, Zap, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
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

export default function Payments() {
  const queryClient = useQueryClient();
  const { tenantFilter, companyId } = useTenant();
  const scopeKey = companyId || "all";
  const [chargingId, setChargingId] = useState(null);

  // Pull from BookingRequests that have gone through Stripe payment
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["stripe-payments", scopeKey],
    queryFn: () => base44.entities.BookingRequest.filter(tenantFilter(), "-updated_date", 300),
  });

  // Only show bookings that have a Stripe payment (paid or failed, etc.)
  const payments = bookings.filter((b) => b.stripe_payment_intent_id || b.payment_status !== "unpaid");

  const handleChargeNow = async (booking) => {
    if (!booking.stripe_customer_id || !booking.stripe_payment_method_id) {
      toast.error("No saved payment method for this customer.");
      return;
    }
    if (!confirm(`Charge $${booking.weekly_rate?.toLocaleString()} to ${booking.customer_full_name}?`)) return;

    setChargingId(booking.id);
    try {
      const res = await base44.functions.invoke("stripeChargeCustomer", {
        stripe_customer_id: booking.stripe_customer_id,
        payment_method_id: booking.stripe_payment_method_id,
        amount_cents: Math.round((booking.weekly_rate || 0) * 100),
        booking_request_id: booking.id,
        description: `uRide ${booking.booking_type} payment — ${booking.vehicle_name || ""}`,
      });
      if (res.data?.status === "succeeded") {
        toast.success("Payment charged successfully!");
        queryClient.invalidateQueries({ queryKey: ["stripe-payments", scopeKey] });
      } else {
        toast.error(`Charge failed: ${res.data?.error || "Unknown error"}`);
      }
    } catch (err) {
      toast.error("Charge failed. Please try again.");
    } finally {
      setChargingId(null);
    }
  };

  if (!isLoading && payments.length === 0) {
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
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-white">Stripe Payments</h2>
          <p className="text-xs text-white/40 mt-0.5">{payments.length} records · sourced from booking requests</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.07] overflow-hidden"
        style={{ background: "hsl(222 24% 10% / 0.9)", boxShadow: "0 4px 32px hsl(222 28% 5% / 0.5)" }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]" style={{ background: "hsl(222 28% 8% / 0.8)" }}>
                {["Customer", "Vehicle", "Type", "Amount", "Status", "Autopay", "Date", "Actions"].map((h) => (
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
                  const isCharging = chargingId === row.id;
                  const canCharge = row.autopay_enabled && row.stripe_payment_method_id && row.booking_status === "approved";

                  return (
                    <tr key={row.id} className="border-b border-white/[0.04] last:border-0 hover:bg-primary/[0.04] transition-colors">
                      {/* Customer */}
                      <td className="px-4 py-3.5">
                        <div>
                          <p className="text-sm font-medium text-white">{row.customer_full_name || "—"}</p>
                          <p className="text-xs text-white/35">{row.user_email || ""}</p>
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
                      {/* Autopay */}
                      <td className="px-4 py-3.5">
                        {row.autopay_enabled
                          ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle className="h-3 w-3" />On</span>
                          : <span className="flex items-center gap-1 text-xs text-white/30"><XCircle className="h-3 w-3" />Off</span>}
                      </td>
                      {/* Date */}
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-white/40">
                          {row.submitted_at ? format(new Date(row.submitted_at), "MMM d, yyyy") : "—"}
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
                          {canCharge && (
                            <button
                              onClick={() => handleChargeNow(row)}
                              disabled={isCharging}
                              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-all disabled:opacity-50"
                            >
                              {isCharging
                                ? <RefreshCw className="h-3 w-3 animate-spin" />
                                : <Zap className="h-3 w-3" />}
                              Charge
                            </button>
                          )}
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