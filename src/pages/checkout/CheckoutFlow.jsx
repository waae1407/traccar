import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import CanonicalCheckoutGuard from "@/components/checkout/CanonicalCheckoutGuard";
import { ArrowLeft } from "lucide-react";

const STEPS = ["select_vehicle", "account", "profile", "verification", "terms", "contract", "payment", "confirmation"];
const STEP_LABELS = ["Vehicle", "Account", "Profile", "Verify", "Terms", "Contract", "Pay", "Done"];
const CANONICAL_HOSTS = ["localhost", "127.0.0.1", "uridehub.com", "www.uridehub.com"];
const HARD_BLOCK_STATUSES = ["approved", "confirmed", "active"];
const STALE_STATUSES = ["pending_verification", "pending_contract", "pending_review", "under_review"];

function isCustomCheckoutHost() {
  const hostname = window.location.hostname.toLowerCase();
  return !CANONICAL_HOSTS.includes(hostname) && !hostname.includes("base44");
}

export default function CheckoutFlow() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const vehicleId = searchParams.get("vehicle");
  const bookingType = searchParams.get("type") || "Weekly";
  const requestId = searchParams.get("request");
  const companySlug = searchParams.get("company");
  const storefrontSlug = searchParams.get("storefront");
  const refCode = searchParams.get("ref");
  const requestedStep = searchParams.get("step");

  const [booking, setBooking] = useState(null);
  const [currentStep, setCurrentStep] = useState("select_vehicle");
  const [complianceError, setComplianceError] = useState(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const initializedRef = useRef(false);

  const { data: companyBySlug } = useQuery({
    queryKey: ["company-by-slug", companySlug],
    queryFn: async () => {
      const results = await base44.entities.Company.filter({ slug: companySlug });
      return results[0] || null;
    },
    enabled: !!companySlug,
  });

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
    onSuccess: (updated) => setBooking(updated),
  });

  const { data: previousBookings = [] } = useQuery({
    queryKey: ["previous-booking-requests", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user?.email }),
    enabled: !!user?.email,
    select: (data) =>
      [...data]
        .filter((b) => b.customer_full_name)
        .sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date)),
  });

  const { data: allUserBookings = [] } = useQuery({
    queryKey: ["all-user-bookings", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const cancelStaleMutation = useMutation({
    mutationFn: (id) => base44.entities.BookingRequest.update(id, {
      booking_status: "cancelled",
      admin_notes: "Auto-cancelled: stale booking superseded by new booking",
    }),
  });

  useEffect(() => {
    if (existingRequest && requestedStep === "payment" && !user) return;
    if (existingRequest && !initializedRef.current) {
      const ownsRequest = user && (existingRequest.user_email === user.email || existingRequest.user_id === user.id || user.role === "admin");
      if (!ownsRequest) {
        initializedRef.current = true;
        setBooking(null);
        setAccessDenied(true);
        setCurrentStep("select_vehicle");
        return;
      }

      initializedRef.current = true;
      setAccessDenied(false);
      setBooking(existingRequest);
      const terminalStatuses = ["cancelled", "completed", "rejected"];
      const retryEligible = ["failed", "payment_due", "past_due", "payment_retry_required"].includes(existingRequest.payment_status) || ["payment_due", "suspended", "grace_period"].includes(existingRequest.booking_status);
      if (requestedStep === "payment" && retryEligible) {
        setCurrentStep("payment");
      } else if (terminalStatuses.includes(existingRequest.booking_status)) {
        setCurrentStep("select_vehicle");
      } else if (existingRequest.booking_status === "pending_payment") {
        setCurrentStep("payment");
      } else {
        setCurrentStep(existingRequest.checkout_step || "select_vehicle");
      }
    }
  }, [existingRequest, requestedStep, user?.id]);

  const bookingCompanyId = companyBySlug?.id || user?.company_id || null;
  const selectedVehicle = vehicles.find((v) => v.id === (booking?.vehicle_id || vehicleId));
  const recentVerifiedBooking = previousBookings.find((b) => b.verification_status === "verified" && b.id !== booking?.id);
  const hardBlockingBooking = allUserBookings.find(
    (b) => HARD_BLOCK_STATUSES.includes(b.booking_status) && b.id !== booking?.id && b.id !== requestId
  );
  const stepIndex = STEPS.indexOf(currentStep);
  const isPaymentRecovery = requestedStep === "payment" && booking && (["failed", "payment_due", "past_due", "payment_retry_required"].includes(booking.payment_status) || ["payment_due", "suspended", "grace_period"].includes(booking.booking_status));

  const saveAndAdvance = (stepData, nextStep) => {
    if (booking?.id) {
      updateMutation.mutate({
        id: booking.id,
        data: {
          ...stepData,
          ...(!booking.host_id && selectedVehicle?.host_id ? { host_id: selectedVehicle.host_id } : {}),
          checkout_step: nextStep,
        },
      });
    }
    setCurrentStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onPaymentSuccess = async (updateData, options = {}) => {
    if (booking?.id) {
      const updated = await updateMutation.mutateAsync({
        id: booking.id,
        data: {
          ...updateData,
          ...(!booking.host_id && selectedVehicle?.host_id ? { host_id: selectedVehicle.host_id } : {}),
          checkout_step: "confirmation",
        },
      });
      setBooking(updated);

      if (updateData.payment_status === "paid") {
        const approval = await base44.functions.invoke("autoApproveBooking", {
          booking_request_id: booking.id,
          source: options.paymentRecovery ? "payment_recovery" : "checkout_payment_success"
        });
        if (approval.data?.booking) {
          setBooking(approval.data.booking);
          // Redirect to /my-vehicle after successful approval
          if (["approved", "active", "confirmed"].includes(approval.data.booking.booking_status)) {
            window.location.href = "/my-vehicle";
            return;
          }
        }
      }
    }
    setCurrentStep("confirmation");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isCustomCheckoutHost()) return <CanonicalCheckoutGuard />;

  if (loadingRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <h2 className="font-bold text-gray-900 text-lg mb-2">Access denied</h2>
          <p className="text-gray-500 text-sm mb-5">This booking is not available for your account.</p>
          <button onClick={() => navigate("/my-bookings", { replace: true })} className="w-full py-3 rounded-xl font-bold text-sm text-white" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            Go to My Bookings
          </button>
        </div>
      </div>
    );
  }

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
          <a href={`/checkout?request=${hardBlockingBooking.id}`} className="block w-full py-3 rounded-xl font-bold text-sm text-white text-center" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
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
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => stepIndex > 0 ? setCurrentStep(STEPS[stepIndex - 1]) : navigate("/", { replace: true })} className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
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
            base44.auth.redirectToLogin(`/checkout?vehicle=${v.id}&type=${type}${storefrontSlug ? `&storefront=${storefrontSlug}` : ""}`);
            return;
          }
          if (hardBlockingBooking) return;

          try {
            const compRes = await base44.functions.invoke("validateVehicleBooking", { vehicle_id: v.id });
            if (compRes.data?.blocked) {
              setComplianceError(compRes.data.reason || "This vehicle is temporarily unavailable.");
              return;
            }
            if (compRes.data?.host_id && !v.host_id) v.host_id = compRes.data.host_id;
          } catch (e) {
            console.warn("[ComplianceCheck] Failed:", e);
          }
          setComplianceError(null);

          const allStaleToCancel = allUserBookings.filter(
            (b) => [...STALE_STATUSES, "draft", "pending_payment"].includes(b.booking_status) && b.id !== booking?.id && b.id !== requestId
          );
          await Promise.all(allStaleToCancel.map((b) => cancelStaleMutation.mutateAsync(b.id)));
          const dueNow = type === "Monthly"
            ? (v.monthly_rate || (v.weekly_rate || 0) * 4)
            : type === "Commercial"
            ? (v.monthly_rate || (v.weekly_rate || 0) * 4)
            : v.weekly_rate || 0;
          await createMutation.mutateAsync({
            vehicle_id: v.id,
            vehicle_name: `${v.year} ${v.make} ${v.model}`,
            vehicle_image: v.image_url,
            booking_type: type,
            city: v.city || v.current_city,
            weekly_rate: v.weekly_rate,
            monthly_rate: v.monthly_rate,
            deposit_amount: 0,
            first_payment_amount: dueNow,
            total_due_now: dueNow,
            booking_status: "draft",
            booking_source: storefrontSlug ? "direct" : "marketplace",
            checkout_step: "account",
            user_email: user?.email,
            user_id: user?.id,
            host_id: v.host_id || "",
            ...(refCode && { referral_code: refCode }),
            ...(storefrontSlug && { storefront_slug: storefrontSlug }),
            ...(bookingCompanyId && { company_id: bookingCompanyId }),
            ...(opts.startDate && { start_date: opts.startDate }),
            ...(opts.endDate && { end_date: opts.endDate }),
            ...(typeof opts.autoRenew !== "undefined" && { auto_renew: opts.autoRenew }),
          });
          setCurrentStep("account");
        }} />}

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
        {currentStep === "payment" && <StepPayment {...commonProps} onPaymentSuccess={onPaymentSuccess} isPaymentRecovery={isPaymentRecovery} />}
        {currentStep === "confirmation" && <StepConfirmation {...commonProps} />}
      </div>
    </div>
  );
}