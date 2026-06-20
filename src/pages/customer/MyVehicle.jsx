import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInMinutes, format, intervalToDuration } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MapPin, MessageSquare, Lock, Unlock, Fan, BellRing, Camera, Clock, Gauge, Fuel, CheckCircle, Navigation, ChevronRight, Signal, Battery, Thermometer } from "lucide-react";
import FindMyVehicleMap from "@/components/customer/mybookings/FindMyVehicleMap";
import VehicleInspectionSheet from "@/components/customer/VehicleInspectionSheet";

const ACTIVE_RENTAL_STATUSES = ["active", "approved", "confirmed", "payment_due", "grace_period", "return_pending_host_review", "under_review"];

function isOperationalRental(booking) {
  if (!booking || booking.rental_ended_at) return false;
  if (!ACTIVE_RENTAL_STATUSES.includes(booking.booking_status)) return false;
  if (booking.end_date && Date.now() > new Date(`${booking.end_date}T23:59:59`).getTime()) return false;
  return true;
}

function vehicleName(vehicle, booking) {
  return vehicle?.display_name || [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || booking?.vehicle_name || "My Vehicle";
}

function freshness(device) {
  const value = device?.last_seen_at || device?.location_updated_at;
  if (!value) return { label: "No GPS", status: "offline" };
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 2) return { label: "Live", status: "online" };
  if (minutes < 30) return { label: `${minutes}m`, status: "online" };
  return { label: "Stale", status: "offline" };
}

export default function MyVehicle() {
  const { user, isLoading: authLoading } = useAuth();
  const [inspectionTarget, setInspectionTarget] = useState(null);
  const [commandLoading, setCommandLoading] = useState(null);

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["my-vehicle-bookings", user?.email],
    queryFn: () => base44.entities.BookingRequest.filter({ user_email: user?.email }),
    enabled: !!user?.email && !authLoading,
    refetchInterval: 60_000,
  });

  const activeRentals = bookings.filter(isOperationalRental).sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));
  const booking = activeRentals[0];

  const { data: vehicleList = [] } = useQuery({
    queryKey: ["my-vehicle-record", booking?.vehicle_id],
    queryFn: () => base44.entities.Vehicle.filter({ id: booking?.vehicle_id }),
    enabled: !!booking?.vehicle_id,
  });
  const vehicle = vehicleList[0];

  const { data: devices = [] } = useQuery({
    queryKey: ["my-vehicle-device", booking?.vehicle_id],
    queryFn: () => base44.entities.TelematicsDevice.filter({ vehicle_id: booking?.vehicle_id }),
    enabled: !!booking?.vehicle_id,
    refetchInterval: 30_000,
  });
  const device = devices[0];
  const gps = freshness(device);

  // Calculate remaining time
  const remainingTime = booking?.end_date ? intervalToDuration({ start: new Date(), end: new Date(`${booking.end_date}T23:59:59`) }) : null;
  const remainingTimeStr = remainingTime 
    ? `${remainingTime.hours || 0}h ${remainingTime.minutes || 0}m remaining`
    : "N/A";

  if (authLoading || bookingsLoading) return <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center"><div className="w-8 h-8 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin" /></div>;
  if (!user) return <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center text-white text-center px-8"><div><p className="font-bold text-lg mb-2">Sign In Required</p><p className="text-sm text-gray-400">Please log in to access your vehicle</p></div></div>;
  if (!booking) return <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center text-white text-center px-8"><div><p className="font-bold text-lg mb-2">No Active Rental</p><p className="text-sm text-gray-400">Book a vehicle to access remote controls</p></div></div>;

  const name = vehicleName(vehicle, booking);
  const pickupInspectionComplete = booking?.pickup_photos?.length > 0;
  const dropoffInspectionComplete = booking?.return_exterior_photos?.length > 0 || booking?.return_interior_photos?.length > 0;
  const isBookingActive = ["active", "approved", "confirmed", "return_pending_host_review", "under_review"].includes(booking.booking_status) && booking.payment_status === "paid" && !booking.rental_ended_at;

  const handleCommand = async (type) => {
    if (!pickupInspectionComplete && (type === "lock" || type === "unlock")) {
      setInspectionTarget({ booking, type: "pickup" });
      return;
    }
    setCommandLoading(type);
    try {
      const { default: TelematicsService } = await import("@/lib/telematics/TelematicsService");
      const { toast } = await import("sonner");
      
      if (type === "lock" || type === "unlock") {
        await TelematicsService.sendCommand({
          telematics_device_id: device?.id,
          vehicle_id: vehicle?.id,
          booking_id: booking?.id,
          command_type: type,
          source: "vehicle_command_center"
        });
        toast.success(`Vehicle ${type}ed`);
      } else if (type === "find") {
        await TelematicsService.startAlarm({
          vehicle_id: vehicle?.id,
          telematics_device_id: device?.id
        });
        toast.success("Vehicle alarm activated!");
        if (vehicle?.vehicle_lat && vehicle?.vehicle_lon) {
          window.open(`https://www.google.com/maps/dir/?api=1&destination=${vehicle.vehicle_lat},${vehicle.vehicle_lon}`, "_blank");
        }
      }
    } catch (err) {
      console.error("Command failed:", err);
      const { toast } = await import("sonner");
      toast.error("Command failed");
    }
    setTimeout(() => setCommandLoading(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0C0C0C] pb-20">
      {inspectionTarget && <VehicleInspectionSheet booking={inspectionTarget.booking} type={inspectionTarget.type} onClose={() => setInspectionTarget(null)} onComplete={() => {}} />}

      {/* Hero Section - One continuous hero like Tesla mockup */}
      <div className="px-4 pt-4 pb-0">
        {/* Header Row */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-lg font-bold text-white">2018 Toyota Mirai</p>
            <p className="text-xs text-[#30d158] flex items-center gap-1.5 mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#30d158]" />
              Online | Live
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-8 w-8 rounded-full bg-[#1c1c1e] flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-gray-400" />
            </button>
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
              {user?.full_name?.charAt(0) || "U"}
            </div>
          </div>
        </div>

        {/* Hero Content - Stats Left, Image Right - NO CARDS */}
        <div className="flex items-center gap-3 mb-4">
          {/* Left Side - Stats */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Range</p>
                <p className="text-base font-bold text-white">268 mi</p>
              </div>
              <div className="w-px h-6 bg-[#262626]" />
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Hydrogen</p>
                <p className="text-base font-bold text-white">72%</p>
              </div>
            </div>
            {/* Status Icons */}
            <div className="flex items-center gap-2.5">
              <Signal className="h-3.5 w-3.5 text-gray-500" />
              <Lock className="h-3.5 w-3.5 text-gray-500" />
              <Fan className="h-3.5 w-3.5 text-gray-500" />
            </div>
          </div>

          {/* Right Side - Vehicle Image (no card, no background) */}
          <div className="w-[180px] h-28 flex-shrink-0 flex items-end justify-end -mt-2">
            <img 
              src={vehicle?.image_url || "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg"} 
              alt={name} 
              className="w-full h-full object-contain"
              style={{ 
                filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.3))",
                transform: "scaleX(-1)"
              }}
            />
          </div>
        </div>
      </div>

      {/* Map Card */}
      <div className="px-4 py-3">
        <div className="rounded-2xl overflow-hidden bg-[#1c1c1e] border border-[#262626]">
          <div className="px-4 py-3 border-b border-[#262626] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-gray-500" />
              <div>
                <p className="text-sm font-bold text-white">Pico Canyon Rd</p>
                <p className="text-[10px] text-gray-500">Stevenson Ranch, CA 91381 · Updated just now</p>
              </div>
            </div>
            <button className="h-8 w-8 rounded-lg bg-[#2997ff] flex items-center justify-center">
              <Navigation className="h-4 w-4 text-white" style={{ transform: "rotate(45deg)" }} />
            </button>
          </div>
          <div className="h-48">
            <FindMyVehicleMap booking={booking} vehicleColor={vehicle?.color || "#2a5d8f"} />
          </div>
        </div>
      </div>

      {/* Rental Card */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-4 bg-[#1c1c1e] rounded-2xl border border-[#262626] px-4 py-4">
          {/* Left - Rental End */}
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3.5 w-3.5 text-gray-500" />
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Rental ends</p>
            </div>
            <p className="text-sm font-bold text-white">{booking.end_date ? format(new Date(`${booking.end_date}T23:59:59`), "MMM d, yyyy") : "N/A"}</p>
            <p className="text-xs text-gray-500">{booking.end_date ? format(new Date(`${booking.end_date}T23:59:59`), "h:mm a") : ""}</p>
          </div>
          {/* Middle - Remaining Time */}
          <div className="flex-1 border-l border-[#262626] pl-4">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="h-3.5 w-3.5 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" />
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Remaining</p>
            </div>
            <p className="text-sm font-bold text-white">{remainingTimeStr}</p>
          </div>
          {/* Right - Hydrogen */}
          <div className="flex items-center gap-2 pr-2">
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end mb-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Hydrogen</p>
                <Fuel className="h-3.5 w-3.5 text-gray-500" />
              </div>
              <p className="text-sm font-bold text-white">72%</p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-500" />
          </div>
        </div>
      </div>

      {/* Remote Controls */}
      <div className="px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Remote Controls</p>
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => handleCommand("lock")}
            disabled={!isBookingActive || !!commandLoading || !pickupInspectionComplete || dropoffInspectionComplete}
            className={`aspect-square rounded-xl flex flex-col items-center justify-center transition-all border ${
              !pickupInspectionComplete || dropoffInspectionComplete
                ? "bg-[#1c1c1e] border-[#262626] opacity-50"
                : "bg-[#1c1c1e] border-[#262626] active:scale-95"
            }`}
          >
            <Lock className="h-5 w-5 mb-1.5 text-white" />
            <p className="text-xs font-semibold text-white">Lock Doors</p>
          </button>
          <button
            onClick={() => handleCommand("unlock")}
            disabled={!isBookingActive || !!commandLoading || !pickupInspectionComplete || dropoffInspectionComplete}
            className={`aspect-square rounded-xl flex flex-col items-center justify-center transition-all border ${
              !pickupInspectionComplete || dropoffInspectionComplete
                ? "bg-[#1c1c1e] border-[#262626] opacity-50"
                : "bg-[#1c1c1e] border-[#262626] active:scale-95"
            }`}
          >
            <Unlock className="h-5 w-5 mb-1.5 text-white" />
            <p className="text-xs font-semibold text-white">Unlock Doors</p>
          </button>
          <button className="aspect-square rounded-xl flex flex-col items-center justify-center bg-[#1c1c1e] border border-[#262626] opacity-50">
            <Fan className="h-5 w-5 mb-1.5 text-gray-500" />
            <p className="text-xs font-semibold text-gray-500">Climate Off</p>
          </button>
          <button
            onClick={() => handleCommand("find")}
            disabled={!!commandLoading || !isBookingActive || dropoffInspectionComplete}
            className={`aspect-square rounded-xl flex flex-col items-center justify-center transition-all border ${
              !isBookingActive || dropoffInspectionComplete
                ? "bg-[#1c1c1e] border-[#262626] opacity-50"
                : "bg-[#1c1c1e] border-[#2997ff] active:scale-95"
            }`}
          >
            <BellRing className="h-5 w-5 mb-1.5 text-[#2997ff]" />
            <p className="text-xs font-semibold text-white">Find Vehicle</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Flash & Honk</p>
          </button>
        </div>
        <p className="text-[10px] text-gray-500 text-center mt-3">Lock and unlock available after pickup</p>
      </div>

      {/* End Rental Card */}
      {!dropoffInspectionComplete && isBookingActive && (
        <div className="px-4 py-3">
          <button
            onClick={() => setInspectionTarget({ booking, type: "dropoff" })}
            className="w-full rounded-2xl bg-[#1c1c1e] border border-[#ff3b30]/40 p-4 active:scale-98"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-[#ff3b30]/20 flex items-center justify-center">
                <Camera className="h-4 w-4 text-[#ff3b30]" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-bold text-white">End Your Rental</p>
                <p className="text-xs text-gray-400">Complete return inspection to stop billing immediately</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </div>
          </button>
        </div>
      )}

      {/* Vehicle Health */}
      <div className="px-4 py-3 pb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Vehicle Health</p>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-[#30d158]" />
            <p className="text-xs text-white">All systems normal</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-[#1c1c1e] rounded-xl border border-[#262626] p-3 text-center">
            <CheckCircle className="h-4 w-4 text-[#30d158] mx-auto mb-1.5" />
            <p className="text-[10px] text-gray-400">Vehicle</p>
            <p className="text-xs font-semibold text-white">Online</p>
          </div>
          <div className="bg-[#1c1c1e] rounded-xl border border-[#262626] p-3 text-center">
            <CheckCircle className="h-4 w-4 text-[#30d158] mx-auto mb-1.5" />
            <p className="text-[10px] text-gray-400">Doors</p>
            <p className="text-xs font-semibold text-white">Closed</p>
          </div>
          <div className="bg-[#1c1c1e] rounded-xl border border-[#262626] p-3 text-center">
            <CheckCircle className="h-4 w-4 text-[#30d158] mx-auto mb-1.5" />
            <p className="text-[10px] text-gray-400">Hydrogen</p>
            <p className="text-xs font-semibold text-white">Good</p>
          </div>
          <div className="bg-[#1c1c1e] rounded-xl border border-[#262626] p-3 text-center">
            <CheckCircle className="h-4 w-4 text-[#30d158] mx-auto mb-1.5" />
            <p className="text-[10px] text-gray-400">Location</p>
            <p className="text-xs font-semibold text-white">GPS Signal</p>
          </div>
        </div>
      </div>
    </div>
  );
}