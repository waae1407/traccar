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
import StepPayment from "@/components/checkout/StepPayment";
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

  // Statuses that are considered "active / in-progress" — block new bookings while one exists
  const BLOCKING_STATUSES = ["draft", "pending_verification", "pending_contract", "pending_payment", "pending_review", "under_review", "approved"];

  // Check if user already has another active booking (not the current one being resumed)
  const { data: allUserBookings = [] } = useQuery({
    queryKey: ["all-user-bookings", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const activeBlockingBooking = allUserBookings.find(
    (b) => BLOCKING_STATUSES.includes(b.booking_status) && b.id !== booking?.id && b.id !== requestId
  );

  // Initialize — only hydrate step from DB on the FIRST load, never again
  useEffect(() => {
    if (existingRequest && !initializedRef.current) {
      initializedRef.current = true;
      setBooking(existingRequest);
      setCurrentStep(existingRequest.checkout_step || "select_vehicle");
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

  const stepIndex = STEPS.indexOf(currentStep);

  if (loadingRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Block starting a NEW booking if user already has one in progress
  if (user && !requestId && activeBlockingBooking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <div className="h-14 w-14 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="font-bold text-gray-900 text-lg mb-2">Active Booking In Progress</h2>
          <p className="text-gray-500 text-sm mb-5">
            You already have a booking in progress for <strong>{activeBlockingBooking.vehicle_name || "a vehicle"}</strong>.
            Only one booking can be active at a time. Please complete or cancel your existing booking first.
          </p>
          <a
            href="/my-bookings"
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
        {currentStep === "select_vehicle" && <StepVehicle {...commonProps} vehicleId={vehicleId} bookingType={bookingType} vehicles={vehicles} onSelect={(v, type, opts = {}) => {
          if (!user) { navigate(`/checkout?vehicle=${v.id}&type=${type}`); return; }
          if (activeBlockingBooking) return;
          createMutation.mutate({
            vehicle_id: v.id, vehicle_name: `${v.year} ${v.make} ${v.model}`,
            vehicle_image: v.image_url, booking_type: type, city: v.current_city,
            weekly_rate: v.weekly_rate, deposit_amount: 0,
            first_payment_amount: v.weekly_rate || 0, total_due_now: v.weekly_rate || 0,
            booking_status: "draft", checkout_step: "account", user_email: user?.email, user_id: user?.id,
            ...(bookingCompanyId && { company_id: bookingCompanyId }),
            ...(opts.startDate && { start_date: opts.startDate }),
            ...(opts.endDate && { end_date: opts.endDate }),
            ...(typeof opts.autoRenew !== "undefined" && { auto_renew: opts.autoRenew }),
          });
          setCurrentStep("account");
        }} />}

        {currentStep === "account" && <StepAccount {...commonProps} booking={booking} vehicleId={vehicleId} bookingType={bookingType} vehicles={vehicles} />}
        {currentStep === "profile" && <StepProfile {...commonProps} recentVerifiedBooking={recentVerifiedBooking} />}
        {currentStep === "verification" && <StepVerification {...commonProps} />}
        {currentStep === "terms" && <StepTerms {...commonProps} />}
        {currentStep === "contract" && <StepContract {...commonProps} />}
        {currentStep === "payment" && <StepPayment {...commonProps} />}
        {currentStep === "confirmation" && <StepConfirmation {...commonProps} />}
      </div>
    </div>
  );
}