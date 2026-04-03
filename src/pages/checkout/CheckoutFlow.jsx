import React, { useState, useEffect } from "react";
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

  const [booking, setBooking] = useState(null);
  const [currentStep, setCurrentStep] = useState("select_vehicle");

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
      setBooking(updated);
      queryClient.invalidateQueries({ queryKey: ["booking-request", updated.id] });
    },
  });

  // Fetch user's previous booking requests for data pre-population
  const { data: previousBookings = [], isLoading: loadingPrevious } = useQuery({
    queryKey: ["previous-booking-requests", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user?.email }),
    enabled: !!user?.email && !requestId,
    select: (data) =>
      [...data]
        .filter((b) => b.customer_full_name)
        .sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date)),
  });

  // Initialize — wait for previousBookings to finish loading before creating
  useEffect(() => {
    if (existingRequest) {
      setBooking(existingRequest);
      setCurrentStep(existingRequest.checkout_step || "select_vehicle");
    } else if (vehicleId && !requestId && user && !loadingPrevious) {
      const v = vehicles.find((v) => v.id === vehicleId);
      if (v && !createMutation.isPending && !createMutation.isSuccess) {
        const prev = previousBookings[0];
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const verificationFresh =
          prev?.verification_status === "verified" &&
          prev?.updated_date &&
          new Date(prev.updated_date) > oneMonthAgo;

        createMutation.mutate({
          vehicle_id: vehicleId,
          vehicle_name: `${v.year} ${v.make} ${v.model}`,
          vehicle_image: v.image_url,
          booking_type: bookingType,
          city: v.current_city,
          weekly_rate: v.weekly_rate,
          deposit_amount: 0,
          first_payment_amount: v.weekly_rate || 0,
          total_due_now: v.weekly_rate || 0,
          booking_status: "draft",
          checkout_step: "account",
          user_email: user.email,
          user_id: user.id,
          ...(prev && {
            customer_full_name: prev.customer_full_name,
            customer_phone: prev.customer_phone,
            customer_dob: prev.customer_dob,
            customer_address: prev.customer_address,
            emergency_contact_name: prev.emergency_contact_name,
            emergency_contact_phone: prev.emergency_contact_phone,
            employer: prev.employer,
            income_range: prev.income_range,
          }),
          ...(verificationFresh && {
            license_front_url: prev.license_front_url,
            license_back_url: prev.license_back_url,
            selfie_url: prev.selfie_url,
            proof_of_income_url: prev.proof_of_income_url,
            verification_status: "verified",
          }),
        });
        setCurrentStep("account");
      }
    } else if (vehicleId && !requestId && !user) {
      setCurrentStep("account");
    }
  }, [existingRequest, vehicleId, vehicles.length, user, loadingPrevious]);

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

  const commonProps = { booking, vehicle: selectedVehicle, user, saveAndAdvance, updateMutation };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => stepIndex > 0 ? setCurrentStep(STEPS[stepIndex - 1]) : navigate(-1)}
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
        {currentStep === "select_vehicle" && <StepVehicle {...commonProps} vehicleId={vehicleId} bookingType={bookingType} vehicles={vehicles} onSelect={(v, type) => {
          if (!user) { navigate(`/checkout?vehicle=${v.id}&type=${type}`); return; }
          createMutation.mutate({
            vehicle_id: v.id, vehicle_name: `${v.year} ${v.make} ${v.model}`,
            vehicle_image: v.image_url, booking_type: type, city: v.current_city,
            weekly_rate: v.weekly_rate, deposit_amount: 0,
            first_payment_amount: v.weekly_rate || 0, total_due_now: v.weekly_rate || 0,
            booking_status: "draft", checkout_step: "account", user_email: user?.email, user_id: user?.id,
          });
          setCurrentStep("account");
        }} />}

        {currentStep === "account" && <StepAccount {...commonProps} booking={booking} vehicleId={vehicleId} bookingType={bookingType} vehicles={vehicles} />}
        {currentStep === "profile" && <StepProfile {...commonProps} />}
        {currentStep === "verification" && <StepVerification {...commonProps} />}
        {currentStep === "terms" && <StepTerms {...commonProps} />}
        {currentStep === "contract" && <StepContract {...commonProps} />}
        {currentStep === "payment" && <StepPayment {...commonProps} />}
        {currentStep === "confirmation" && <StepConfirmation {...commonProps} />}
      </div>
    </div>
  );
}