import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOutletContext, Link, useParams } from "react-router-dom";
import { CalendarDays, Car } from "lucide-react";

import CancelBookingSheet from "@/components/customer/CancelBookingSheet";
import VehicleInspectionSheet from "@/components/customer/VehicleInspectionSheet";
import BookingTabs from "@/components/customer/mybookings/BookingTabs";
import ActiveRentalCard from "@/components/customer/mybookings/ActiveRentalCard";
import PastRentalCard from "@/components/customer/mybookings/PastRentalCard";
import ContractModal from "@/components/customer/mybookings/ContractModal";
import ReviewCompletionNudge from "@/components/customer/mybookings/ReviewCompletionNudge";
import InspectionCompletionNudge from "@/components/customer/mybookings/InspectionCompletionNudge";

const STATUS_PRIORITY = {
  active: 7, confirmed: 6, approved: 6, pending_review: 5, pending_payment: 4,
  pending_contract: 3, pending_verification: 2, draft: 1, completed: 0, cancelled: 0,
};

const ACTIVE_STATUSES = [
  "active", "confirmed", "approved", "pending_review", "pending_payment",
  "pending_verification", "pending_contract", "cancellation_requested", "return_pending_host_review", "under_review", "draft",
];
const PAST_STATUSES = ["completed", "cancelled"];

export default function MyBookings() {
  const { user, brand } = useOutletContext() || {};
  const { businessSlug } = useParams();
  const homeHref = businessSlug ? `/host/${businessSlug}` : "/book-now";
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("active");
  const [cancelTarget, setCancelTarget] = useState(null);
  const [inspectionTarget, setInspectionTarget] = useState(null);
  const [contractBooking, setContractBooking] = useState(null);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["my-booking-requests", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["my-host-reviews", user?.email],
    queryFn: () => base44.entities.HostReview.filter({ reviewer_email: user?.email }),
    enabled: !!user?.email,
  });
  const reviewMap = Object.fromEntries(reviews.map((r) => [r.booking_request_id, r]));

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

  // Deduplicate by vehicle (keep highest priority status per vehicle)
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

  const activeBookings = deduplicated.filter((b) => ACTIVE_STATUSES.includes(b.booking_status));
  const pastBookings   = deduplicated.filter((b) => PAST_STATUSES.includes(b.booking_status))
    .sort((a, b) => new Date(b.rental_ended_at || b.updated_date) - new Date(a.rental_ended_at || a.updated_date));
  const pendingReviewBookings = pastBookings.filter((b) => b.booking_status === "completed" && !reviewMap[b.id]);
  const missingInspectionBookings = activeBookings.filter((b) =>
    ["active", "confirmed", "approved"].includes(b.booking_status) &&
    (!b.pickup_photos?.length || (b.rental_ended_at && !b.return_exterior_photos?.length && !b.return_interior_photos?.length))
  );

  const handleDelete = (id) => {
    if (confirm("Remove this booking?")) deleteMutation.mutate(id);
  };

  return (
    <div className="min-h-screen pb-28" style={{ background: "#f8f8fa" }}>
      {/* Modals */}
      {cancelTarget && <CancelBookingSheet booking={cancelTarget} onClose={() => setCancelTarget(null)} />}
      {inspectionTarget && (
        <VehicleInspectionSheet
          booking={inspectionTarget.booking}
          type={inspectionTarget.type}
          onClose={() => setInspectionTarget(null)}
        />
      )}
      {contractBooking && (
        <ContractModal booking={contractBooking} onClose={() => setContractBooking(null)} />
      )}

      {/* Tabs */}
      <BookingTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeCount={activeBookings.length}
        pastCount={pastBookings.length}
        brandColor={brand?.brand_color}
        secondaryColor={brand?.secondary_color}
      />

      <div className="px-5 py-4">
        {activeTab === "active" && (
          <InspectionCompletionNudge
            missingCount={missingInspectionBookings.length}
            onOpenFirst={() => {
              const target = missingInspectionBookings[0];
              if (target) setInspectionTarget({ booking: target, type: target.pickup_photos?.length ? "dropoff" : "pickup" });
            }}
          />
        )}
        {activeTab === "past" && (
          <ReviewCompletionNudge pendingCount={pendingReviewBookings.length} onOpenPast={() => setActiveTab("past")} />
        )}
        {/* Active Tab */}
        {activeTab === "active" && (
          activeBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="relative inline-flex mb-5">
                <div className="h-20 w-20 rounded-3xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                  <Car className="h-9 w-9 text-white" />
                </div>
                <div className="absolute inset-0 rounded-3xl blur-2xl opacity-25"
                  style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} />
              </div>
              <h3 className="font-black text-gray-900 text-xl mb-2" style={{ fontFamily: "var(--font-syne)" }}>No active rentals</h3>
              <p className="text-gray-400 text-sm">Ready to hit the road? Find your perfect vehicle.</p>
              <Link to={homeHref} className="mt-6 px-8 py-3.5 rounded-2xl font-bold text-sm text-white shadow-lg"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                Browse Cars
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activeBookings.map((b) => (
                <ActiveRentalCard
                  key={b.id}
                  booking={b}
                  onDelete={handleDelete}
                  onCancelRequest={setCancelTarget}
                  onInspect={(booking, type) => setInspectionTarget({ booking, type })}
                  onViewContract={setContractBooking}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === b.id}
                />
              ))}
            </div>
          )
        )}

        {/* Past Tab */}
        {activeTab === "past" && (
          pastBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <CalendarDays className="h-7 w-7 text-gray-400" />
              </div>
              <h3 className="font-bold text-gray-900 text-lg">No past rentals</h3>
              <p className="text-gray-400 text-sm mt-2">Your completed rentals will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pastBookings.map((b) => (
                <PastRentalCard
                  key={b.id}
                  booking={b}
                  user={user}
                  existingReview={reviewMap[b.id]}
                  onReviewSubmitted={() => queryClient.invalidateQueries({ queryKey: ["my-host-reviews", user?.email] })}
                  onViewContract={setContractBooking}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}