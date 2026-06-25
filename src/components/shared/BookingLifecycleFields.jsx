import React from "react";
import { format, isValid } from "date-fns";

function safeFormat(str, fmt = "MMM d, yyyy · h:mm a") {
  if (!str) return null;
  const d = new Date(str);
  return isValid(d) ? format(d, fmt) : str;
}

function Field({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between text-xs py-1 gap-2">
      <span className="text-muted-foreground whitespace-nowrap">{label}</span>
      <span className="text-foreground font-medium text-right capitalize">{value}</span>
    </div>
  );
}

export default function BookingLifecycleFields({ booking, compact = false }) {
  if (!booking) return null;

  return (
    <div className={`rounded-lg bg-secondary/30 px-3 py-2 ${compact ? "" : "space-y-0.5"}`}>
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Lifecycle</p>
      <Field label="Phase" value={booking.rental_lifecycle_phase?.replace(/_/g, " ")} />
      <Field label="Payment" value={booking.payment_status?.replace(/_/g, " ")} />
      <Field label="Return submitted" value={safeFormat(booking.return_completed_at)} />
      <Field label="Billing stopped" value={safeFormat(booking.billing_stopped_at)} />
      <Field label="Auto-completed" value={safeFormat(booking.auto_completed_at)} />
      {booking.completion_reason && (
        <Field label="Completion reason" value={booking.completion_reason.replace(/_/g, " ")} />
      )}
      {booking.host_review_status && booking.host_review_status !== "pending" && (
        <Field label="Host review" value={booking.host_review_status.replace(/_/g, " ")} />
      )}
      {booking.damage_dispute_status && booking.damage_dispute_status !== "none" && (
        <Field label="Dispute status" value={booking.damage_dispute_status.replace(/_/g, " ")} />
      )}
      {booking.damage_dispute_deadline_at && (
        <Field label="Dispute deadline" value={safeFormat(booking.damage_dispute_deadline_at, "MMM d, h:mm a")} />
      )}
      {booking.is_superseded && (
        <Field label="Superseded" value={booking.superseded_reason?.replace(/_/g, " ") || booking.closure_reason?.replace(/_/g, " ") || "Yes"} />
      )}
      {booking.closure_reason && (
        <Field label="Closure reason" value={booking.closure_reason.replace(/_/g, " ")} />
      )}
    </div>
  );
}