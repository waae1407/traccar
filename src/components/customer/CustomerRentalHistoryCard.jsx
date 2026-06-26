import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Car, Calendar, CheckCircle2, ChevronRight, Clock } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { format, isValid, differenceInDays } from "date-fns";

function safeDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isValid(d) ? d : null;
}

const STATUS_LABELS = {
  completed: { label: "Completed", color: "text-green-500", bg: "bg-green-50" },
  active: { label: "Active", color: "text-blue-500", bg: "bg-blue-50" },
  checked_out: { label: "Checked Out", color: "text-blue-500", bg: "bg-blue-50" },
  return_required: { label: "Return Required", color: "text-amber-500", bg: "bg-amber-50" },
  return_pending_host_review: { label: "Return Pending", color: "text-amber-500", bg: "bg-amber-50" },
  cancelled: { label: "Cancelled", color: "text-gray-400", bg: "bg-gray-50" },
  confirmed: { label: "Confirmed", color: "text-blue-500", bg: "bg-blue-50" },
};

export default function CustomerRentalHistoryCard({ user, brandColor }) {
  const navigate = useNavigate();
  const { businessSlug } = useParams();
  const bookingsPath = businessSlug ? `/host/${businessSlug}/bookings` : "/my-bookings";

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["account-rental-history", user?.email],
    queryFn: async () => {
      const all = await base44.entities.BookingRequest.list("-created_date", 50);
      return all.filter(
        (b) => b.user_email === user.email || b.created_by === user.email
      );
    },
    enabled: !!user?.email,
  });

  // Past rentals = completed + cancelled (exclude superseded)
  const pastRentals = bookings
    .filter(
      (b) =>
        !b.is_superseded &&
        ["completed", "cancelled", "return_pending_host_review", "return_required"].includes(
          b.booking_status
        )
    )
    .sort(
      (a, b) =>
        safeDate(b.rental_ended_at || b.updated_date)?.getTime() -
        safeDate(a.rental_ended_at || a.updated_date)?.getTime()
    );

  const completedCount = pastRentals.filter(
    (b) => b.booking_status === "completed"
  ).length;

  const lifetimeDays = pastRentals.reduce((sum, b) => {
    const start = safeDate(b.start_date);
    const end = safeDate(b.rental_ended_at) || safeDate(b.end_date);
    if (!start || !end) return sum;
    return sum + Math.max(0, differenceInDays(end, start));
  }, 0);

  if (isLoading) {
    return (
      <div className="px-5 mb-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Rental History</p>
        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm animate-pulse">
          <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
          <div className="h-16 bg-gray-50 rounded-xl" />
        </div>
      </div>
    );
  }

  if (pastRentals.length === 0) {
    return null;
  }

  return (
    <div className="px-5 mb-4">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Rental History</p>
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="px-4 py-4 text-center">
            <p className="text-2xl font-black text-gray-900">{pastRentals.length}</p>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Past Rentals</p>
          </div>
          <div className="px-4 py-4 text-center">
            <p className="text-2xl font-black text-green-500">{completedCount}</p>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Completed</p>
          </div>
          <div className="px-4 py-4 text-center">
            <p className="text-2xl font-black" style={{ color: brandColor }}>{lifetimeDays}</p>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5">Days Rented</p>
          </div>
        </div>

        {/* Recent rentals list */}
        <div className="border-t border-gray-100">
          <div className="px-5 py-2.5 flex items-center justify-between bg-gray-50/50">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recent Rentals</p>
          </div>
          {pastRentals.slice(0, 3).map((rental, idx) => {
            const statusInfo = STATUS_LABELS[rental.booking_status] || {
              label: rental.booking_status,
              color: "text-gray-400",
              bg: "bg-gray-50",
            };
            const startDate = safeDate(rental.start_date);
            const endDate = safeDate(rental.rental_ended_at) || safeDate(rental.end_date);
            return (
              <button
                key={rental.id}
                onClick={() => navigate(bookingsPath)}
                className={`w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left ${
                  idx < Math.min(3, pastRentals.length) - 1 ? "border-b border-gray-100" : ""
                }`}>
                <div className="h-9 w-9 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${brandColor}14` }}>
                  {rental.booking_status === "completed" ? (
                    <CheckCircle2 className="h-4 w-4" style={{ color: brandColor }} />
                  ) : (
                    <Car className="h-4 w-4" style={{ color: brandColor }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{rental.vehicle_name || "Vehicle"}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3 w-3" />
                    {startDate ? format(startDate, "MMM d, yyyy") : "—"}
                    {endDate ? ` → ${format(endDate, "MMM d, yyyy")}` : ""}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${statusInfo.bg} ${statusInfo.color} flex-shrink-0`}>
                  {statusInfo.label}
                </span>
                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
              </button>
            );
          })}
        </div>

        {/* View all */}
        {pastRentals.length > 3 && (
          <button
            onClick={() => navigate(bookingsPath)}
            className="w-full flex items-center justify-center gap-1 py-3 text-xs font-bold uppercase tracking-wide text-gray-500 hover:bg-gray-50 border-t border-gray-100 transition-colors">
            View All {pastRentals.length} Rentals
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}