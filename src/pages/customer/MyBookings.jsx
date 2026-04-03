import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, Link } from "react-router-dom";
import { CalendarDays, MapPin, Clock, Car, Trash2 } from "lucide-react";
import { format } from "date-fns";

const statusColors = {
  confirmed: "bg-green-100 text-green-700",
  active: "bg-green-100 text-green-700",
  pending_review: "bg-yellow-100 text-yellow-700",
  pending_payment: "bg-orange-100 text-orange-700",
  draft: "bg-gray-100 text-gray-600",
  completed: "bg-gray-100 text-gray-500",
  cancelled: "bg-red-100 text-red-600",
};

const statusLabel = {
  draft: "Draft",
  pending_verification: "Verifying",
  pending_contract: "Contract Needed",
  pending_payment: "Payment Due",
  pending_review: "Under Review",
  confirmed: "Confirmed",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Statuses considered "not yet submitted" — deletable by user
const DELETABLE_STATUSES = ["draft", "pending_verification", "pending_contract", "pending_payment"];

export default function MyBookings() {
  const { user } = useOutletContext() || {};
  const queryClient = useQueryClient();

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

  // Status priority: higher = more advanced/important
  const STATUS_PRIORITY = {
    active: 7, confirmed: 6, pending_review: 5, pending_payment: 4,
    pending_contract: 3, pending_verification: 2, draft: 1,
    completed: 0, cancelled: 0,
  };

  // Deduplicate: per vehicle_id, keep the most advanced booking (highest priority, then most recent)
  const deduplicated = Object.values(
    bookings.reduce((acc, b) => {
      const key = b.vehicle_id || b.id;
      const existing = acc[key];
      const bPriority = STATUS_PRIORITY[b.booking_status] ?? 0;
      const ePriority = existing ? (STATUS_PRIORITY[existing.booking_status] ?? 0) : -1;
      if (!existing || bPriority > ePriority || (bPriority === ePriority && new Date(b.updated_date) > new Date(existing.updated_date))) {
        acc[key] = b;
      }
      return acc;
    }, {})
  );

  const active = deduplicated.filter((b) => ["active", "confirmed", "pending_review", "pending_payment", "pending_verification", "pending_contract"].includes(b.booking_status));
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
        <Link to="/" className="mt-5 px-6 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Book Now
        </Link>
      </div>
    );
  }

  const BookingCard = ({ booking }) => {
    const statusCls = statusColors[booking.booking_status] || "bg-gray-100 text-gray-500";
    const isDraft = booking.booking_status === "draft";
    const isDeletable = DELETABLE_STATUSES.includes(booking.booking_status);

    const handleDelete = (e) => {
      e.preventDefault();
      if (confirm("Remove this booking?")) {
        deleteMutation.mutate(booking.id);
      }
    };

    return (
      <div className="relative">
        <Link
          to={`/checkout?request=${booking.id}`}
          className="block bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm active:scale-[0.98] transition-transform">
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
            {isDraft && (
              <div className="mt-3 py-2.5 rounded-xl text-center text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                Continue Booking →
              </div>
            )}
            {booking.total_due_now && booking.booking_status === "pending_payment" && (
              <div className="mt-3 flex items-center justify-between p-2.5 bg-orange-50 rounded-xl">
                <span className="text-xs text-orange-700 font-semibold">Payment due</span>
                <span className="text-sm font-bold text-orange-700">${booking.total_due_now}</span>
              </div>
            )}
          </div>
        </Link>
        {isDeletable && (
          <button
            onClick={handleDelete}
            className="absolute top-3 right-3 h-7 w-7 rounded-full bg-red-50 border border-red-100 flex items-center justify-center hover:bg-red-100 transition-colors z-10"
          >
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 py-5">
      {drafts.length > 0 && (
        <div className="mb-5">
          <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wider mb-3">In Progress</h2>
          <div className="space-y-3">{drafts.map((b) => <BookingCard key={b.id} booking={b} />)}</div>
        </div>
      )}
      {active.length > 0 && (
        <div className="mb-5">
          <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wider mb-3">Active</h2>
          <div className="space-y-3">{active.map((b) => <BookingCard key={b.id} booking={b} />)}</div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wider mb-3">Past Rentals</h2>
          <div className="space-y-3">{past.map((b) => <BookingCard key={b.id} booking={b} />)}</div>
        </div>
      )}
    </div>
  );
}