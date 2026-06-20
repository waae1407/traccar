import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInMinutes, format, intervalToDuration } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MapPin, MessageSquare, Lock, Unlock, Wind, Camera, Clock, Fuel, CheckCircle, Navigation, ChevronRight, Car, Calendar, Mail, AlertCircle, User } from "lucide-react";
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
  if (!booking) {
    // Show demo UI for preview purposes
    return (
      <div className="min-h-screen bg-[#0a0a0a] pb-20">
        <div className="relative pt-4 pb-2 overflow-hidden">
          <div className="flex items-start justify-between px-4">
            <div className="flex-1 pr-4">
              <p className="text-[28px] font-bold text-white leading-tight">Demo Vehicle</p>
              <p className="text-sm flex items-center gap-1.5 mt-1">
                <span className="h-2 w-2 rounded-full bg-[#30d158]" />
                <span className="text-[#30d158] font-medium">Online</span>
                <span className="text-gray-400 mx-0.5">|</span>
                <span className="text-white font-medium">Live</span>
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button className="h-9 w-9 rounded-full bg-[#2c2c2e] flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-gray-300" />
              </button>
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                {user?.full_name?.charAt(0) || "R"}
              </div>
            </div>
          </div>
          <div className="flex items-end mt-5">
            <div className="px-4 flex-1">
              <div className="flex items-end gap-6 mb-4">
                <div><p className="text-[26px] font-bold text-white leading-none">268 mi</p><p className="text-sm text-gray-400 mt-1">Range</p></div>
                <div className="w-px h-10 bg-[#3a3a3c]" />
                <div><p className="text-[26px] font-bold text-white leading-none">72%</p><p className="text-sm text-gray-400 mt-1">Hydrogen</p></div>
              </div>
              <div className="flex items-center gap-4 pb-2">
                <svg width="20" height="16" viewBox="0 0 20 16" fill="none"><rect x="0" y="10" width="3" height="6" rx="1" fill="#8e8e93"/><rect x="4.5" y="7" width="3" height="9" rx="1" fill="#8e8e93"/><rect x="9" y="4" width="3" height="12" rx="1" fill="#8e8e93"/><rect x="13.5" y="1" width="3" height="15" rx="1" fill="#8e8e93"/></svg>
                <Lock className="h-5 w-5 text-[#8e8e93]" strokeWidth={1.8} />
                <Wind className="h-5 w-5 text-[#8e8e93]" strokeWidth={1.8} />
              </div>
            </div>
            <div className="w-[52%] flex-shrink-0">
              <img src="https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg" alt="Demo" className="w-full object-contain" style={{ filter: "drop-shadow(-8px 4px 20px rgba(0,0,0,0.7))", maxHeight: "160px" }} />
            </div>
          </div>
        </div>

        {/* Remote Controls Demo */}
        <div className="px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Remote Controls</p>
          <div className="grid grid-cols-4 gap-3">
            <button className="aspect-square rounded-[22px] flex flex-col items-center justify-center gap-2 bg-[#1c1c1e] opacity-50">
              <Lock className="w-7 h-7 text-[#8e8e93]" strokeWidth={1.8} />
              <div className="text-center">
                <p className="text-[13px] font-semibold text-white leading-tight">Lock</p>
                <p className="text-[11px] text-[#8e8e93] leading-tight">Doors</p>
              </div>
            </button>
            <button className="aspect-square rounded-[22px] flex flex-col items-center justify-center gap-2 bg-[#1c1c1e] opacity-50">
              <Unlock className="w-7 h-7 text-[#8e8e93]" strokeWidth={1.8} />
              <div className="text-center">
                <p className="text-[13px] font-semibold text-white leading-tight">Unlock</p>
                <p className="text-[11px] text-[#8e8e93] leading-tight">Doors</p>
              </div>
            </button>
            <button className="aspect-square rounded-[22px] flex flex-col items-center justify-center gap-2 bg-[#1c1c1e] opacity-50">
              <Wind className="w-7 h-7 text-[#8e8e93]" strokeWidth={1.8} />
              <div className="text-center">
                <p className="text-[13px] font-semibold text-[#8e8e93] leading-tight">Climate</p>
                <p className="text-[11px] text-[#8e8e93] leading-tight">Off</p>
              </div>
            </button>
            <button
              className="aspect-square rounded-[22px] flex flex-col items-center justify-center gap-2 bg-[#1c1c1e]"
              style={{ border: "2px solid #0a84ff", boxShadow: "0 0 0 1px rgba(10,132,255,0.2), 0 0 16px rgba(10,132,255,0.35), 0 0 32px rgba(10,132,255,0.15)" }}
            >
              <svg width="36" height="28" viewBox="0 0 36 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 8.5H8L17 3.5V24.5L8 19.5H1V8.5Z" fill="#0a84ff"/>
                <path d="M17 6C20.5 8 22.5 10.5 22.5 14C22.5 17.5 20.5 20 17 22" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="25" y1="8" x2="35" y2="8" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="25" y1="14" x2="35" y2="14" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round"/>
                <line x1="25" y1="20" x2="35" y2="20" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              <div className="text-center">
                <p className="text-[13px] font-bold text-white leading-tight">Find Vehicle</p>
                <p className="text-[11px] text-[#8e8e93] leading-tight">Flash &amp; Honk</p>
              </div>
            </button>
          </div>
          <p className="text-[12px] text-[#636366] text-center mt-2">No active rental — controls disabled</p>
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
      <div className="relative pt-4 pb-2 overflow-hidden">
        {/* Top row: title + icons */}
        <div className="flex items-start justify-between px-4">
          <div className="flex-1 pr-4">
            <p className="text-[28px] font-bold text-white leading-tight">{name}</p>
            <p className="text-sm flex items-center gap-1.5 mt-1">
              <span className="h-2 w-2 rounded-full bg-[#30d158]" />
              <span className="text-[#30d158] font-medium">Online</span>
              <span className="text-gray-400 mx-0.5">|</span>
              <span className="text-white font-medium">Live</span>
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button className="h-9 w-9 rounded-full bg-[#2c2c2e] flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-gray-300" />
            </button>
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
              {user?.full_name?.charAt(0) || "R"}
            </div>
          </div>
        </div>

        {/* Stats + Image row */}
        <div className="flex items-end mt-5">
          {/* Left: stats + mini icons */}
          <div className="px-4 flex-1">
            <div className="flex items-end gap-6 mb-4">
              <div>
                <p className="text-[26px] font-bold text-white leading-none">268 mi</p>
                <p className="text-sm text-gray-400 mt-1">Range</p>
              </div>
              <div className="w-px h-10 bg-[#3a3a3c]" />
              <div>
                <p className="text-[26px] font-bold text-white leading-none">72%</p>
                <p className="text-sm text-gray-400 mt-1">Hydrogen</p>
              </div>
            </div>
            {/* 3 bottom status icons */}
            <div className="flex items-center gap-4 pb-2">
              <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                <rect x="0" y="10" width="3" height="6" rx="1" fill="#8e8e93"/>
                <rect x="4.5" y="7" width="3" height="9" rx="1" fill="#8e8e93"/>
                <rect x="9" y="4" width="3" height="12" rx="1" fill="#8e8e93"/>
                <rect x="13.5" y="1" width="3" height="15" rx="1" fill="#8e8e93"/>
              </svg>
              <Lock className="h-5 w-5 text-[#8e8e93]" strokeWidth={1.8} />
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2" fill="#8e8e93"/>
                <path d="M10 8C10 8 8.5 4.5 6 3.5C4.5 3 4 4.5 4.8 5.5C5.6 6.5 8 7.5 8 7.5" stroke="#8e8e93" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M12 10C12 10 15.5 11.5 16.5 14C17 15.5 15.5 16 14.5 15.2C13.5 14.4 12.5 12 12.5 12" stroke="#8e8e93" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M10 12C10 12 11.5 15.5 14 16.5C15.5 17 16 15.5 15.2 14.5C14.4 13.5 12 12.5 12 12.5" stroke="#8e8e93" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M8 10C8 10 4.5 8.5 3.5 6C3 4.5 4.5 4 5.5 4.8C6.5 5.6 7.5 8 7.5 8" stroke="#8e8e93" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
          </div>

          {/* Right: vehicle image bleeding to edge */}
          <div className="w-[52%] flex-shrink-0">
            <img
              src={vehicle?.image_url || "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg"}
              alt={name}
              className="w-full object-contain"
              style={{
                filter: "drop-shadow(-8px 4px 20px rgba(0,0,0,0.7))",
                maxHeight: "160px",
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
        <div className="grid grid-cols-4 gap-3">
          {/* LOCK - Lucide Lock icon, gray, disabled state */}
          <button
            onClick={() => handleCommand("lock")}
            disabled={!isBookingActive || !!commandLoading || !pickupInspectionComplete || dropoffInspectionComplete}
            className={`aspect-square rounded-[22px] flex flex-col items-center justify-center gap-2 transition-all active:scale-95 ${
              !pickupInspectionComplete || dropoffInspectionComplete
                ? "bg-[#1c1c1e] opacity-50"
                : "bg-[#1c1c1e]"
            }`}
          >
            <Lock className="w-7 h-7 text-[#8e8e93]" strokeWidth={1.8} />
            <div className="text-center">
              <p className="text-[13px] font-semibold text-white leading-tight">Lock</p>
              <p className="text-[11px] text-[#8e8e93] leading-tight">Doors</p>
            </div>
          </button>

          {/* UNLOCK - Lucide Unlock icon, gray */}
          <button
            onClick={() => handleCommand("unlock")}
            disabled={!isBookingActive || !!commandLoading || !pickupInspectionComplete || dropoffInspectionComplete}
            className={`aspect-square rounded-[22px] flex flex-col items-center justify-center gap-2 transition-all active:scale-95 ${
              !pickupInspectionComplete || dropoffInspectionComplete
                ? "bg-[#1c1c1e] opacity-50"
                : "bg-[#1c1c1e]"
            }`}
          >
            <Unlock className="w-7 h-7 text-[#8e8e93]" strokeWidth={1.8} />
            <div className="text-center">
              <p className="text-[13px] font-semibold text-white leading-tight">Unlock</p>
              <p className="text-[11px] text-[#8e8e93] leading-tight">Doors</p>
            </div>
          </button>

          {/* CLIMATE - Lucide Wind icon, gray, disabled */}
          <button className="aspect-square rounded-[22px] flex flex-col items-center justify-center gap-2 bg-[#1c1c1e] opacity-50">
            <Wind className="w-7 h-7 text-[#8e8e93]" strokeWidth={1.8} />
            <div className="text-center">
              <p className="text-[13px] font-semibold text-[#8e8e93] leading-tight">Climate</p>
              <p className="text-[11px] text-[#8e8e93] leading-tight">Off</p>
            </div>
          </button>

          {/* FIND VEHICLE - trumpet horn SVG, blue glow border */}
          <button
            onClick={() => handleCommand("find")}
            disabled={!!commandLoading || !isBookingActive || dropoffInspectionComplete}
            className={`aspect-square rounded-[22px] flex flex-col items-center justify-center gap-2 transition-all active:scale-95 ${
              !isBookingActive || dropoffInspectionComplete
                ? "bg-[#1c1c1e] opacity-50"
                : "bg-[#1c1c1e]"
            }`}
            style={!isBookingActive || dropoffInspectionComplete ? {} : {
              border: "2px solid #0a84ff",
              boxShadow: "0 0 0 1px rgba(10,132,255,0.2), 0 0 16px rgba(10,132,255,0.35), 0 0 32px rgba(10,132,255,0.15)"
            }}
          >
            {/* Trumpet horn: solid body left, curved bell, 3 horizontal wave lines right */}
            <svg width="36" height="28" viewBox="0 0 36 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Body - solid filled trapezoid */}
              <path d="M1 8.5H8L17 3.5V24.5L8 19.5H1V8.5Z" fill="#0a84ff"/>
              {/* Bell curve */}
              <path d="M17 6C20.5 8 22.5 10.5 22.5 14C22.5 17.5 20.5 20 17 22" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round"/>
              {/* 3 horizontal lines - sound waves */}
              <line x1="25" y1="8" x2="35" y2="8" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="25" y1="14" x2="35" y2="14" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="25" y1="20" x2="35" y2="20" stroke="#0a84ff" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <div className="text-center">
              <p className="text-[13px] font-bold text-white leading-tight">Find Vehicle</p>
              <p className="text-[11px] text-[#8e8e93] leading-tight">Flash &amp; Honk</p>
            </div>
          </button>
        </div>
        <p className="text-[12px] text-[#636366] text-center mt-2">Lock and unlock available after pickup</p>
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