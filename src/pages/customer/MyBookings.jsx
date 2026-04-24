import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, Link } from "react-router-dom";
import { CalendarDays, MapPin, Clock, Car, Trash2, XCircle, Camera, CheckCircle2, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import CancelBookingSheet from "@/components/customer/CancelBookingSheet";
import VehicleInspectionSheet from "@/components/customer/VehicleInspectionSheet";

const STATUS_CONFIG = {
  confirmed:              { label: "Confirmed",       dot: "bg-green-400",  text: "text-green-400",  bg: "bg-green-400/10"  },
  active:                 { label: "Active",          dot: "bg-green-400",  text: "text-green-400",  bg: "bg-green-400/10"  },
  approved:               { label: "Approved",        dot: "bg-green-400",  text: "text-green-400",  bg: "bg-green-400/10"  },
  pending_review:         { label: "Under Review",    dot: "bg-yellow-400", text: "text-yellow-400", bg: "bg-yellow-400/10" },
  pending_payment:        { label: "Payment Due",     dot: "bg-orange-400", text: "text-orange-400", bg: "bg-orange-400/10" },
  pending_verification:   { label: "Verifying",       dot: "bg-blue-400",   text: "text-blue-400",   bg: "bg-blue-400/10"   },
  pending_contract:       { label: "Contract Needed", dot: "bg-purple-400", text: "text-purple-400", bg: "bg-purple-400/10" },
  draft:                  { label: "Draft",           dot: "bg-gray-400",   text: "text-gray-400",   bg: "bg-gray-400/10"   },
  completed:              { label: "Completed",       dot: "bg-gray-500",   text: "text-gray-500",   bg: "bg-gray-500/10"   },
  cancelled:              { label: "Cancelled",       dot: "bg-red-400",    text: "text-red-400",    bg: "bg-red-400/10"    },
  cancellation_requested: { label: "Cancel Pending",  dot: "bg-red-400",    text: "text-red-400",    bg: "bg-red-400/10"    },
};

const DELETABLE_STATUSES = ["draft", "pending_verification", "pending_contract"];
const CANCELLABLE_STATUSES = ["pending_payment", "pending_review", "approved", "confirmed", "active"];

const STATUS_PRIORITY = {
  active: 7, confirmed: 6, approved: 6, pending_review: 5, pending_payment: 4,
  pending_contract: 3, pending_verification: 2, draft: 1, completed: 0, cancelled: 0,
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, dot: "bg-gray-400", text: "text-gray-400", bg: "bg-gray-400/10" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
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
    <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
      {/* Pickup */}
      {predoneDone ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-green-400">Pickup photos submitted</span>
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
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-green-400">Drop-off photos submitted</span>
        </div>
      ) : !predoneDone ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 opacity-50 cursor-not-allowed">
          <Camera className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[11px] font-semibold text-gray-400">Drop-off (complete pickup first)</span>
        </div>
      ) : !rentalExpired ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 opacity-50 cursor-not-allowed">
          <Camera className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[11px] font-semibold text-gray-400">
            Drop-off available {endDate ? format(endDate, "MMM d") : "at return"}
          </span>
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onInspect(booking, "dropoff"); }}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-white active:scale-[0.98] transition-transform"
          style={{ background: "linear-gradient(135deg, hsl(38 95% 40%), hsl(338 90% 45%))" }}
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
    <div className="relative rounded-2xl overflow-hidden"
      style={{ background: "linear-gradient(145deg, hsl(222 24% 13%), hsl(222 24% 10%))", border: "1px solid hsl(222 18% 20%)" }}>

      {/* Vehicle image with gradient overlay */}
      {booking.vehicle_image && (
        <div className="relative h-36 overflow-hidden">
          <img src={booking.vehicle_image} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(15,18,28,0.85) 100%)" }} />
          {/* Status badge on image */}
          <div className="absolute top-3 right-3">
            <StatusBadge status={booking.booking_status} />
          </div>
          {/* Vehicle name on image */}
          <div className="absolute bottom-3 left-4">
            <p className="text-white font-bold text-base leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
              {booking.vehicle_name || "Vehicle"}
            </p>
            <div className="flex items-center gap-3 mt-0.5">
              {booking.city && (
                <span className="flex items-center gap-1 text-white/60 text-[10px]">
                  <MapPin className="h-2.5 w-2.5" />{booking.city}
                </span>
              )}
              {booking.start_date && (
                <span className="flex items-center gap-1 text-white/60 text-[10px]">
                  <Clock className="h-2.5 w-2.5" />{format(new Date(booking.start_date), "MMM d")}
                </span>
              )}
              <span className="text-white/50 text-[10px] font-semibold">{booking.booking_type}</span>
            </div>
          </div>
        </div>
      )}

      {/* No image fallback */}
      {!booking.vehicle_image && (
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-base" style={{ fontFamily: "var(--font-syne)" }}>
              {booking.vehicle_name || "Vehicle"}
            </p>
            <div className="flex items-center gap-3 mt-0.5">
              {booking.city && <span className="flex items-center gap-1 text-white/50 text-[10px]"><MapPin className="h-2.5 w-2.5" />{booking.city}</span>}
              <span className="text-white/40 text-[10px]">{booking.booking_type}</span>
            </div>
          </div>
          <StatusBadge status={booking.booking_status} />
        </div>
      )}

      {/* Body */}
      <div className="px-4 pb-4 pt-2">
        {/* Payment due */}
        {booking.total_due_now && booking.booking_status === "pending_payment" && (
          <div className="mb-3 flex items-center justify-between px-3 py-2 rounded-xl"
            style={{ background: "hsl(38 95% 54% / 0.12)", border: "1px solid hsl(38 95% 54% / 0.2)" }}>
            <span className="text-xs text-warning font-semibold">Payment due</span>
            <span className="text-sm font-bold text-warning">${booking.total_due_now}</span>
          </div>
        )}

        {/* Cancellation pending */}
        {isCancelPending && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-[11px] text-red-400 font-semibold">Cancellation pending admin review</p>
          </div>
        )}

        {/* Resume CTA */}
        {isResumable && (
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.2), hsl(265 80% 62% / 0.15))", border: "1px solid hsl(338 90% 56% / 0.25)" }}>
            <span className="text-xs font-bold text-primary">
              {booking.booking_status === "pending_payment" ? "Complete Payment" : "Continue Booking"}
            </span>
            <ChevronRight className="h-4 w-4 text-primary" />
          </div>
        )}

        {/* Inspection rows */}
        {showInspection && <InspectionRow booking={booking} onInspect={onInspect} />}

        {/* Cancel */}
        {isCancellable && (
          <button
            onClick={(e) => { e.stopPropagation(); onCancelRequest(booking); }}
            className="mt-3 w-full py-2 rounded-xl text-[11px] font-bold text-red-400 border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1.5"
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
          className="absolute top-3 left-3 h-7 w-7 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center z-10 disabled:opacity-50"
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
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <CalendarDays className="h-7 w-7 text-primary" />
        </div>
        <h3 className="font-bold text-white text-lg">Sign in to see bookings</h3>
        <p className="text-white/40 text-sm mt-2">Your active and past rentals will appear here.</p>
        <button onClick={() => base44.auth.redirectToLogin(window.location.href)}
          className="mt-5 px-6 py-2.5 rounded-xl font-bold text-sm text-white gradient-primary">
          Sign In
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-6 space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-48 rounded-2xl animate-pulse" style={{ background: "hsl(222 24% 13%)" }} />)}
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
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Car className="h-7 w-7 text-primary" />
        </div>
        <h3 className="font-bold text-white text-lg">No bookings yet</h3>
        <p className="text-white/40 text-sm mt-2">Ready to hit the road? Book your first rental.</p>
        <Link to="/checkout" className="mt-5 px-6 py-2.5 rounded-xl font-bold text-sm text-white gradient-primary">
          Book Now
        </Link>
      </div>
    );
  }

  const handleDelete = (id) => {
    if (confirm("Remove this booking?")) deleteMutation.mutate(id);
  };

  const SectionLabel = ({ children }) => (
    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3">{children}</p>
  );

  return (
    <div className="px-4 py-5 pb-28">
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