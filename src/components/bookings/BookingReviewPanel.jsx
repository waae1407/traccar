import React, { useState } from "react";
// BookingReviewPanel — shows Stripe payment references when available
import { X, CheckCircle, XCircle, MessageCircle, User, Car, Shield } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { formatDistanceToNow, format } from "date-fns";

export default function BookingReviewPanel({ booking, onClose }) {
  const [adminNote, setAdminNote] = useState(booking?.admin_notes || "");
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
            <h2 className="font-syne font-bold text-white text-lg">Booking Review</h2>
            <p className="text-xs text-white/40 mt-0.5">Submitted {timeAgo}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>

        {/* Attention banner */}
        <div className="mx-5 mt-5 p-4 rounded-2xl border border-yellow-400/30 flex-shrink-0"
          style={{ background: "hsl(45 95% 60% / 0.08)" }}>
          <p className="text-yellow-300 font-bold text-sm">⚠️ This booking is awaiting your review</p>
          <p className="text-white/50 text-xs mt-1">Take action below to approve, reject, or request more information.</p>
        </div>

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
            <Row label="Contract" value={booking.contract_status || "—"} />
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
          <button
            onClick={() => handleAction("approve")}
            disabled={updateMutation.isPending}
            className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, hsl(152 60% 46%), hsl(199 90% 54%))" }}
          >
            <CheckCircle className="h-4 w-4" /> Approve Booking
          </button>
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