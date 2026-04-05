import React, { useState } from "react";
import { X, CheckCircle, XCircle, MessageCircle, User, Car, Shield, Zap, RefreshCw, FileText, Download } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

function CleanReturnActions({ bookingId }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.BookingRequest.update(bookingId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["booking-requests-admin"] }),
  });

  return (
    <div className="space-y-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes on vehicle condition…"
        rows={2}
        className="w-full px-3 py-2 rounded-xl text-xs bg-white/[0.05] border border-white/[0.1] text-white placeholder:text-white/20 focus:outline-none resize-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => updateMutation.mutate({ clean_return_status: "approved_clean", clean_return_credit_issued: true, clean_return_admin_notes: notes })}
          disabled={updateMutation.isPending}
          className="py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5"
          style={{ background: "linear-gradient(135deg, hsl(152 60% 46%), hsl(199 90% 54%))" }}
        >
          ✓ Approve — Issue $50
        </button>
        <button
          onClick={() => updateMutation.mutate({ clean_return_status: "not_clean", clean_return_admin_notes: notes })}
          disabled={updateMutation.isPending}
          className="py-2 rounded-xl text-xs font-bold text-red-400 border border-red-500/20 hover:bg-red-500/[0.08]"
        >
          ✗ Not Clean
        </button>
      </div>
    </div>
  );
}

export default function BookingReviewPanel({ booking, onClose }) {
  const [adminNote, setAdminNote] = useState(booking?.admin_notes || "");
  const [charging, setCharging] = useState(false);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BookingRequest.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["booking-requests-admin"] });
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      onClose();
    },
  });

  const notifyMutation = useMutation({
    mutationFn: (data) => base44.entities.Notification.create(data),
  });

  const handleChargeNow = async () => {
    if (!booking.stripe_customer_id || !booking.stripe_payment_method_id) {
      toast.error("No saved payment method on file.");
      return;
    }
    if (!confirm(`Charge $${booking.weekly_rate?.toLocaleString()} to ${booking.customer_full_name}?`)) return;
    setCharging(true);
    try {
      const res = await base44.functions.invoke("stripeChargeCustomer", {
        stripe_customer_id: booking.stripe_customer_id,
        payment_method_id: booking.stripe_payment_method_id,
        amount_cents: Math.round((booking.weekly_rate || 0) * 100),
        booking_request_id: booking.id,
        description: `uRide ${booking.booking_type} — ${booking.vehicle_name || ""}`,
      });
      if (res.data?.status === "succeeded") {
        toast.success("Payment charged successfully!");
        queryClient.invalidateQueries({ queryKey: ["booking-requests-admin"] });
        queryClient.invalidateQueries({ queryKey: ["stripe-payments"] });
      } else {
        toast.error(`Charge failed: ${res.data?.error || "Unknown error"}`);
      }
    } catch {
      toast.error("Charge failed. Please try again.");
    } finally {
      setCharging(false);
    }
  };

  if (!booking) return null;

  const handleAction = (action) => {
    const statusMap = {
      approve: "approved",
      reject: "rejected",
      more_info: "more_info_requested",
    };
    const titleMap = {
      approve: "Booking Approved 🎉",
      reject: "Booking Not Approved",
      more_info: "Additional Info Required",
    };
    const bodyMap = {
      approve: `Your booking for ${booking.vehicle_name} has been approved! We'll be in touch shortly.`,
      reject: `Unfortunately your booking for ${booking.vehicle_name} was not approved at this time.`,
      more_info: `We need additional information for your ${booking.vehicle_name} booking. Please check your account.`,
    };

    updateMutation.mutate({
      id: booking.id,
      data: {
        booking_status: statusMap[action],
        pending_review_alert_active: false,
        viewed_by_admin: true,
        admin_notes: adminNote,
      },
    });

    if (booking.user_email) {
      notifyMutation.mutate({
        user_email: booking.user_email,
        title: titleMap[action],
        body: bodyMap[action],
        type: "booking",
        booking_request_id: booking.id,
      });
    }
  };

  const isCancellationRequest = booking.booking_status === "cancellation_requested";

  const timeAgo = booking.submitted_at
    ? formatDistanceToNow(new Date(booking.submitted_at), { addSuffix: true })
    : formatDistanceToNow(new Date(booking.created_date), { addSuffix: true });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto h-full w-full max-w-xl flex flex-col overflow-hidden"
        style={{ background: "hsl(222 24% 10%)", borderLeft: "1px solid hsl(222 18% 18%)" }}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.07] flex-shrink-0">
          <div>
            <h2 className="font-syne font-bold text-white text-lg">
              {isCancellationRequest ? "Cancellation Request" : "Booking Review"}
            </h2>
            <p className="text-xs text-white/40 mt-0.5">Submitted {timeAgo}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>

        {/* Attention banner */}
        {isCancellationRequest ? (
          <div className="mx-5 mt-5 p-4 rounded-2xl border border-red-400/30 flex-shrink-0"
            style={{ background: "hsl(0 72% 58% / 0.08)" }}>
            <p className="text-red-300 font-bold text-sm">🚨 Customer has requested cancellation</p>
            {booking.cancellation_reason && (
              <p className="text-white/60 text-xs mt-1">Reason: <span className="text-white/80">{booking.cancellation_reason}</span></p>
            )}
          </div>
        ) : (
          <div className="mx-5 mt-5 p-4 rounded-2xl border border-yellow-400/30 flex-shrink-0"
            style={{ background: "hsl(45 95% 60% / 0.08)" }}>
            <p className="text-yellow-300 font-bold text-sm">⚠️ This booking is awaiting your review</p>
            <p className="text-white/50 text-xs mt-1">Take action below to approve, reject, or request more information.</p>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Customer */}
          <Section title="Customer" icon={User}>
            <Row label="Name" value={booking.customer_full_name || "—"} />
            <Row label="Phone" value={booking.customer_phone || "—"} />
            <Row label="Email" value={booking.user_email || "—"} />
            <Row label="Address" value={booking.customer_address || "—"} />
            <Row label="Employer" value={booking.employer || "—"} />
            <Row label="Income Range" value={booking.income_range || "—"} />
          </Section>

          {/* Vehicle & Booking */}
          <Section title="Booking Details" icon={Car}>
            <Row label="Vehicle" value={booking.vehicle_name || "—"} />
            <Row label="Type" value={booking.booking_type || "—"} />
            <Row label="City" value={booking.city || "—"} />
            <Row label="Start Date" value={booking.start_date ? format(new Date(booking.start_date), "MMM d, yyyy") : "—"} />
            <Row label="Weekly Rate" value={booking.weekly_rate ? `$${booking.weekly_rate}` : "—"} />
            <Row label="Payment" value={booking.payment_status || "—"} highlight={booking.payment_status === "paid" ? "green" : "yellow"} />
            {booking.receipt_url && (
              <a href={booking.receipt_url} target="_blank" rel="noreferrer"
                className="text-xs text-primary underline">View Stripe Receipt ↗</a>
            )}
          </Section>

          {/* Stripe Payment References */}
          {(booking.stripe_customer_id || booking.stripe_payment_intent_id) && (
            <Section title="Stripe References" icon={Shield}>
              {booking.stripe_customer_id && <Row label="Customer ID" value={booking.stripe_customer_id} />}
              {booking.stripe_payment_intent_id && <Row label="Payment Intent" value={booking.stripe_payment_intent_id} />}
              {booking.stripe_payment_method_id && <Row label="Payment Method" value={booking.stripe_payment_method_id} />}
              {booking.stripe_subscription_id && <Row label="Subscription" value={booking.stripe_subscription_id} />}
              <Row label="Autopay" value={booking.autopay_enabled ? "Enabled" : "Disabled"} highlight={booking.autopay_enabled ? "green" : null} />
              {booking.payment_failure_reason && <Row label="Failure Reason" value={booking.payment_failure_reason} highlight="yellow" />}
            </Section>
          )}

          {/* Verification */}
          <Section title="Verification" icon={Shield}>
            <Row label="ID Status" value={booking.verification_status || "—"} highlight={booking.verification_status === "verified" ? "green" : "yellow"} />
            <Row label="Contract Type" value={booking.contract_type === "rent_to_own" ? "Rent-to-Own" : booking.contract_type === "weekly" ? "Weekly Rental" : "—"} />
            <Row label="Contract Version" value={booking.contract_version || "—"} />
            <Row label="Contract Status" value={booking.contract_status || "—"} highlight={booking.contract_status === "signed" ? "green" : "yellow"} />
            {booking.signed_at && <Row label="Signed At" value={new Date(booking.signed_at).toLocaleString()} />}
            {booking.signature_name && <Row label="Signature Name" value={booking.signature_name} />}
            {booking.signature_device_info && <Row label="Signed Device" value={booking.signature_device_info.substring(0, 40) + "…"} />}
            {booking.license_front_url && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <a href={booking.license_front_url} target="_blank" rel="noreferrer"
                  className="text-xs text-primary underline">View License Front</a>
                {booking.license_back_url && (
                  <a href={booking.license_back_url} target="_blank" rel="noreferrer"
                    className="text-xs text-primary underline">View License Back</a>
                )}
                {booking.selfie_url && (
                  <a href={booking.selfie_url} target="_blank" rel="noreferrer"
                    className="text-xs text-primary underline">View Selfie</a>
                )}
              </div>
            )}
          </Section>

          {/* Clean Return */}
          {(booking.return_interior_photos?.length > 0 || booking.return_exterior_photos?.length > 0 || booking.clean_return_status !== "not_returned") && (
            <Section title="Clean Return Review" icon={Shield}>
              <Row label="Return Status" value={booking.clean_return_status || "—"} highlight={booking.clean_return_status === "approved_clean" ? "green" : booking.clean_return_status === "not_clean" ? "yellow" : null} />
              <Row label="$50 Credit Issued" value={booking.clean_return_credit_issued ? "Yes ✓" : "No"} highlight={booking.clean_return_credit_issued ? "green" : null} />
              {booking.clean_return_admin_notes && <Row label="Notes" value={booking.clean_return_admin_notes} />}
              {booking.return_interior_photos?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-white/35 mb-1.5">Interior Return Photos</p>
                  <div className="flex gap-2 flex-wrap">
                    {booking.return_interior_photos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt="" className="h-14 w-14 object-cover rounded-lg border border-white/10" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {booking.return_exterior_photos?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-white/35 mb-1.5">Exterior Return Photos</p>
                  <div className="flex gap-2 flex-wrap">
                    {booking.return_exterior_photos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt="" className="h-14 w-14 object-cover rounded-lg border border-white/10" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {booking.clean_return_status === "photos_submitted" && (
                <div className="mt-3 space-y-2">
                  <CleanReturnActions bookingId={booking.id} />
                </div>
              )}
            </Section>
          )}

          {/* Dispute Evidence */}
          <Section title="Dispute Evidence" icon={FileText}>
            <Row label="Agreement Accepted" value={booking.agreement_accepted_at ? new Date(booking.agreement_accepted_at).toLocaleString() : "—"} highlight={booking.agreement_accepted_at ? "green" : null} />
            <Row label="Agreement Version" value={booking.agreement_version || "—"} />
            <Row label="Device Info" value={booking.agreement_device_info ? booking.agreement_device_info.substring(0, 40) + "…" : "—"} />
            <Row label="Recurring Notice Agreed" value={booking.payment_accepted_recurring_notice ? "Yes ✓" : "No"} highlight={booking.payment_accepted_recurring_notice ? "green" : "yellow"} />
            <Row label="ID Verified" value={booking.verification_status === "verified" ? "Yes ✓" : "No"} highlight={booking.verification_status === "verified" ? "green" : "yellow"} />
            <Row label="Contract Signed" value={booking.contract_status === "signed" ? "Yes ✓" : "No"} highlight={booking.contract_status === "signed" ? "green" : "yellow"} />
            <Row label="Terms Consented" value={booking.consent_terms ? "Yes ✓" : "No"} highlight={booking.consent_terms ? "green" : "yellow"} />
            <Row label="E-Sign Consented" value={booking.consent_esign ? "Yes ✓" : "No"} highlight={booking.consent_esign ? "green" : "yellow"} />
            {booking.signed_at && <Row label="Signed At" value={new Date(booking.signed_at).toLocaleString()} />}
            {booking.signature_name && <Row label="Signature Name" value={booking.signature_name} />}
            {booking.contract_initials && (() => {
              try {
                const parsed = JSON.parse(booking.contract_initials);
                return (
                  <div className="mt-2">
                    <p className="text-xs text-white/35 mb-1.5">Clause Initials</p>
                    <div className="space-y-1">
                      {Object.entries(parsed).map(([clauseId, data]) => (
                        <div key={clauseId} className="flex items-center justify-between">
                          <span className="text-xs text-white/40 capitalize">{clauseId.replace(/_/g, " ")}</span>
                          <span className="text-xs font-bold text-green-400 italic">"{data.initials}" ✓</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}
            {booking.stripe_payment_intent_id && (
              <a
                href={`https://dashboard.stripe.com/payments/${booking.stripe_payment_intent_id}`}
                target="_blank" rel="noreferrer"
                className="text-xs text-primary underline flex items-center gap-1 mt-1"
              >
                <Download className="h-3 w-3" /> View Stripe Payment Evidence ↗
              </a>
            )}
          </Section>

          {/* Admin notes */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2 block">Admin Notes</label>
            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Add internal notes about this booking…"
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-sm bg-white/[0.05] border border-white/[0.1] text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 resize-none transition-all"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="p-5 border-t border-white/[0.07] flex-shrink-0 space-y-2">
          {isCancellationRequest ? (
            <>
              <button
                onClick={() => {
                  updateMutation.mutate({
                    id: booking.id,
                    data: { booking_status: "cancelled", pending_review_alert_active: false, viewed_by_admin: true, admin_notes: adminNote },
                  });
                  if (booking.user_email) {
                    notifyMutation.mutate({
                      user_email: booking.user_email,
                      title: "Cancellation Approved",
                      body: `Your cancellation request for ${booking.vehicle_name} has been approved.`,
                      type: "booking",
                      booking_request_id: booking.id,
                    });
                  }
                }}
                disabled={updateMutation.isPending}
                className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 bg-red-500"
              >
                <CheckCircle className="h-4 w-4" /> Approve Cancellation
              </button>
              <button
                onClick={() => {
                  updateMutation.mutate({
                    id: booking.id,
                    data: { booking_status: "approved", pending_review_alert_active: false, viewed_by_admin: true, admin_notes: adminNote },
                  });
                  if (booking.user_email) {
                    notifyMutation.mutate({
                      user_email: booking.user_email,
                      title: "Cancellation Denied",
                      body: `Your cancellation request for ${booking.vehicle_name} was not approved. Your rental remains active.`,
                      type: "booking",
                      booking_request_id: booking.id,
                    });
                  }
                }}
                disabled={updateMutation.isPending}
                className="w-full py-3 rounded-xl font-bold text-sm text-white/80 flex items-center justify-center gap-1.5 border border-white/[0.1] hover:bg-white/[0.06] disabled:opacity-40"
              >
                <XCircle className="h-4 w-4" /> Deny — Keep Rental Active
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleAction("approve")}
                disabled={updateMutation.isPending}
                className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, hsl(152 60% 46%), hsl(199 90% 54%))" }}
              >
                <CheckCircle className="h-4 w-4" /> Approve Booking
              </button>

              {booking.autopay_enabled && booking.stripe_payment_method_id && (
                <button
                  onClick={handleChargeNow}
                  disabled={charging}
                  className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
                >
                  {charging ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Charge ${booking.weekly_rate?.toLocaleString() || "—"} Now
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleAction("more_info")}
                  disabled={updateMutation.isPending}
                  className="py-3 rounded-xl font-bold text-sm text-white/80 flex items-center justify-center gap-1.5 transition-all hover:bg-white/[0.06] border border-white/[0.1] disabled:opacity-40"
                >
                  <MessageCircle className="h-4 w-4" /> More Info
                </button>
                <button
                  onClick={() => handleAction("reject")}
                  disabled={updateMutation.isPending}
                  className="py-3 rounded-xl font-bold text-sm text-red-400 flex items-center justify-center gap-1.5 transition-all hover:bg-red-500/[0.08] border border-red-500/20 disabled:opacity-40"
                >
                  <XCircle className="h-4 w-4" /> Reject
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] overflow-hidden" style={{ background: "hsl(222 24% 12% / 0.8)" }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
        <Icon className="h-3.5 w-3.5 text-primary/70" />
        <span className="text-xs font-bold uppercase tracking-wider text-white/40">{title}</span>
      </div>
      <div className="p-4 space-y-2.5">{children}</div>
    </div>
  );
}

function Row({ label, value, highlight }) {
  const highlightCls = highlight === "green"
    ? "text-green-400"
    : highlight === "yellow"
    ? "text-yellow-400"
    : "text-white/70";
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-white/35 flex-shrink-0">{label}</span>
      <span className={`text-xs font-semibold text-right ${highlightCls}`}>{value}</span>
    </div>
  );
}