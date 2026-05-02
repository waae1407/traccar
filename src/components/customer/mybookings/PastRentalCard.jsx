import React, { useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Clock, CheckCircle2, XCircle, FileText, Shield } from "lucide-react";
import { format } from "date-fns";
import InspectionPhotoGallery from "./InspectionPhotoGallery";

const CLEAN_RETURN_LABELS = {
  approved_clean: { label: "✓ Clean Return Approved", cls: "text-green-600 bg-green-50 border-green-200" },
  not_clean:      { label: "✗ Damage / Not Clean", cls: "text-red-600 bg-red-50 border-red-200" },
  fee_applied:    { label: "Fee Applied", cls: "text-orange-600 bg-orange-50 border-orange-200" },
  photos_submitted: { label: "Under Review", cls: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  not_returned:   { label: "No Return Photos", cls: "text-gray-500 bg-gray-50 border-gray-200" },
};

export default function PastRentalCard({ booking, onViewContract }) {
  const [expanded, setExpanded] = useState(false);

  const isCancelled = booking.booking_status === "cancelled";
  const cleanReturn = CLEAN_RETURN_LABELS[booking.clean_return_status] || CLEAN_RETURN_LABELS.not_returned;
  const hasPickup = booking.pickup_photos?.length > 0;
  const hasDropoff = booking.return_exterior_photos?.length > 0;

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
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold shadow-sm ${isCancelled ? "bg-red-500 text-white" : "bg-emerald-500 text-white"}`}>
              {isCancelled ? "Cancelled" : "Completed"}
            </span>
          </div>
        </div>
      )}

      <div className="px-4 pt-3 pb-4">
        {/* Key details row */}
        <div className="flex flex-wrap gap-3 mb-3">
          {booking.start_date && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              {format(new Date(booking.start_date), "MMM d, yyyy")}
              {booking.end_date && ` → ${format(new Date(booking.end_date), "MMM d, yyyy")}`}
              {!booking.end_date && booking.rental_ended_at && ` → ${format(new Date(booking.rental_ended_at), "MMM d, yyyy")}`}
            </span>
          )}
          {booking.city && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="h-3 w-3" />{booking.city}
            </span>
          )}
          {booking.total_due_now > 0 && (
            <span className="text-xs font-bold text-gray-700">${booking.total_due_now.toLocaleString()} paid</span>
          )}
        </div>

        {/* Cancellation reason */}
        {isCancelled && booking.cancellation_reason && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-red-50 border border-red-100">
            <p className="text-[11px] text-red-600"><strong>Cancellation reason:</strong> {booking.cancellation_reason}</p>
          </div>
        )}

        {/* Clean return status */}
        {!isCancelled && (
          <div className={`mb-3 px-3 py-1.5 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1.5 ${cleanReturn.cls}`}>
            {cleanReturn.label}
          </div>
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