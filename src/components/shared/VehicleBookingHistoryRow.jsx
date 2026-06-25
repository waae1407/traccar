import React from "react";
import { Badge } from "@/components/ui/badge";
import { differenceInDays, format, isValid } from "date-fns";
import { Ban } from "lucide-react";

function safeDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isValid(d) ? d : null;
}

function fmt(d, pattern = "MMM d, yyyy") {
  if (!d) return "—";
  return format(d, pattern);
}

function Row({ label, value }) {
  if (!value && value !== 0 && value !== false) return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : typeof value === "string" ? value.replace(/_/g, " ") : String(value);
  return (
    <div className="flex justify-between text-xs py-1 gap-2">
      <span className="text-muted-foreground whitespace-nowrap">{label}</span>
      <span className="text-foreground font-medium text-right">{display}</span>
    </div>
  );
}

/**
 * VehicleBookingHistoryRow — shared booking history entry for
 * Vehicle360 and HostVehicle360. Displays every booking keyed by
 * booking_id with full lifecycle, revenue, and dispute context.
 * Never hides superseded bookings — shows them as Voided.
 */
export default function VehicleBookingHistoryRow({ booking: b, revenue = 0, onClick }) {
  const d = safeDate(b.created_date);
  const start = safeDate(b.start_date);
  const end = safeDate(b.rental_ended_at) || safeDate(b.end_date);
  const duration = start && end ? differenceInDays(end, start) : null;

  return (
    <div
      className={`rounded-lg px-3 py-2 text-sm space-y-1.5 transition-colors ${onClick ? "cursor-pointer hover:bg-secondary/50" : ""} ${b.is_superseded ? "bg-muted/20 border border-border/30" : "bg-secondary/30"}`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium">{b.customer_full_name || b.user_email || "—"}</p>
          <p className="text-muted-foreground text-xs">
            {b.start_date ? fmt(start) : "—"} → {end ? fmt(end) : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {b.is_superseded && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-0.5">
              <Ban className="h-2.5 w-2.5" /> VOIDED
            </span>
          )}
          <Badge className="text-xs">{b.booking_status?.replace(/_/g, " ")}</Badge>
          <Badge className="text-xs">{b.payment_status?.replace(/_/g, " ")}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5 text-xs">
        <Row label="Booking ID" value={b.id?.slice(-10)} />
        <Row label="Lifecycle Phase" value={b.rental_lifecycle_phase} />
        <Row label="Duration" value={duration != null ? `${duration} days` : null} />
        <Row label="Revenue" value={revenue > 0 ? `$${revenue.toFixed(2)}` : null} />
        <Row label="Pickup" value={safeDate(b.pickup_completed_at) ? fmt(safeDate(b.pickup_completed_at), "MMM d, h:mm a") : null} />
        <Row label="Return" value={safeDate(b.return_completed_at) ? fmt(safeDate(b.return_completed_at), "MMM d, h:mm a") : null} />
        <Row label="Billing Stopped" value={safeDate(b.billing_stopped_at) ? fmt(safeDate(b.billing_stopped_at), "MMM d, h:mm a") : null} />
        <Row label="Completion" value={b.completion_reason} />
        <Row label="Auto-Completed" value={safeDate(b.auto_completed_at) ? fmt(safeDate(b.auto_completed_at), "MMM d, h:mm a") : null} />
        <Row label="Dispute Status" value={b.damage_dispute_status && b.damage_dispute_status !== "none" ? b.damage_dispute_status : null} />
        <Row label="Refund" value={b.payment_status === "refunded" ? "Refunded" : null} />
        <Row label="Closure Reason" value={b.closure_reason} />
      </div>
    </div>
  );
}