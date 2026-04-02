import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { CalendarDays, MapPin, ChevronRight, Clock } from "lucide-react";
import { format } from "date-fns";
import StatusBadge from "@/components/shared/StatusBadge";

export default function MyBookings() {
  const { user } = useOutletContext() || {};

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["my-bookings", user?.email],
    queryFn: () => base44.entities.Booking.filter({ created_by: user?.email }),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
        <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <CalendarDays className="h-7 w-7 text-gray-400" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg">Sign in to see bookings</h3>
        <p className="text-gray-400 text-sm mt-2">Your active and past rentals will appear here.</p>
        <a href="/account" className="mt-5 px-6 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Sign In
        </a>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
        <div className="h-16 w-16 rounded-2xl bg-pink-50 flex items-center justify-center mb-4">
          <CalendarDays className="h-7 w-7 text-pink-400" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg">No bookings yet</h3>
        <p className="text-gray-400 text-sm mt-2">Ready to hit the road? Book your first rental.</p>
        <a href="/" className="mt-5 px-6 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Book Now
        </a>
      </div>
    );
  }

  const active = bookings.filter((b) => b.status === "Active" || b.status === "Reserved");
  const past = bookings.filter((b) => b.status === "Completed" || b.status === "Cancelled");

  const BookingRow = ({ booking }) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={booking.status} />
            <span className="text-xs text-gray-400 font-semibold uppercase">{booking.booking_type}</span>
          </div>
          <p className="font-bold text-gray-900">{booking.vehicle_name || "Vehicle"}</p>
          <div className="flex items-center gap-1 mt-1">
            <MapPin className="h-3 w-3 text-gray-400" />
            <span className="text-xs text-gray-500">{booking.pickup_location || "Pickup TBD"}</span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <Clock className="h-3 w-3 text-gray-400" />
            <span className="text-xs text-gray-500">
              {booking.start_date ? format(new Date(booking.start_date), "MMM d") : "—"}
              {booking.end_date ? ` → ${format(new Date(booking.end_date), "MMM d, yyyy")}` : ""}
            </span>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0 mt-1" />
      </div>
    </div>
  );

  return (
    <div className="px-4 py-5">
      {active.length > 0 && (
        <div className="mb-5">
          <h2 className="font-bold text-gray-900 text-base mb-3">Active</h2>
          <div className="space-y-3">
            {active.map((b) => <BookingRow key={b.id} booking={b} />)}
          </div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <h2 className="font-bold text-gray-900 text-base mb-3">Past Rentals</h2>
          <div className="space-y-3">
            {past.map((b) => <BookingRow key={b.id} booking={b} />)}
          </div>
        </div>
      )}
    </div>
  );
}