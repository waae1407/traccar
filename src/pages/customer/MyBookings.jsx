import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, Link } from "react-router-dom";
import { CalendarDays, MapPin, Clock, Car, Trash2, XCircle } from "lucide-react";
import { format } from "date-fns";
import CancelBookingSheet from "@/components/customer/CancelBookingSheet";

const statusColors = {
  confirmed: "bg-green-100 text-green-700",
  active: "bg-green-100 text-green-700",
  approved: "bg-green-100 text-green-700",
  pending_review: "bg-yellow-100 text-yellow-700",
  pending_payment: "bg-orange-100 text-orange-700",
  draft: "bg-gray-100 text-gray-600",
  completed: "bg-gray-100 text-gray-500",
  cancelled: "bg-red-100 text-red-600",
  cancellation_requested: "bg-red-100 text-red-600",
};

const statusLabel = {
  draft: "Draft",
  pending_verification: "Verifying",
  pending_contract: "Contract Needed",
  pending_payment: "Payment Due",
  pending_review: "Under Review",
  confirmed: "Confirmed",
  approved: "Approved",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
  cancellation_requested: "Cancel Pending",
};

const DELETABLE_STATUSES = ["draft", "pending_verification", "pending_contract"];
const CANCELLABLE_STATUSES = ["pending_payment", "pending_review", "approved", "confirmed", "active"];

const STATUS_PRIORITY = {
  active: 7, confirmed: 6, approved: 6, pending_review: 5, pending_payment: 4,
  pending_contract: 3, pending_verification: 2, draft: 1,
  completed: 0, cancelled: 0,
};

// Extracted as a top-level component to avoid remount issues
function BookingCard({ booking, onDelete, onCancelRequest, isDeleting }) {
  const statusCls = statusColors[booking.booking_status] || "bg-gray-100 text-gray-500";
  const isDraft = booking.booking_status === "draft";
  const isResumable = ["draft", "pending_verification", "pending_contract", "pending_payment"].includes(booking.booking_status);
  const isDeletable = DELETABLE_STATUSES.includes(booking.booking_status);
  const isCancellable = CANCELLABLE_STATUSES.includes(booking.booking_status);
  const isCancelPending = booking.booking_status === "cancellation_requested";

  const cardContent = (
    <>
      {booking.vehicle_image && (
        <img src={booking.vehicle_image} alt="" className="w-full h-32 object-cover" />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <p className="font-bold text-gray-900 pr-8">{booking.vehicle_name || "Vehicle"}</p>
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusCls}`}>
            {statusLabel[booking.booking_status] || booking.booking_status}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{booking.city || "—"}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />
            {booking.start_date ? format(new Date(booking.start_date), "MMM d") : "TBD"}
          </span>
          <span className="font-semibold text-gray-600">{booking.booking_type}</span>
        </div>
        {isResumable && (
          <div className="mt-3 py-2.5 rounded-xl text-center text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            {booking.booking_status === "pending_payment" ? "Complete Payment →" : "Continue Booking →"}
          </div>
        )}
        {booking.total_due_now && booking.booking_status === "pending_payment" && (
          <div className="mt-3 flex items-center justify-between p-2.5 bg-orange-50 rounded-xl">
            <span className="text-xs text-orange-700 font-semibold">Payment due</span>
            <span className="text-sm font-bold text-orange-700">${booking.total_due_now}</span>
          </div>
        )}
        {isCancelPending && (
          <div className="mt-3 p-2.5 bg-red-50 rounded-xl">
            <p className="text-xs text-red-600 font-semibold">Cancellation request pending admin review</p>
          </div>
        )}
        {isCancellable && (
          <button
            onClick={(e) => { e.stopPropagation(); onCancelRequest(booking); }}
            className="mt-3 w-full py-2 rounded-xl text-xs font-bold text-red-500 border border-red-100 bg-red-50 hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
          >
            <XCircle className="h-3.5 w-3.5" /> Request Cancellation
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="relative">
      {isResumable ? (
        <Link to={`/checkout?request=${booking.id}`}
          className="block bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm active:scale-[0.98] transition-transform">
          {cardContent}
        </Link>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {cardContent}
        </div>
      )}
      {isDeletable && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(booking.id); }}
          disabled={isDeleting}
          className="absolute top-3 right-3 h-7 w-7 rounded-full bg-red-50 border border-red-100 flex items-center justify-center hover:bg-red-100 transition-colors z-10 disabled:opacity-50"
        >
          {isDeleting
            ? <div className="h-3.5 w-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
            : <Trash2 className="h-3.5 w-3.5 text-red-500" />}
        </button>
      )}
    </div>
  );
}

export default function MyBookings() {
  const { user } = useOutletContext() || {};
  const queryClient = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState(null);

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
        <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <CalendarDays className="h-7 w-7 text-gray-400" />
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
        {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
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
    if (confirm("Remove this booking?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="px-4 py-5">
      {cancelTarget && (
        <CancelBookingSheet booking={cancelTarget} onClose={() => setCancelTarget(null)} />
      )}
      {drafts.length > 0 && (
        <div className="mb-5">
          <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wider mb-3">In Progress</h2>
          <div className="space-y-3">
            {drafts.map((b) => (
              <BookingCard key={b.id} booking={b}
                onDelete={handleDelete}
                onCancelRequest={setCancelTarget}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === b.id}
              />
            ))}
          </div>
        </div>
      )}
      {active.length > 0 && (
        <div className="mb-5">
          <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wider mb-3">Active</h2>
          <div className="space-y-3">
            {active.map((b) => (
              <BookingCard key={b.id} booking={b}
                onDelete={handleDelete}
                onCancelRequest={setCancelTarget}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === b.id}
              />
            ))}
          </div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wider mb-3">Past Rentals</h2>
          <div className="space-y-3">
            {past.map((b) => (
              <BookingCard key={b.id} booking={b}
                onDelete={handleDelete}
                onCancelRequest={setCancelTarget}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === b.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}