import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { ArrowRight, Car } from "lucide-react";

export default function ContinueBookingBanner({ user }) {
  const { data: drafts = [] } = useQuery({
    queryKey: ["draft-booking", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user.email, booking_status: "draft" }),
    enabled: !!user?.email,
    staleTime: 30_000,
  });

  const draft = drafts[0];
  if (!draft) return null;

  return (
    <Link to={`/checkout?request=${draft.id}`}
      className="mx-4 mt-3 flex items-center gap-3 p-3.5 rounded-2xl border border-amber-200 bg-amber-50 active:scale-[0.98] transition-transform">
      <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
        <Car className="h-4.5 w-4.5 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-amber-800 text-sm">Continue your booking</p>
        <p className="text-xs text-amber-600 truncate">{draft.vehicle_name || "Vehicle selected"} · {draft.booking_type}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-amber-500 flex-shrink-0" />
    </Link>
  );
}