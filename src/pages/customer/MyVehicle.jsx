import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInMinutes, format, intervalToDuration } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MapPin, MessageSquare, Lock, Unlock, Fan, BellRing, Camera, Clock, Gauge, Fuel, CheckCircle, Navigation, ChevronRight, Signal, Battery, Thermometer, Car, Calendar, Mail, AlertCircle, User } from "lucide-react";
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
    <div className="min-h-screen bg-[#0a0a0a] pb-20">
      {inspectionTarget && <VehicleInspectionSheet booking={inspectionTarget.booking} type={inspectionTarget.type} onClose={() => setInspectionTarget(null)} onComplete={() => {}} />}

      {/* Hero Section */}
      <div className="px-4 pt-4 pb-0">
        {/* Header Row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-lg font-bold text-white">{name}</p>
            <p className="text-xs text-[#30d158] flex items-center gap-1.5 mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#30d158]" />
              Online | Live
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-8 w-8 rounded-full bg-[#1c1c1e] flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-gray-400" />
            </button>
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs">
              {user?.full_name?.charAt(0) || "R"}
            </div>
          </div>
        </div>

        {/* Hero Content - Stats Left, Image Right */}
        <div className="flex items-center gap-4 mb-4">
          {/* Left Side - Stats */}
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-2">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Range</p>
                <p className="text-lg font-bold text-white">268 mi</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Hydrogen</p>
                <p className="text-lg font-bold text-white">72%</p>
              </div>
            </div>
          </div>

          {/* Right Side - Vehicle Image */}
          <div className="w-[200px] h-32 flex-shrink-0">
            <img 
              src={vehicle?.image_url || "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg"} 
              alt={name} 
              className="w-full h-full object-contain"
              style={{ 
                filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.5))",
              }}
            />
          </div>
        </div>
      </div>

      {/* Map Card */}
      <div className="px-4 py-3">
        <div className="rounded-2xl overflow-hidden bg-[#161618]">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-gray-500" />
              <div>
                <p className="text-sm font-bold text-white">Pico Canyon Rd</p>
                <p className="text-[10px] text-gray-400">Stevenson Ranch, CA 91381 · Updated just now</p>
              </div>
            </div>
            <button className="h-8 w-8 rounded-full bg-[#262626] flex items-center justify-center">
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
        <div className="flex items-center gap-3 bg-[#161618] rounded-2xl px-4 py-4">
          {/* Left - Rental End */}
          <div className="flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-4 w-4 text-gray-400" />
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Rental ends</p>
            </div>
            <p className="text-sm font-bold text-white">{booking.end_date ? format(new Date(`${booking.end_date}T23:59:59`), "MMM d, yyyy") : "N/A"}</p>
            <p className="text-xs text-gray-400">{booking.end_date ? format(new Date(`${booking.end_date}T23:59:59`), "h:mm a") : ""}</p>
          </div>
          {/* Middle - Remaining Time with circular progress */}
          <div className="flex-1 border-l border-[#262626] pl-4">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="relative h-4 w-4">
                <svg className="h-4 w-4 -rotate-90" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="#262626" strokeWidth="2" />
                  <circle cx="8" cy="8" r="6" fill="none" stroke="#2997ff" strokeWidth="2" strokeDasharray="37.7" strokeDashoffset="9.4" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">Remaining</p>
            </div>
            <p className="text-sm font-bold text-white">{remainingTimeStr}</p>
          </div>
          {/* Right - Hydrogen */}
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end mb-1">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Hydrogen</p>
                <Fuel className="h-4 w-4 text-gray-400" />
              </div>
              <p className="text-sm font-bold text-white">72%</p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Remote Controls */}
      <div className="px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Remote Controls</p>
        <div className="grid grid-cols-4 gap-2">
          {/* Lock */}
          <button
            onClick={() => handleCommand("lock")}
            disabled={!isBookingActive || !!commandLoading || !pickupInspectionComplete || dropoffInspectionComplete}
            className={`aspect-square rounded-3xl flex flex-col items-center justify-center transition-all border ${
              !pickupInspectionComplete || dropoffInspectionComplete
                ? "bg-[#1c1c1e] border-[#2c2c2e] opacity-40"
                : "bg-[#1c1c1e] border-[#2c2c2e] active:scale-95"
            }`}
          >
            {/* Lock icon - closed padlock, shackle centered */}
            <svg className="mb-1.5" width="30" height="32" viewBox="0 0 30 34" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="16" width="22" height="16" rx="4" fill="#8e8e93"/>
              <path d="M9 16V11C9 7.134 11.686 4 15 4C18.314 4 21 7.134 21 11V16" stroke="#8e8e93" strokeWidth="3" strokeLinecap="round" fill="none"/>
              <rect x="12.5" y="21" width="5" height="4" rx="2.5" fill="#1c1c1e"/>
              <line x1="15" y1="24" x2="15" y2="28" stroke="#1c1c1e" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <p className="text-xs font-semibold text-white text-center leading-tight">Lock</p>
            <p className="text-[10px] text-gray-500 text-center leading-tight mt-0.5">Doors</p>
          </button>

          {/* Unlock */}
          <button
            onClick={() => handleCommand("unlock")}
            disabled={!isBookingActive || !!commandLoading || !pickupInspectionComplete || dropoffInspectionComplete}
            className={`aspect-square rounded-3xl flex flex-col items-center justify-center transition-all border ${
              !pickupInspectionComplete || dropoffInspectionComplete
                ? "bg-[#1c1c1e] border-[#2c2c2e] opacity-40"
                : "bg-[#1c1c1e] border-[#2c2c2e] active:scale-95"
            }`}
          >
            {/* Unlock icon - shackle swings open to the RIGHT/outside */}
            <svg className="mb-1.5" width="30" height="32" viewBox="0 0 30 34" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="16" width="22" height="16" rx="4" fill="#8e8e93"/>
              {/* Shackle open - right side lifts UP and OUT to the right */}
              <path d="M9 16V11C9 7.134 11.686 4 15 4C18.314 4 21 7.134 21 11" stroke="#8e8e93" strokeWidth="3" strokeLinecap="round" fill="none"/>
              <path d="M21 11V7" stroke="#8e8e93" strokeWidth="3" strokeLinecap="round"/>
              <rect x="12.5" y="21" width="5" height="4" rx="2.5" fill="#1c1c1e"/>
              <line x1="15" y1="24" x2="15" y2="28" stroke="#1c1c1e" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <p className="text-xs font-semibold text-white text-center leading-tight">Unlock</p>
            <p className="text-[10px] text-gray-500 text-center leading-tight mt-0.5">Doors</p>
          </button>

          {/* Climate - 4-blade fan like reference */}
          <button className="aspect-square rounded-3xl flex flex-col items-center justify-center bg-[#1c1c1e] border border-[#2c2c2e] opacity-40">
            <svg className="mb-1.5" width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="15" cy="15" r="2.5" fill="#8e8e93"/>
              {/* Top blade */}
              <path d="M15 12.5C15 12.5 13 7 9.5 6C7.5 5.5 7 7.5 8 9C9 10.5 12.5 12 12.5 12" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              {/* Right blade */}
              <path d="M17.5 15C17.5 15 23 17 24 20.5C24.5 22.5 22.5 23 21 22C19.5 21 18 17.5 18 17.5" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              {/* Bottom blade */}
              <path d="M15 17.5C15 17.5 17 23 20.5 24C22.5 24.5 23 22.5 22 21C21 19.5 17.5 18 17.5 18" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              {/* Left blade */}
              <path d="M12.5 15C12.5 15 7 13 6 9.5C5.5 7.5 7.5 7 9 8C10.5 9 12 12.5 12 12.5" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <p className="text-xs font-semibold text-gray-400 text-center leading-tight">Climate</p>
            <p className="text-[10px] text-gray-500 text-center leading-tight mt-0.5">Off</p>
          </button>

          {/* Find Vehicle - trumpet horn pointing right with 3 short horizontal wave lines */}
          <button
            onClick={() => handleCommand("find")}
            disabled={!!commandLoading || !isBookingActive || dropoffInspectionComplete}
            className={`aspect-square rounded-3xl flex flex-col items-center justify-center transition-all border-2 ${
              !isBookingActive || dropoffInspectionComplete
                ? "bg-[#1c1c1e] border-[#2c2c2e] opacity-40"
                : "bg-[#1c1c1e] border-[#0a84ff] active:scale-95"
            }`}
            style={!isBookingActive || dropoffInspectionComplete ? {} : {
              boxShadow: "0 0 12px rgba(10,132,255,0.4), 0 0 24px rgba(10,132,255,0.15)"
            }}
          >
            {/* Trumpet horn + 3 short horizontal lines (reference style) */}
            <svg className="mb-1.5" width="34" height="26" viewBox="0 0 34 26" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Horn/trumpet body - solid filled trapezoid pointing right */}
              <path d="M2 9H8L16 4V22L8 17H2V9Z" fill="#0a84ff"/>
              {/* Bell flare on right of horn */}
              <path d="M16 6C19 7.5 21 10.5 21 13C21 15.5 19 18.5 16 20" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              {/* 3 short horizontal sound-wave lines stacked vertically */}
              <line x1="24" y1="8" x2="32" y2="8" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="24" y1="13" x2="32" y2="13" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="24" y1="18" x2="32" y2="18" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <p className="text-xs font-bold text-white text-center leading-tight">Find Vehicle</p>
            <p className="text-[10px] text-gray-400 text-center leading-tight mt-0.5">Flash &amp; Honk</p>
          </button>
        </div>
        <p className="text-[10px] text-gray-500 text-center mt-3">Lock and unlock available after pickup</p>
      </div>

      {/* End Rental Card */}
      {!dropoffInspectionComplete && isBookingActive && (
        <div className="px-4 py-3">
          <button
            onClick={() => setInspectionTarget({ booking, type: "dropoff" })}
            className="w-full rounded-2xl bg-[#161618] border border-[#ff3b30] p-4 active:scale-98"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#ff3b30]/20 flex items-center justify-center">
                <Camera className="h-5 w-5 text-[#ff3b30]" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-bold text-white">End Your Rental</p>
                <p className="text-xs text-gray-400">Complete return inspection to stop billing immediately</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </div>
          </button>
        </div>
      )}

      {/* Vehicle Health */}
      <div className="px-4 py-3 pb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Vehicle Health</p>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 text-[#2b8a3e]" />
            <p className="text-xs text-white">All systems normal</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-[#161618] rounded-xl p-3 text-center">
            <CheckCircle className="h-5 w-5 text-[#2b8a3e] mx-auto mb-1.5" />
            <p className="text-[10px] text-gray-400">Vehicle</p>
            <p className="text-xs font-semibold text-white">Online</p>
          </div>
          <div className="bg-[#161618] rounded-xl p-3 text-center">
            <CheckCircle className="h-5 w-5 text-[#2b8a3e] mx-auto mb-1.5" />
            <p className="text-[10px] text-gray-400">Doors</p>
            <p className="text-xs font-semibold text-white">Closed</p>
          </div>
          <div className="bg-[#161618] rounded-xl p-3 text-center">
            <CheckCircle className="h-5 w-5 text-[#2b8a3e] mx-auto mb-1.5" />
            <p className="text-[10px] text-gray-400">Hydrogen</p>
            <p className="text-xs font-semibold text-white">Good</p>
          </div>
          <div className="bg-[#161618] rounded-xl p-3 text-center">
            <CheckCircle className="h-5 w-5 text-[#2b8a3e] mx-auto mb-1.5" />
            <p className="text-[10px] text-gray-400">Location</p>
            <p className="text-xs font-semibold text-white">GPS Signal</p>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#161618] border-t border-[#262626] px-2 py-2">
        <div className="flex items-center justify-around max-w-lg mx-auto">
          <button className="flex flex-col items-center gap-1 px-3 py-1">
            <Car className="h-6 w-6 text-white" />
            <p className="text-[10px] font-semibold text-white">My Vehicle</p>
          </button>
          <button className="flex flex-col items-center gap-1 px-3 py-1">
            <Calendar className="h-6 w-6 text-gray-400" />
            <p className="text-[10px] text-gray-400">Book Now</p>
          </button>
          <button className="flex flex-col items-center gap-1 px-3 py-1">
            <Mail className="h-6 w-6 text-gray-400" />
            <p className="text-[10px] text-gray-400">Messages</p>
          </button>
          <button className="flex flex-col items-center gap-1 px-3 py-1 relative">
            <AlertCircle className="h-6 w-6 text-gray-400" />
            <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[#e03131] flex items-center justify-center">
              <p className="text-[9px] font-bold text-white">6</p>
            </div>
            <p className="text-[10px] text-gray-400">Alerts</p>
          </button>
          <button className="flex flex-col items-center gap-1 px-3 py-1">
            <User className="h-6 w-6 text-gray-400" />
            <p className="text-[10px] text-gray-400">Account</p>
          </button>
        </div>
      </div>
    </div>
  );
}