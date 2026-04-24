import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, Link } from "react-router-dom";
import { CalendarDays, MapPin, Clock, Car, Trash2, XCircle, Camera, CheckCircle2, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import CancelBookingSheet from "@/components/customer/CancelBookingSheet";
import VehicleInspectionSheet from "@/components/customer/VehicleInspectionSheet";

const STATUS_CONFIG = {
  confirmed:              { label: "✓ Confirmed",       style: { background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff" } },
  active:                 { label: "● Active",          style: { background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff" } },
  approved:               { label: "✓ Approved",        style: { background: "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff" } },
  pending_review:         { label: "⏳ Under Review",   style: { background: "linear-gradient(135deg, #d97706, #b45309)", color: "#fff" } },
  pending_payment:        { label: "💳 Payment Due",    style: { background: "linear-gradient(135deg, #ea580c, #c2410c)", color: "#fff" } },
  pending_verification:   { label: "🔍 Verifying",      style: { background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff" } },
  pending_contract:       { label: "📄 Sign Contract",  style: { background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "#fff" } },
  draft:                  { label: "Draft",              style: { background: "#e5e7eb", color: "#6b7280" } },
  completed:              { label: "Completed",          style: { background: "#e5e7eb", color: "#6b7280" } },
  cancelled:              { label: "Cancelled",          style: { background: "#fee2e2", color: "#dc2626" } },
  cancellation_requested: { label: "⏳ Cancel Pending", style: { background: "#fee2e2", color: "#dc2626" } },
};

const DELETABLE_STATUSES = ["draft", "pending_verification", "pending_contract"];
const CANCELLABLE_STATUSES = ["pending_payment", "pending_review", "approved", "confirmed", "active"];

const STATUS_PRIORITY = {
  active: 7, confirmed: 6, approved: 6, pending_review: 5, pending_payment: 4,
  pending_contract: 3, pending_verification: 2, draft: 1, completed: 0, cancelled: 0,
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, style: { background: "#e5e7eb", color: "#6b7280" } };
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold shadow-sm"
      style={cfg.style}>
      {cfg.label}
    </span>
  );
}

function InspectionRow({ booking, onInspect }) {
  const predoneDone = booking.pickup_photos?.length > 0;
  const postDone = booking.return_exterior_photos?.length > 0;
  const endDate = booking.end_date ? new Date(booking.end_date) : null;
  const rentalExpired = endDate ? new Date() >= endDate : false;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
      {/* Pickup */}
      {predoneDone ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-green-700">Pickup photos submitted</span>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onInspect(booking, "pickup"); }}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-white active:scale-[0.98] transition-transform"
          style={{ background: "linear-gradient(135deg, hsl(199 90% 40%), hsl(265 80% 50%))" }}
        >
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            <span className="text-xs font-bold">Pickup Inspection</span>
          </div>
          <ChevronRight className="h-4 w-4 opacity-70" />
        </button>
      )}

      {/* Drop-off */}
      {postDone ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-green-700">Drop-off photos submitted</span>
        </div>
      ) : !predoneDone ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 opacity-60 cursor-not-allowed">
          <Camera className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[11px] font-semibold text-gray-400">Drop-off (complete pickup first)</span>
        </div>
      ) : !rentalExpired ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 opacity-60 cursor-not-allowed">
          <Camera className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[11px] font-semibold text-gray-400">
            Drop-off available {endDate ? format(endDate, "MMM d") : "at return"}
          </span>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onInspect(booking, "dropoff"); }}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-white active:scale-[0.98] transition-transform"
          style={{ background: "linear-gradient(135deg, hsl(38 95% 45%), hsl(338 90% 50%))" }}
        >
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            <span className="text-xs font-bold">Drop-off Inspection</span>
          </div>
          <ChevronRight className="h-4 w-4 opacity-70" />
        </button>
      )}
    </div>
  );
}

function BookingCard({ booking, onDelete, onCancelRequest, isDeleting, onInspect }) {
  const isResumable = ["draft", "pending_verification", "pending_contract", "pending_payment"].includes(booking.booking_status);
  const isDeletable = DELETABLE_STATUSES.includes(booking.booking_status);
  const isCancellable = CANCELLABLE_STATUSES.includes(booking.booking_status);
  const isCancelPending = booking.booking_status === "cancellation_requested";
  const showInspection = ["active", "approved", "confirmed"].includes(booking.booking_status) && onInspect;

  const inner = (
    <div className="relative bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      {/* Vehicle header — always above image */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-gray-900 font-bold text-lg leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
            {booking.vehicle_name || "Vehicle"}
          </p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {booking.city && (
              <span className="flex items-center gap-1 text-gray-400 text-xs">
                <MapPin className="h-3 w-3" />{booking.city}
              </span>
            )}
            {booking.start_date && (
              <span className="flex items-center gap-1 text-gray-400 text-xs">
                <Clock className="h-3 w-3" />{format(new Date(booking.start_date), "MMM d, yyyy")}
              </span>
            )}
            {booking.booking_type && (
              <span className="text-xs font-semibold text-gray-400">{booking.booking_type}</span>
            )}
          </div>
        </div>
        <StatusBadge status={booking.booking_status} />
      </div>

      {/* Vehicle image */}
      {booking.vehicle_image && (
        <div className="relative h-44 overflow-hidden mx-4 rounded-xl mb-3">
          <img src={booking.vehicle_image} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Body */}
      <div className="px-4 pb-4 pt-0">
        {/* Payment due */}
        {booking.total_due_now && booking.booking_status === "pending_payment" && (
          <div className="mb-3 flex items-center justify-between px-3 py-2.5 rounded-xl bg-orange-50 border border-orange-100">
            <span className="text-xs text-orange-700 font-semibold">Payment due</span>
            <span className="text-sm font-bold text-orange-700">${booking.total_due_now}</span>
          </div>
        )}

        {/* Cancel pending */}
        {isCancelPending && (
          <div className="mb-3 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100">
            <p className="text-[11px] text-red-600 font-semibold">Cancellation pending admin review</p>
          </div>
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
        {showInspection && <InspectionRow booking={booking} onInspect={onInspect} />}

        {/* Cancel */}
        {isCancellable && (
          <button
            onClick={(e) => { e.stopPropagation(); onCancelRequest(booking); }}
            className="mt-3 w-full py-2 rounded-xl text-[11px] font-bold text-red-500 border border-red-100 bg-red-50 hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
          >
            <XCircle className="h-3.5 w-3.5" /> Request Cancellation
          </button>
        )}
      </div>

      {/* Delete button */}
      {isDeletable && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(booking.id); }}
          disabled={isDeleting}
          className="absolute top-3 left-3 h-7 w-7 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200 flex items-center justify-center z-10 shadow-sm disabled:opacity-50"
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

export default function MyBookings() {
  const { user } = useOutletContext() || {};
  const queryClient = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState(null);
  const [inspectionTarget, setInspectionTarget] = useState(null);

  const handleInspect = (booking, type) => setInspectionTarget({ booking, type });

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["my-booking-requests", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.BookingRequest.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-booking-requests", user?.email] }),
  });

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
        <div className="h-16 w-16 rounded-2xl bg-pink-50 flex items-center justify-center mb-4">
          <CalendarDays className="h-7 w-7 text-pink-400" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg">Sign in to see bookings</h3>
        <p className="text-gray-400 text-sm mt-2">Your active and past rentals will appear here.</p>
        <button onClick={() => base44.auth.redirectToLogin(window.location.href)}
          className="mt-5 px-6 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Sign In
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-6 space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-48 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    );
  }

  const deduplicated = Object.values(
    bookings.reduce((acc, b) => {
      const isDraft = b.booking_status === "draft";
      const key = isDraft ? b.id : (b.vehicle_id || b.id);
      const existing = acc[key];
      const bPriority = STATUS_PRIORITY[b.booking_status] ?? 0;
      const ePriority = existing ? (STATUS_PRIORITY[existing.booking_status] ?? 0) : -1;
      if (!existing || bPriority > ePriority || (bPriority === ePriority && new Date(b.updated_date) > new Date(existing.updated_date))) {
        acc[key] = b;
      }
      return acc;
    }, {})
  );

  const active = deduplicated.filter((b) => ["active", "confirmed", "approved", "pending_review", "pending_payment", "pending_verification", "pending_contract", "cancellation_requested"].includes(b.booking_status));
  const past = deduplicated.filter((b) => ["completed", "cancelled"].includes(b.booking_status));
  const drafts = deduplicated.filter((b) => b.booking_status === "draft");

  if (deduplicated.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
        <div className="h-16 w-16 rounded-2xl bg-pink-50 flex items-center justify-center mb-4">
          <Car className="h-7 w-7 text-pink-400" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg">No bookings yet</h3>
        <p className="text-gray-400 text-sm mt-2">Ready to hit the road? Book your first rental.</p>
        <Link to="/checkout" className="mt-5 px-6 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Book Now
        </Link>
      </div>
    );
  }

  const handleDelete = (id) => {
    if (confirm("Remove this booking?")) deleteMutation.mutate(id);
  };

  const SectionLabel = ({ children }) => (
    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">{children}</p>
  );

  return (
    <div className="px-4 py-5 pb-28 bg-gray-50 min-h-screen">
      {cancelTarget && <CancelBookingSheet booking={cancelTarget} onClose={() => setCancelTarget(null)} />}
      {inspectionTarget && (
        <VehicleInspectionSheet
          booking={inspectionTarget.booking}
          type={inspectionTarget.type}
          onClose={() => setInspectionTarget(null)}
        />
      )}

      {drafts.length > 0 && (
        <div className="mb-6">
          <SectionLabel>In Progress</SectionLabel>
          <div className="space-y-3">
            {drafts.map((b) => (
              <BookingCard key={b.id} booking={b} onDelete={handleDelete} onCancelRequest={setCancelTarget}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === b.id} />
            ))}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="mb-6">
          <SectionLabel>Active Rentals</SectionLabel>
          <div className="space-y-3">
            {active.map((b) => (
              <BookingCard key={b.id} booking={b} onDelete={handleDelete} onCancelRequest={setCancelTarget}
                onInspect={handleInspect}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === b.id} />
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <SectionLabel>Past Rentals</SectionLabel>
          <div className="space-y-3">
            {past.map((b) => (
              <BookingCard key={b.id} booking={b} onDelete={handleDelete} onCancelRequest={setCancelTarget}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === b.id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}