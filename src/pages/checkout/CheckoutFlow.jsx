import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import CheckoutProgress from "@/components/checkout/CheckoutProgress";
import StepVehicle from "@/components/checkout/StepVehicle";
import StepAccount from "@/components/checkout/StepAccount";
import StepProfile from "@/components/checkout/StepProfile";
import StepVerification from "@/components/checkout/StepVerification";
import StepTerms from "@/components/checkout/StepTerms";
import StepContract from "@/components/checkout/StepContract";
import StepPayment from "@/components/checkout/StepPayment.jsx";

import StepConfirmation from "@/components/checkout/StepConfirmation";
import { ArrowLeft } from "lucide-react";

const STEPS = ["select_vehicle", "account", "profile", "verification", "terms", "contract", "payment", "confirmation"];
const STEP_LABELS = ["Vehicle", "Account", "Profile", "Verify", "Terms", "Contract", "Pay", "Done"];

export default function CheckoutFlow() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const vehicleId = searchParams.get("vehicle");
  const bookingType = searchParams.get("type") || "Weekly";
  const requestId = searchParams.get("request");
  const companySlug = searchParams.get("company");
  const refCode = searchParams.get("ref");

  // Resolve company_id from slug param or user's company_id
  const { data: companyBySlug } = useQuery({
    queryKey: ["company-by-slug", companySlug],
    queryFn: async () => {
      const results = await base44.entities.Company.filter({ slug: companySlug });
      return results[0] || null;
    },
    enabled: !!companySlug,
  });
  const bookingCompanyId = companyBySlug?.id || user?.company_id || null;

  const [booking, setBooking] = useState(null);
  const [currentStep, setCurrentStep] = useState("select_vehicle");
  const [complianceError, setComplianceError] = useState(null);
  // Track whether we've done the initial hydration from the DB so we never override currentStep again
  const initializedRef = React.useRef(false);

  // Load or create draft booking
  const { data: existingRequest, isLoading: loadingRequest } = useQuery({
    queryKey: ["booking-request", requestId],
    queryFn: () => base44.entities.BookingRequest.filter({ id: requestId }),
    enabled: !!requestId,
    select: (data) => data[0],
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles-public"],
    queryFn: () => base44.entities.Vehicle.list(),
    staleTime: 60_000,
  });

  const selectedVehicle = vehicles.find((v) => v.id === (booking?.vehicle_id || vehicleId));

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.BookingRequest.create(data),
    onSuccess: (created) => {
      setBooking(created);
      const url = new URL(window.location.href);
      url.searchParams.set("request", created.id);
      window.history.replaceState({}, "", url.toString());
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BookingRequest.update(id, data),
    onSuccess: (updated) => {
      // Only update local state — do NOT invalidate booking-request query or it re-fetches
      // and the useEffect would reset currentStep back to the DB value (causing loops)
      setBooking(updated);
    },
  });

  // Fetch user's previous booking requests for data pre-population AND duplicate detection
  // NOTE: must be enabled even when requestId exists (resuming a booking still needs prefill data)
  const { data: previousBookings = [] } = useQuery({
    queryKey: ["previous-booking-requests", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user?.email }),
    enabled: !!user?.email,
    select: (data) =>
      [...data]
        .filter((b) => b.customer_full_name)
        .sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date)),
  });

  // Find the most recently verified booking to use for pre-fill (excluding current booking being edited)
  const recentVerifiedBooking = previousBookings.find(
    (b) => b.verification_status === "verified" && b.id !== booking?.id
  );

  // Statuses that TRULY block — user has a paid/approved/active rental, needs explicit cancellation
  const HARD_BLOCK_STATUSES = ["approved", "confirmed", "active"];
  // Statuses that are stale/pre-payment — can be auto-cancelled when user starts fresh
  // NOTE: "draft" and "pending_payment" are intentionally excluded — handled separately in onSelect only
  const STALE_STATUSES = ["pending_verification", "pending_contract", "pending_review", "under_review"];

  // Check if user already has another active booking (not the current one being resumed)
  const { data: allUserBookings = [], refetch: refetchAllBookings } = useQuery({
    queryKey: ["all-user-bookings", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const hardBlockingBooking = allUserBookings.find(
    (b) => HARD_BLOCK_STATUSES.includes(b.booking_status) && b.id !== booking?.id && b.id !== requestId
  );

  const staleBookings = allUserBookings.filter(
    (b) => STALE_STATUSES.includes(b.booking_status) && b.id !== booking?.id && b.id !== requestId
  );

  // Auto-cancel stale bookings so the user can proceed with a fresh one
  const cancelStaleMutation = useMutation({
    mutationFn: (id) => base44.entities.BookingRequest.update(id, {
      booking_status: "cancelled",
      admin_notes: "Auto-cancelled: stale booking superseded by new booking",
    }),
  });

  // Initialize — only hydrate step from DB on the FIRST load, never again
  useEffect(() => {
    if (existingRequest && !initializedRef.current) {
      initializedRef.current = true;
      setBooking(existingRequest);
      // If booking is cancelled/completed, don't resume it — send to vehicle selection
      const terminalStatuses = ["cancelled", "completed", "rejected"];
      if (terminalStatuses.includes(existingRequest.booking_status)) {
        setCurrentStep("select_vehicle");
      } else if (existingRequest.booking_status === "pending_payment") {
        // Always resume at payment step for pending_payment bookings
        setCurrentStep("payment");
      } else {
        setCurrentStep(existingRequest.checkout_step || "select_vehicle");
      }
    }
  }, [existingRequest]);

  const saveAndAdvance = (stepData, nextStep) => {
    if (booking?.id) {
      updateMutation.mutate({
        id: booking.id,
        data: { ...stepData, checkout_step: nextStep },
      });
    }
    setCurrentStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Called by StepPayment after Stripe confirms — bypasses saveAndAdvance to avoid re-render loops
  const onPaymentSuccess = (updateData) => {
    if (booking?.id) {
      updateMutation.mutate({ id: booking.id, data: { ...updateData, checkout_step: "confirmation" } });
    }
    setCurrentStep("confirmation");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const stepIndex = STEPS.indexOf(currentStep);

  if (loadingRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Block starting a NEW booking only if user has a genuinely active/paid rental
  if (user && !requestId && hardBlockingBooking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <div className="h-14 w-14 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="font-bold text-gray-900 text-lg mb-2">Active Booking In Progress</h2>
          <p className="text-gray-500 text-sm mb-5">
            You already have an active rental for <strong>{hardBlockingBooking.vehicle_name || "a vehicle"}</strong>.
            Please contact support or request a cancellation before booking a new vehicle.
          </p>
          <a
            href={`/checkout?request=${hardBlockingBooking.id}`}
            className="block w-full py-3 rounded-xl font-bold text-sm text-white text-center"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
          >
            View My Booking
          </a>
          <a href="/" className="block w-full mt-2 py-3 rounded-xl font-bold text-sm text-gray-500 border border-gray-200 text-center">
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  const commonProps = { booking, vehicle: selectedVehicle, user, saveAndAdvance, updateMutation };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => stepIndex > 0 ? setCurrentStep(STEPS[stepIndex - 1]) : navigate("/", { replace: true })}
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </button>
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-sm">Book Your Ride</p>
            <p className="text-xs text-gray-400">{booking?.vehicle_name || "Complete your booking"}</p>
          </div>
          <span className="text-xs font-semibold text-gray-400">{stepIndex + 1}/{STEPS.length}</span>
        </div>
        <CheckoutProgress steps={STEP_LABELS} currentIndex={stepIndex} />
      </div>

      <div className="max-w-lg mx-auto px-4 py-5">
        {complianceError && currentStep === "select_vehicle" && (
          <div className="mb-4 p-4 rounded-2xl border border-red-200 bg-red-50 flex items-start gap-3">
            <span className="text-red-500 text-lg flex-shrink-0">⚠️</span>
            <div>
              <p className="text-sm font-bold text-red-900">Vehicle Unavailable</p>
              <p className="text-xs text-red-700 mt-0.5">{complianceError}</p>
            </div>
            <button onClick={() => setComplianceError(null)} className="ml-auto text-red-400 hover:text-red-600 text-xs">✕</button>
          </div>
        )}
        {currentStep === "select_vehicle" && <StepVehicle {...commonProps} vehicleId={vehicleId} bookingType={bookingType} vehicles={vehicles} onSelect={async (v, type, opts = {}) => {
          if (!user) {
            // Redirect to login, then come back to checkout with vehicle pre-selected
            base44.auth.redirectToLogin(`/checkout?vehicle=${v.id}&type=${type}`);
            return;
          }
          if (hardBlockingBooking) return;

          // Compliance check — block booking if vehicle has expired/missing docs
          try {
            const compRes = await base44.functions.invoke("validateVehicleBooking", { vehicle_id: v.id });
            if (compRes.data?.blocked) {
              setComplianceError(compRes.data.reason || "This vehicle is temporarily unavailable.");
              return;
            }
          } catch (e) {
            console.warn("[ComplianceCheck] Failed:", e);
          }
          setComplianceError(null);

          // Auto-cancel any stale/draft bookings before creating the new one
          const allStaleToCancel = allUserBookings.filter(
            (b) => [...STALE_STATUSES, "draft", "pending_payment"].includes(b.booking_status) && b.id !== booking?.id && b.id !== requestId
          );
          await Promise.all(allStaleToCancel.map((b) => cancelStaleMutation.mutateAsync(b.id)));
          // Use mutateAsync so we await the creation before advancing
          await createMutation.mutateAsync({
            vehicle_id: v.id, vehicle_name: `${v.year} ${v.make} ${v.model}`,
            vehicle_image: v.image_url, booking_type: type, city: v.city || v.current_city,
            weekly_rate: v.weekly_rate, deposit_amount: 0,
            first_payment_amount: v.weekly_rate || 0, total_due_now: v.weekly_rate || 0,
            booking_status: "draft", checkout_step: "account", user_email: user?.email, user_id: user?.id,
            ...(refCode && { referral_code: refCode }),
            ...(bookingCompanyId && { company_id: bookingCompanyId }),
            ...(opts.startDate && { start_date: opts.startDate }),
            ...(opts.endDate && { end_date: opts.endDate }),
            ...(typeof opts.autoRenew !== "undefined" && { auto_renew: opts.autoRenew }),
          });
          setCurrentStep("account");
        }} />}

        {/* Referral banner */}
        {booking?.referral_code && currentStep !== "confirmation" && (
          <div className="mb-4 px-4 py-3 rounded-2xl border border-green-300/40 text-sm font-semibold text-green-700 flex items-center gap-2" style={{ background: "hsl(152 60% 46% / 0.08)" }}>
            🎁 Referral code <strong>{booking.referral_code}</strong> applied — you'll get <strong>$25 off</strong> your first week once your booking goes active!
          </div>
        )}
        {currentStep === "account" && <StepAccount {...commonProps} booking={booking} vehicleId={vehicleId} bookingType={bookingType} vehicles={vehicles} />}
        {currentStep === "profile" && <StepProfile {...commonProps} recentVerifiedBooking={recentVerifiedBooking} />}
        {currentStep === "verification" && <StepVerification {...commonProps} />}
        {currentStep === "terms" && <StepTerms {...commonProps} />}
        {currentStep === "contract" && <StepContract {...commonProps} />}
        {currentStep === "payment" && <StepPayment {...commonProps} onPaymentSuccess={onPaymentSuccess} />}
        {currentStep === "confirmation" && <StepConfirmation {...commonProps} />}
      </div>
    </div>
  );
}