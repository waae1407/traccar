import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, CalendarDays, Car, ArrowRight, Home, Smartphone, Camera, Shield } from "lucide-react";
import PickupAddressCard from "@/components/customer/mybookings/PickupAddressCard";

export default function StepConfirmation({ booking, user }) {
  const { data: vehicle } = useQuery({
    queryKey: ["vehicle-pickup", booking?.vehicle_id],
    queryFn: () => base44.entities.Vehicle.filter({ id: booking.vehicle_id }).then(r => r[0]),
    enabled: !!booking?.vehicle_id && booking?.payment_status === "paid",
    staleTime: 5 * 60_000,
  });

  const isContactless = !!(vehicle?.contactless_pickup && vehicle?.moovetrax_device_id);

  const logMutation = useMutation({
    mutationFn: (data) => base44.entities.ActivityEvent.create(data),
  });

  useEffect(() => {
    if (user && booking?.id) {
      logMutation.mutate({
        user_email: user.email,
        booking_request_id: booking.id,
        event_type: "booking_confirmed",
        event_title: "Booking Confirmed",
        event_description: `${booking.vehicle_name} booking submitted for review`,
        event_status: "success",
      });
    }
  }, []);

  return (
    <div className="flex flex-col items-center text-center py-6">
      {/* Success animation */}
      <div className="relative mb-6">
        <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <div className="absolute inset-0 rounded-full border-4 border-green-200 animate-ping opacity-30" />
      </div>

      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        {isContactless ? "Your Car is Ready! 🚗" : "You're Almost There!"}
      </h2>
      <p className="text-gray-400 text-sm max-w-xs mb-6">
        {isContactless
          ? "Payment confirmed! Your vehicle is active. Use the app to unlock your car and start your rental."
          : "Your booking request has been submitted. We're reviewing your verification and will confirm shortly."}
      </p>

      {/* Booking card */}
      <div className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5 text-left">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Booking Reference</p>
        <p className="font-mono text-lg font-bold text-pink-600 mb-4">#{booking?.id?.slice(-8)?.toUpperCase()}</p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-pink-50 flex items-center justify-center">
              <Car className="h-4 w-4 text-pink-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Vehicle</p>
              <p className="font-semibold text-gray-900 text-sm">{booking?.vehicle_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center">
              <CalendarDays className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Type</p>
              <p className="font-semibold text-gray-900 text-sm">{booking?.booking_type}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Status</span>
            {isContactless
              ? <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">● Active</span>
              : <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">Pending Review</span>}
          </div>
        </div>
      </div>

      {/* Pickup Address — revealed immediately after payment */}
      {vehicle?.pickup_address && (
        <div className="w-full mb-5">
          <PickupAddressCard vehicle={vehicle} />
        </div>
      )}

      {/* Inspection requirement notice — always shown */}
      <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-4 text-left">
        <div className="flex items-center gap-2 mb-2">
          <Camera className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <p className="font-bold text-amber-800 text-sm">Inspection Photos Required</p>
        </div>
        <p className="text-xs text-amber-700 leading-relaxed">
          <strong>Before driving off, you must complete a pickup inspection</strong> — photos of all 4 sides of the vehicle, interior, and odometer. This protects you from liability for pre-existing damage. You'll find this in My Bookings.
        </p>
      </div>

      {/* Next steps */}
      {isContactless ? (
        <div className="w-full bg-green-50 rounded-2xl border border-green-100 p-4 mb-6 text-left">
          <p className="font-semibold text-green-800 text-sm mb-2">How to get started</p>
          <div className="space-y-1.5">
            {[
              { icon: Smartphone, text: "Go to My Bookings and tap your active rental" },
              { icon: Shield, text: "Complete the pickup inspection photos before driving" },
              { icon: Car, text: "Use the remote controls to unlock and start your rental" },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="h-5 w-5 rounded-full bg-green-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="h-2.5 w-2.5 text-green-700" />
                </div>
                <p className="text-xs text-green-700">{text}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full bg-blue-50 rounded-2xl border border-blue-100 p-4 mb-6 text-left">
          <p className="font-semibold text-blue-800 text-sm mb-2">What happens next?</p>
          <div className="space-y-1.5">
            {[
              "We'll review your ID and documents (usually within 24 hours)",
              "You'll receive a notification once approved",
              "Complete pickup inspection photos before driving — required for liability",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="h-5 w-5 rounded-full bg-blue-200 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <p className="text-xs text-blue-700">{step}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="w-full space-y-3">
        <Link to="/my-bookings" className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm text-white"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          View My Bookings <ArrowRight className="h-4 w-4" />
        </Link>
        <Link to="/" className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-gray-600 border border-gray-200">
          <Home className="h-4 w-4" /> Back to Home
        </Link>
      </div>
    </div>
  );
}