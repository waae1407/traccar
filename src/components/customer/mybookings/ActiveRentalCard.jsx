import React from "react";
import { Link } from "react-router-dom";
import { MapPin, Clock, ChevronRight, Camera, CheckCircle2, XCircle, Trash2, Shield } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PickupAddressCard from "./PickupAddressCard";
import TelematicsPanel from "./TelematicsPanel";

const STATUS_CONFIG = {
  confirmed:              { label: "✓ Confirmed",       style: { background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff" } },
  active:                 { label: "● Active",          style: { background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff" } },
  approved:               { label: "✓ Approved",        style: { background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff" } },
  pending_review:         { label: "⏳ Under Review",   style: { background: "linear-gradient(135deg, #d97706, #b45309)", color: "#fff" } },
  pending_payment:        { label: "💳 Payment Due",    style: { background: "linear-gradient(135deg, #ea580c, #c2410c)", color: "#fff" } },
  pending_verification:   { label: "🔍 Verifying",      style: { background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff" } },
  pending_contract:       { label: "📄 Sign Contract",  style: { background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "#fff" } },
  draft:                  { label: "Draft",              style: { background: "#e5e7eb", color: "#6b7280" } },
  cancellation_requested: { label: "⏳ Cancel Pending", style: { background: "#fee2e2", color: "#dc2626" } },
  return_pending_host_review: { label: "⏳ Return Review", style: { background: "linear-gradient(135deg, #d97706, #b45309)", color: "#fff" } },
  under_review: { label: "⚠️ Under Review", style: { background: "linear-gradient(135deg, #dc2626, #991b1b)", color: "#fff" } },
};

const CANCELLABLE = ["pending_payment", "pending_review", "approved", "confirmed", "active"];
const DELETABLE   = ["draft", "pending_verification", "pending_contract"];
const RESUMABLE   = ["draft", "pending_verification", "pending_contract", "pending_payment"];
const SHOW_INSPECTION = ["active", "approved", "confirmed", "return_pending_host_review", "under_review"];
// Statuses that have a fully active rental (signed agreement)
const ACTIVE_RENTAL = ["active", "approved", "confirmed", "return_pending_host_review", "under_review"];

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, style: { background: "#e5e7eb", color: "#6b7280" } };
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold shadow-sm" style={cfg.style}>
      {cfg.label}
    </span>
  );
}

// Statuses where customer has paid — show pickup address
const PAID_STATUSES = ["active", "approved", "confirmed", "pending_review"];

export default function ActiveRentalCard({ booking, onDelete, onCancelRequest, onInspect, onViewContract, isDeleting }) {
  const isResumable   = RESUMABLE.includes(booking.booking_status);
  const isDeletable   = DELETABLE.includes(booking.booking_status);
  const isCancellable = CANCELLABLE.includes(booking.booking_status);
  const isCancelPending = booking.booking_status === "cancellation_requested";
  const showInspection  = SHOW_INSPECTION.includes(booking.booking_status);
  const isActiveRental  = ACTIVE_RENTAL.includes(booking.booking_status);
  const isPaid = booking.payment_status === "paid" && PAID_STATUSES.includes(booking.booking_status);

  const pickupDone  = booking.pickup_photos?.length > 0;
  const dropoffDone = booking.return_exterior_photos?.length > 0;

  // Fetch vehicle details to get pickup_address and pickup_hours
  const { data: vehicle } = useQuery({
    queryKey: ["vehicle-pickup", booking.vehicle_id],
    queryFn: () => base44.entities.Vehicle.filter({ id: booking.vehicle_id }).then(r => r[0]),
    enabled: !!booking.vehicle_id && isPaid,
    staleTime: 5 * 60_000,
  });

  const inner = (
    <div className="relative bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
      {/* Vehicle image — top, full bleed */}
      {booking.vehicle_image ? (
        <div className="relative h-48 overflow-hidden">
          <img src={booking.vehicle_image} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.6) 100%)" }} />
          {/* Title overlay on image */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
            <p className="text-white font-black text-lg leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
              {booking.vehicle_name || "Vehicle"}
            </p>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {booking.city && (
                <span className="flex items-center gap-1 text-white/70 text-xs">
                  <MapPin className="h-3 w-3" />{booking.city}
                </span>
              )}
              {booking.start_date && (
                <span className="flex items-center gap-1 text-white/70 text-xs">
                  <Clock className="h-3 w-3" />{format(new Date(booking.start_date), "MMM d, yyyy")}
                </span>
              )}
            </div>
          </div>
          <div className="absolute top-3 right-3">
            <StatusBadge status={booking.booking_status} />
          </div>
        </div>
      ) : (
        /* No image — plain header */
        <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-gray-900 font-black text-lg leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
              {booking.vehicle_name || "Vehicle"}
            </p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {booking.city && <span className="flex items-center gap-1 text-gray-400 text-xs"><MapPin className="h-3 w-3" />{booking.city}</span>}
              {booking.start_date && <span className="flex items-center gap-1 text-gray-400 text-xs"><Clock className="h-3 w-3" />{format(new Date(booking.start_date), "MMM d, yyyy")}</span>}
            </div>
          </div>
          <StatusBadge status={booking.booking_status} />
        </div>
      )}

      <div className="px-4 pb-4 pt-0 space-y-3">
        {/* Payment due */}
        {booking.total_due_now && booking.booking_status === "pending_payment" && (
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-orange-50 border border-orange-100">
            <span className="text-xs text-orange-700 font-semibold">Payment due</span>
            <span className="text-sm font-bold text-orange-700">${booking.total_due_now}</span>
          </div>
        )}

        {/* Pickup Address — revealed after payment */}
        {isPaid && vehicle?.pickup_address && (
          <PickupAddressCard vehicle={vehicle} />
        )}

        {/* Billing info for active rentals */}
        {isActiveRental && booking.next_billing_date && (
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
            <span className="text-xs text-gray-500 font-semibold">Next billing</span>
            <span className="text-xs font-bold text-gray-700">{format(new Date(booking.next_billing_date), "MMM d, yyyy")}</span>
          </div>
        )}

        {/* Cancel pending notice */}
        {isCancelPending && (
          <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-100">
            <p className="text-[11px] text-red-600 font-semibold">Cancellation pending admin review</p>
          </div>
        )}

        {/* View Signed Agreement — only for active/approved/confirmed with signed contract */}
        {isActiveRental && booking.contract_status === "signed" && booking.contract_html && (
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onViewContract(booking); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-bold text-blue-600 bg-blue-50 border-blue-200 active:scale-[0.98] transition-transform"
          >
            <Shield className="h-4 w-4" />
            View Signed Agreement
          </button>
        )}

        {/* Resume CTA */}
        {isResumable && (
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.07), hsl(265 80% 62% / 0.07))", borderColor: "hsl(338 90% 56% / 0.2)" }}>
            <span className="text-xs font-bold" style={{ color: "hsl(338 90% 48%)" }}>
              {booking.booking_status === "pending_payment" ? "Complete Payment" : "Continue Booking"}
            </span>
            <ChevronRight className="h-4 w-4" style={{ color: "hsl(338 90% 48%)" }} />
          </div>
        )}

        {/* Inspection rows */}
        {showInspection && (
          <div className="space-y-2 border-t border-gray-100 pt-3">
            {/* Pickup */}
            {pickupDone ? (
              <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onInspect(booking, "pickup"); }}
                className="w-full text-left rounded-xl overflow-hidden border border-green-200 bg-green-50 active:scale-[0.98] transition-transform">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-[11px] font-bold text-green-700">Pickup Photos — View</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-green-400" />
                </div>
              </button>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onInspect(booking, "pickup"); }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-white active:scale-[0.98] transition-transform"
                style={{ background: "linear-gradient(135deg, hsl(199 90% 40%), hsl(265 80% 50%))" }}>
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  <span className="text-xs font-bold">Pickup Inspection</span>
                </div>
                <ChevronRight className="h-4 w-4 opacity-70" />
              </button>
            )}

            {/* Drop-off */}
            {dropoffDone ? (
              <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onInspect(booking, "dropoff"); }}
                className="w-full text-left rounded-xl overflow-hidden border border-green-200 bg-green-50 active:scale-[0.98] transition-transform">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-[11px] font-bold text-green-700">Drop-off Photos — View</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-green-400" />
                </div>
              </button>
            ) : !pickupDone ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 opacity-60">
                <Camera className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-[11px] font-semibold text-gray-400">Drop-off (complete pickup first)</span>
              </div>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onInspect(booking, "dropoff"); }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-white active:scale-[0.98] transition-transform"
                style={{ background: "linear-gradient(135deg, hsl(38 95% 45%), hsl(338 90% 50%))" }}>
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  <span className="text-xs font-bold">Drop-off Inspection — Return Vehicle</span>
                </div>
                <ChevronRight className="h-4 w-4 opacity-70" />
              </button>
            )}
          </div>
        )}

        {/* MooveTrax Telematics Controls — shown only when booking is active */}
        {isActiveRental && booking.vehicle_id && (
          <TelematicsPanel booking={booking} />
        )}

        {/* Cancel */}
        {isCancellable && (
          <button
            onClick={(e) => { e.stopPropagation(); onCancelRequest(booking); }}
            className="w-full pt-1 pb-0.5 text-[11px] font-medium text-gray-400 active:opacity-70 transition-opacity flex items-center justify-center gap-1"
          >
            <XCircle className="h-3 w-3" /> Request Cancellation
          </button>
        )}
      </div>

      {/* Delete button */}
      {isDeletable && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(booking.id); }}
          disabled={isDeleting}
          className="absolute top-3 left-3 h-7 w-7 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200 flex items-center justify-center z-10 shadow-sm"
        >
          {isDeleting
            ? <div className="h-3.5 w-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
            : <Trash2 className="h-3 w-3 text-red-400" />}
        </button>
      )}
    </div>
  );

  return isResumable
    ? <Link to={`/checkout?request=${booking.id}`} className="block active:scale-[0.98] transition-transform">{inner}</Link>
    : inner;
}