import React, { useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Clock, CheckCircle2, XCircle, FileText, Shield, Hash, Calendar, DollarSign, Gauge } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import InspectionPhotoGallery from "./InspectionPhotoGallery";
import CompletedBookingReviewPrompt from "./CompletedBookingReviewPrompt";

const CLEAN_RETURN_LABELS = {
  approved_clean: { label: "✓ Clean Return Approved", cls: "text-green-600 bg-green-50 border-green-200" },
  not_clean:      { label: "✗ Damage / Not Clean", cls: "text-red-600 bg-red-50 border-red-200" },
  fee_applied:    { label: "Fee Applied", cls: "text-orange-600 bg-orange-50 border-orange-200" },
  photos_submitted: { label: "Under Review", cls: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  not_returned:   { label: "No Return Photos", cls: "text-gray-500 bg-gray-50 border-gray-200" },
};

const STATUS_LABELS = {
  completed: (b) => b.completion_reason === "host_review_window_expired" ? "Auto-completed" : "Completed",
  cancelled: () => "Cancelled",
  rejected: () => "Rejected",
  superseded_invalid: (b) => b.payment_status === "refunded" ? "Voided / Refunded" : "Voided / Duplicate",
  more_info_requested: () => "More Info Needed",
};

const STATUS_BADGE_STYLES = {
  completed: "bg-emerald-500 text-white",
  cancelled: "bg-gray-400 text-white",
  rejected: "bg-red-500 text-white",
  superseded_invalid: "bg-gray-500 text-white",
  more_info_requested: "bg-yellow-500 text-white",
};

function LifecycleField({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-[11px] py-1">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-600 font-medium text-right">{value}</span>
    </div>
  );
}

function formatDate(str) {
  if (!str) return null;
  try {
    return format(new Date(str), "MMM d, yyyy · h:mm a");
  } catch {
    return str;
  }
}

export default function PastRentalCard({ booking, user, existingReview, onReviewSubmitted, onViewContract }) {
  const [expanded, setExpanded] = useState(false);

  const isCancelled = booking.booking_status === "cancelled";
  const isVoided = booking.booking_status === "superseded_invalid" || booking.booking_status === "rejected";
  const isCompleted = booking.booking_status === "completed";
  const statusLabel = STATUS_LABELS[booking.booking_status]?.(booking) || booking.booking_status?.replace(/_/g, " ");
  const statusBadgeStyle = STATUS_BADGE_STYLES[booking.booking_status] || "bg-gray-400 text-white";
  const cleanReturn = CLEAN_RETURN_LABELS[booking.clean_return_status] || CLEAN_RETURN_LABELS.not_returned;
  const hasPickup = booking.pickup_photos?.length > 0;
  const hasDropoff = booking.return_exterior_photos?.length > 0;
  const showLifecycleDetails = isCompleted || isVoided;

  return (
    <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
      {/* Vehicle image */}
      {booking.vehicle_image && (
        <div className="relative h-40 overflow-hidden">
          <img src={booking.vehicle_image} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.7))" }} />
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 flex items-end justify-between">
            <div>
              <p className="text-white font-black text-base" style={{ fontFamily: "var(--font-syne)" }}>
                {booking.vehicle_name}
              </p>
              <p className="text-white/60 text-[11px]">{booking.booking_type}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold shadow-sm ${statusBadgeStyle}`}>
              {statusLabel}
            </span>
          </div>
        </div>
      )}

      <div className="px-4 pt-3 pb-4">
        {/* Key details row */}
        <div className="flex flex-wrap gap-3 mb-3">
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Hash className="h-3 w-3" />#{booking.id?.slice(-8)}
          </span>
          {booking.start_date && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="h-3 w-3" />
              {format(new Date(booking.start_date), "MMM d, yyyy")}
              {booking.end_date && ` → ${format(new Date(booking.end_date), "MMM d, yyyy")}`}
              {!booking.end_date && booking.rental_ended_at && ` → ${format(new Date(booking.rental_ended_at), "MMM d, yyyy")}`}
            </span>
          )}
          {booking.start_date && booking.end_date && (() => {
            const days = differenceInDays(new Date(booking.end_date), new Date(booking.start_date));
            return days > 0 && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />{days} day{days !== 1 ? "s" : ""}
              </span>
            );
          })()}
          {booking.city && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="h-3 w-3" />{booking.city}
            </span>
          )}
          {booking.total_due_now > 0 && (
            <span className="flex items-center gap-1 text-xs font-bold text-gray-700">
              <DollarSign className="h-3 w-3" />{booking.total_due_now.toLocaleString()} total
            </span>
          )}
          {booking.weekly_rate > 0 && !booking.total_due_now && (
            <span className="text-xs font-bold text-gray-700">${booking.weekly_rate}/wk</span>
          )}
        </div>

        {/* Cancellation reason */}
        {isCancelled && booking.cancellation_reason && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-red-50 border border-red-100">
            <p className="text-[11px] text-red-600"><strong>Cancellation reason:</strong> {booking.cancellation_reason}</p>
          </div>
        )}

        {/* Superseded / voided reason */}
        {isVoided && (booking.superseded_reason || booking.closure_reason) && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
            <p className="text-[11px] text-gray-600">
              <strong>{booking.booking_status === "superseded_invalid" ? "Voided:" : "Reason:"}</strong> {(booking.superseded_reason || booking.closure_reason || "").replace(/_/g, " ")}
            </p>
            {booking.superseded_by_booking_id && (
              <p className="text-[10px] text-gray-400 mt-1">Replaced by booking #{booking.superseded_by_booking_id.slice(-8)}</p>
            )}
          </div>
        )}

        {/* Lifecycle details for completed/voided */}
        {showLifecycleDetails && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Rental Lifecycle</p>
            <div className="divide-y divide-gray-100">
              {isCompleted && booking.completion_reason && (
                <LifecycleField label="Completion" value={booking.completion_reason === "host_review_window_expired" ? "Auto-completed (review window expired)" : booking.completion_reason.replace(/_/g, " ")} />
              )}
              <LifecycleField label="Return submitted" value={formatDate(booking.return_completed_at)} />
              <LifecycleField label="Billing stopped" value={formatDate(booking.billing_stopped_at)} />
              <LifecycleField label="Auto-completed at" value={formatDate(booking.auto_completed_at)} />
              <LifecycleField label="Host review" value={booking.host_review_status?.replace(/_/g, " ")} />
              <LifecycleField label="Dispute status" value={booking.damage_dispute_status && booking.damage_dispute_status !== "none" ? booking.damage_dispute_status.replace(/_/g, " ") : null} />
              {booking.payment_status && (
                <LifecycleField label="Payment" value={booking.payment_status.replace(/_/g, " ")} />
              )}
            </div>
          </div>
        )}

        {/* Clean return status */}
        {!isCancelled && (
          <div className={`mb-3 px-3 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 ${cleanReturn.cls}`}>
            {cleanReturn.label}
          </div>
        )}

        {!isCancelled && (
          <CompletedBookingReviewPrompt
            booking={booking}
            user={user}
            existingReview={existingReview}
            onSubmitted={onReviewSubmitted}
          />
        )}

        {/* Quick badges row */}
        <div className="flex gap-2 flex-wrap mb-3">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${hasPickup ? "bg-green-50 text-green-600 border-green-200" : "bg-gray-50 text-gray-400 border-gray-200"}`}>
            {hasPickup ? "✓ Pickup Photos" : "○ No Pickup Photos"}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${hasDropoff ? "bg-green-50 text-green-600 border-green-200" : "bg-gray-50 text-gray-400 border-gray-200"}`}>
            {hasDropoff ? "✓ Return Photos" : "○ No Return Photos"}
          </span>
          {booking.contract_status === "signed" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border bg-blue-50 text-blue-600 border-blue-200">
              ✓ Agreement Signed
            </span>
          )}
        </div>

        {/* View Agreement button */}
        {booking.contract_status === "signed" && booking.contract_html && (
          <button
            onClick={() => onViewContract(booking)}
            className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-bold text-blue-600 bg-blue-50 border-blue-200 active:scale-[0.98] transition-transform"
          >
            <Shield className="h-4 w-4" />
            View Signed Agreement
          </button>
        )}

        {/* Expand toggle */}
        {(hasPickup || hasDropoff) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs font-bold text-gray-500 bg-gray-50 border border-gray-100 active:scale-[0.98] transition-transform"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "Hide" : "View"} Inspection Photos
          </button>
        )}

        {/* Expanded inspection photos */}
        {expanded && (hasPickup || hasDropoff) && (
          <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
            {hasPickup && (
              <InspectionPhotoGallery
                photos={booking.pickup_photos}
                submittedAt={booking.pickup_submitted_at}
                locationLabel={booking.pickup_location_label}
                title="Pickup Inspection Photos"
              />
            )}
            {hasDropoff && (
              <InspectionPhotoGallery
                photos={booking.return_exterior_photos}
                submittedAt={booking.dropoff_submitted_at}
                locationLabel={booking.dropoff_location_label}
                title="Drop-off Inspection Photos"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}