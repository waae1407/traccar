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
            className={`aspect-square rounded-2xl flex flex-col items-center justify-center transition-all border ${
              !pickupInspectionComplete || dropoffInspectionComplete
                ? "bg-[#1c1c1e] border-[#2c2c2e] opacity-40"
                : "bg-[#1c1c1e] border-[#2c2c2e] active:scale-95"
            }`}
          >
            {/* Padlock - closed */}
            <svg className="mb-2" width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="7" y="15" width="18" height="14" rx="3" fill="#9a9a9a"/>
              <path d="M11 15V11C11 7.686 12.686 6 16 6C19.314 6 21 7.686 21 11V15" stroke="#9a9a9a" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <rect x="14" y="20" width="4" height="4" rx="2" fill="#1c1c1e"/>
              <line x1="16" y1="22" x2="16" y2="26" stroke="#1c1c1e" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <p className="text-xs font-semibold text-white text-center leading-tight">Lock</p>
            <p className="text-[10px] text-gray-500 text-center leading-tight mt-0.5">Doors</p>
          </button>

          {/* Unlock */}
          <button
            onClick={() => handleCommand("unlock")}
            disabled={!isBookingActive || !!commandLoading || !pickupInspectionComplete || dropoffInspectionComplete}
            className={`aspect-square rounded-2xl flex flex-col items-center justify-center transition-all border ${
              !pickupInspectionComplete || dropoffInspectionComplete
                ? "bg-[#1c1c1e] border-[#2c2c2e] opacity-40"
                : "bg-[#1c1c1e] border-[#2c2c2e] active:scale-95"
            }`}
          >
            {/* Padlock - open (shackle open to right) */}
            <svg className="mb-2" width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="7" y="15" width="18" height="14" rx="3" fill="#9a9a9a"/>
              <path d="M11 15V11C11 7.686 12.686 6 16 6C19.314 6 21 7.686 21 11V8" stroke="#9a9a9a" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <rect x="14" y="19" width="4" height="4" rx="2" fill="#1c1c1e"/>
              <line x1="16" y1="22" x2="16" y2="26" stroke="#1c1c1e" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <p className="text-xs font-semibold text-white text-center leading-tight">Unlock</p>
            <p className="text-[10px] text-gray-500 text-center leading-tight mt-0.5">Doors</p>
          </button>

          {/* Climate */}
          <button className="aspect-square rounded-2xl flex flex-col items-center justify-center bg-[#1c1c1e] border border-[#2c2c2e] opacity-40">
            {/* Fan / flower shape */}
            <svg className="mb-2" width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="16" cy="16" r="3" fill="#9a9a9a"/>
              <path d="M16 13C16 13 14 8 10 8C8 8 7 10 8 12C9 14 13 14 13 14" stroke="#9a9a9a" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <path d="M19 16C19 16 24 14 24 10C24 8 22 7 20 8C18 9 18 13 18 13" stroke="#9a9a9a" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <path d="M16 19C16 19 18 24 22 24C24 24 25 22 24 20C23 18 19 18 19 18" stroke="#9a9a9a" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <path d="M13 16C13 16 8 18 8 22C8 24 10 25 12 24C14 23 14 19 14 19" stroke="#9a9a9a" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
            <p className="text-xs font-semibold text-gray-400 text-center leading-tight">Climate</p>
            <p className="text-[10px] text-gray-500 text-center leading-tight mt-0.5">Off</p>
          </button>

          {/* Find Vehicle - trumpet/horn with neon blue glow */}
          <button
            onClick={() => handleCommand("find")}
            disabled={!!commandLoading || !isBookingActive || dropoffInspectionComplete}
            className={`aspect-square rounded-2xl flex flex-col items-center justify-center transition-all border-2 ${
              !isBookingActive || dropoffInspectionComplete
                ? "bg-[#1c1c1e] border-[#2c2c2e] opacity-40"
                : "bg-[#1c1c1e] border-[#2997ff] active:scale-95"
            }`}
            style={!isBookingActive || dropoffInspectionComplete ? {} : {
              boxShadow: "0 0 0 2px rgba(41,151,255,0.15), 0 0 20px rgba(41,151,255,0.5), 0 0 40px rgba(41,151,255,0.25), inset 0 0 30px rgba(41,151,255,0.08)"
            }}
          >
            {/* Trumpet / horn icon matching reference exactly */}
            <svg
              className="mb-2"
              width="36"
              height="30"
              viewBox="0 0 36 30"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ filter: (!isBookingActive || dropoffInspectionComplete) ? "none" : "drop-shadow(0 0 10px rgba(41,151,255,0.9))" }}
            >
              {/* Horn body - solid filled shape */}
              <path d="M2 11H10L20 5V25L10 19H2V11Z" fill="#2997ff"/>
              {/* Bell flare */}
              <path d="M20 7C20 7 28 10 28 15C28 20 20 23 20 23" stroke="#2997ff" strokeWidth="3" strokeLinecap="round" fill="none"/>
              {/* Sound waves - 3 horizontal curved lines */}
              <path d="M30 8C32 10 33 12 33 15C33 18 32 20 30 22" stroke="#2997ff" strokeWidth="3" strokeLinecap="round" fill="none"/>
              <path d="M34 6C37 9 38 12 38 15C38 18 37 21 34 24" stroke="#2997ff" strokeWidth="3" strokeLinecap="round" fill="none"/>
            </svg>
            <p className="text-xs font-semibold text-white text-center leading-tight">Find Vehicle</p>
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