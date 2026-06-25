import React from "react";
import { format, isValid, differenceInDays } from "date-fns";
import {
  FileText, CreditCard, ShieldCheck, Camera, Car, Flag,
  Clock, MapPin, FileCheck, CheckCircle2, AlertTriangle, Ban,
  RefreshCw, DollarSign, Gavel, XCircle,
} from "lucide-react";

function safeDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isValid(d) ? d : null;
}

function fmt(d, pattern = "MMM d, yyyy · h:mm a") {
  if (!d) return null;
  return format(d, pattern);
}

function calcDuration(booking) {
  if (!booking.start_date) return null;
  const start = new Date(booking.start_date);
  const end = booking.rental_ended_at ? new Date(booking.rental_ended_at) : booking.end_date ? new Date(booking.end_date) : null;
  if (!end) return null;
  return differenceInDays(end, start);
}

/**
 * RentalLifecycleTimeline — read-only vertical timeline derived entirely
 * from BookingRequest timestamp fields. Never infers events.
 *
 * Props:
 *   booking: BookingRequest object
 *   compact: if true, renders a condensed single-column version
 */
export default function RentalLifecycleTimeline({ booking, compact = false }) {
  if (!booking) return null;

  const duration = calcDuration(booking);

  // Build events array — only include events whose timestamp exists
  const events = [];

  if (booking.created_date) {
    events.push({
      id: "created",
      icon: FileText,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      label: "Reservation Created",
      timestamp: booking.created_date,
      source: booking.booking_source || "—",
      notes: booking.booking_type || null,
    });
  }

  if (booking.agreement_accepted_at || booking.submitted_at) {
    events.push({
      id: "submitted",
      icon: ShieldCheck,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      label: "Booking Submitted",
      timestamp: booking.submitted_at || booking.agreement_accepted_at,
      source: "customer",
      notes: booking.consent_esign ? "E-sign consent accepted" : null,
    });
  }

  if (booking.signed_at || booking.contract_status === "signed") {
    events.push({
      id: "contract",
      icon: FileCheck,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
      label: "Contract Signed",
      timestamp: booking.signed_at || booking.agreement_accepted_at,
      source: booking.signature_name || "customer",
      notes: booking.contract_type ? `${booking.contract_type.replace(/_/g, " ")}` : null,
    });
  }

  if (booking.payment_status === "paid" || booking.stripe_payment_intent_id) {
    events.push({
      id: "payment",
      icon: CreditCard,
      color: "text-green-400",
      bg: "bg-green-500/10",
      label: "Payment Authorized",
      timestamp: booking.agreement_accepted_at || booking.created_date,
      source: "stripe",
      notes: booking.first_payment_amount ? `$${booking.first_payment_amount.toFixed(2)}` : null,
    });
  }

  if (booking.pickup_completed_at || booking.pickup_submitted_at) {
    events.push({
      id: "pickup",
      icon: Camera,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      label: "Pickup Inspection",
      timestamp: booking.pickup_completed_at || booking.pickup_submitted_at,
      source: "customer",
      notes: booking.pickup_location_label || booking.pickup_location || null,
    });
  }

  if (booking.rental_lifecycle_phase === "active" || booking.booking_status === "active" || booking.booking_status === "checked_out") {
    events.push({
      id: "active",
      icon: Car,
      color: "text-green-400",
      bg: "bg-green-500/10",
      label: "Rental Active",
      timestamp: booking.pickup_completed_at || booking.start_date ? new Date(booking.start_date) : booking.created_date,
      source: "system",
      notes: booking.start_date ? `Started ${format(new Date(booking.start_date), "MMM d, yyyy")}` : null,
    });
  }

  if (booking.scheduled_end_at) {
    events.push({
      id: "scheduled_end",
      icon: Flag,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      label: "Scheduled End",
      timestamp: booking.scheduled_end_at,
      source: "system",
      notes: booking.end_date ? `End date: ${booking.end_date}` : null,
    });
  }

  if (booking.return_required_at) {
    events.push({
      id: "return_required",
      icon: Clock,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      label: "Return Required",
      timestamp: booking.return_required_at,
      source: "system",
      notes: "Rental end date passed — return photos required",
    });
  }

  if (booking.return_inspection_started_at) {
    events.push({
      id: "return_started",
      icon: Camera,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      label: "Return Inspection Started",
      timestamp: booking.return_inspection_started_at,
      source: "customer",
      notes: null,
    });
  }

  if (booking.return_completed_at) {
    events.push({
      id: "return_submitted",
      icon: Camera,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      label: "Return Photos Submitted",
      timestamp: booking.return_completed_at,
      source: "customer",
      notes: booking.post_inspection_geofence_verified ? "Geofence verified" : "Geofence not verified",
    });
  }

  if (booking.billing_stopped_at) {
    events.push({
      id: "billing_stopped",
      icon: DollarSign,
      color: "text-green-400",
      bg: "bg-green-500/10",
      label: "Billing Stopped",
      timestamp: booking.billing_stopped_at,
      source: booking.billing_stop_reason === "admin_override" ? "admin" : "system",
      notes: booking.billing_stop_reason?.replace(/_/g, " ") || null,
    });
  }

  if (booking.host_review_completed_at || (booking.host_review_status && booking.host_review_status !== "pending")) {
    events.push({
      id: "host_review",
      icon: CheckCircle2,
      color: booking.host_review_status === "damage_reported" || booking.host_review_status === "disputed" ? "text-red-400" : "text-green-400",
      bg: booking.host_review_status === "damage_reported" || booking.host_review_status === "disputed" ? "bg-red-500/10" : "bg-green-500/10",
      label: "Host Review",
      timestamp: booking.host_review_completed_at || booking.auto_completed_at || booking.updated_date,
      source: "host",
      notes: booking.host_review_status?.replace(/_/g, " ") || null,
    });
  }

  if (booking.auto_completed_at) {
    events.push({
      id: "auto_completed",
      icon: Clock,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      label: "Auto-Completed",
      timestamp: booking.auto_completed_at,
      source: "system",
      notes: booking.completion_reason === "host_review_window_expired" ? "24-hour review window expired" : booking.completion_reason?.replace(/_/g, " ") || null,
    });
  }

  if (booking.rental_ended_at || booking.booking_status === "completed") {
    events.push({
      id: "completed",
      icon: CheckCircle2,
      color: "text-green-400",
      bg: "bg-green-500/10",
      label: "Completed",
      timestamp: booking.rental_ended_at || booking.auto_completed_at || booking.updated_date,
      source: booking.completion_reason === "admin_override" ? "admin" : "system",
      notes: [
        booking.completion_reason?.replace(/_/g, " "),
        duration != null ? `${duration} day rental` : null,
      ].filter(Boolean).join(" · ") || null,
    });
  }

  if (booking.damage_dispute_opened_at || (booking.damage_dispute_status && booking.damage_dispute_status !== "none")) {
    events.push({
      id: "dispute",
      icon: Gavel,
      color: "text-red-400",
      bg: "bg-red-500/10",
      label: "Damage Dispute",
      timestamp: booking.damage_dispute_opened_at || booking.updated_date,
      source: "host",
      notes: [
        booking.damage_dispute_status?.replace(/_/g, " "),
        booking.damage_dispute_deadline_at ? `Deadline: ${fmt(safeDate(booking.damage_dispute_deadline_at), "MMM d, h:mm a")}` : null,
      ].filter(Boolean).join(" · ") || null,
    });
  }

  if (booking.payment_status === "refunded") {
    events.push({
      id: "refund",
      icon: RefreshCw,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      label: "Refund Issued",
      timestamp: booking.updated_date,
      source: "stripe",
      notes: null,
    });
  }

  if (booking.is_superseded && booking.superseded_at) {
    events.push({
      id: "superseded",
      icon: Ban,
      color: "text-gray-400",
      bg: "bg-gray-500/10",
      label: "Superseded / Voided",
      timestamp: booking.superseded_at,
      source: "system",
      notes: [
        booking.superseded_reason?.replace(/_/g, " "),
        booking.closure_reason?.replace(/_/g, " "),
        booking.superseded_by_booking_id ? `Replaced by #${booking.superseded_by_booking_id.slice(-8)}` : null,
      ].filter(Boolean).join(" · ") || null,
    });
  }

  if (booking.booking_status === "cancelled" && !booking.is_superseded) {
    events.push({
      id: "cancelled",
      icon: XCircle,
      color: "text-gray-400",
      bg: "bg-gray-500/10",
      label: "Cancelled",
      timestamp: booking.updated_date,
      source: booking.closure_reason === "auto_cancelled" ? "system" : "admin",
      notes: booking.closure_reason?.replace(/_/g, " ") || null,
    });
  }

  // Sort chronologically (earliest first)
  events.sort((a, b) => {
    const da = safeDate(a.timestamp);
    const db = safeDate(b.timestamp);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
  });

  if (events.length === 0) {
    return (
      <div className="text-muted-foreground text-sm py-4 text-center">No lifecycle events recorded.</div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-1.5">
        {events.map((ev) => {
          const Icon = ev.icon;
          const d = safeDate(ev.timestamp);
          return (
            <div key={ev.id} className="flex items-center gap-2 text-xs">
              <div className={`h-6 w-6 rounded-lg flex items-center justify-center flex-shrink-0 ${ev.bg}`}>
                <Icon className={`h-3 w-3 ${ev.color}`} />
              </div>
              <span className="font-medium text-foreground">{ev.label}</span>
              {d && <span className="text-muted-foreground">{fmt(d, "MMM d, h:mm a")}</span>}
              {ev.notes && <span className="text-muted-foreground text-[10px]">· {ev.notes}</span>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-border rounded-full" />

      <div className="space-y-4">
        {events.map((ev) => {
          const Icon = ev.icon;
          const d = safeDate(ev.timestamp);
          return (
            <div key={ev.id} className="flex gap-3 relative">
              {/* Icon node */}
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 z-10 border border-border/50 ${ev.bg}`}>
                <Icon className={`h-4 w-4 ${ev.color}`} />
              </div>

              {/* Content */}
              <div className="flex-1 pb-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{ev.label}</p>
                  {d && (
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {fmt(d)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded">
                    {ev.source}
                  </span>
                  {ev.notes && <span className="text-xs text-muted-foreground">{ev.notes}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}