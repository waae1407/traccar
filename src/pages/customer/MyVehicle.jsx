import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInMinutes, format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Signal, Lock, Unlock, BellRing, Camera, Calendar, MessageSquare, Wrench, FileText, ChevronUp, MapPin, Fan, CheckCircle, Clock, Gauge, Fuel } from "lucide-react";
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
  const [showMenu, setShowMenu] = useState(false);
  const [activeCommand, setActiveCommand] = useState(null);

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

  if (authLoading || bookingsLoading) return <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center"><div className="w-8 h-8 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin" /></div>;
  if (!user) return <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center text-white text-center px-8"><div><p className="font-bold text-lg mb-2">Sign In Required</p><p className="text-sm text-gray-400">Please log in to access your vehicle</p></div></div>;
  if (!booking) return <div className="min-h-screen bg-[#0C0C0C] flex items-center justify-center text-white text-center px-8"><div><p className="font-bold text-lg mb-2">No Active Rental</p><p className="text-sm text-gray-400">Book a vehicle to access remote controls</p></div></div>;

  const name = vehicleName(vehicle, booking);
  const daysRemaining = booking.end_date ? Math.max(0, differenceInMinutes(new Date(`${booking.end_date}T23:59:59`), new Date())) : null;
  const pickupInspectionComplete = booking?.pickup_photos?.length > 0;
  const dropoffInspectionComplete = booking?.return_exterior_photos?.length > 0 || booking?.return_interior_photos?.length > 0;
  const isBookingActive = ["active", "approved", "confirmed", "return_pending_host_review", "under_review"].includes(booking.booking_status) && booking.payment_status === "paid" && !booking.rental_ended_at;

  const handleCommand = async (type) => {
    if (!pickupInspectionComplete && (type === "lock" || type === "unlock")) {
      setInspectionTarget({ booking, type: "pickup" });
      return;
    }
    setActiveCommand(type);
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
    }
    setTimeout(() => setActiveCommand(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0C0C0C] pb-20">
      {inspectionTarget && <VehicleInspectionSheet booking={inspectionTarget.booking} type={inspectionTarget.type} onClose={() => setInspectionTarget(null)} onComplete={() => {}} />}

      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-lg font-bold text-white">{name}</p>
            <p className="text-xs text-[#30d158] flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#30d158]" />
              Online | Live
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-9 w-9 rounded-full bg-[#1c1c1e] flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-gray-400" />
            </button>
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
              {user?.full_name?.charAt(0) || "U"}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-4 mt-3 bg-[#1c1c1e] rounded-2xl p-4">
          <div>
            <p className="text-lg font-bold text-white">268 mi</p>
            <p className="text-xs text-gray-400">Range</p>
          </div>
          <div className="w-px h-8 bg-[#262626]" />
          <div>
            <p className="text-lg font-bold text-white">72%</p>
            <p className="text-xs text-gray-400">Hydrogen</p>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <Signal className="h-4 w-4 text-gray-400" />
            <Lock className="h-4 w-4 text-gray-400" />
            <Fan className="h-4 w-4 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Vehicle Image */}
      <div className="px-4 py-4">
        <div className="h-48 bg-[#1c1c1e] rounded-2xl flex items-center justify-center overflow-hidden">
          <img 
            src="https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg" 
            alt="2018 Toyota Mirai" 
            className="h-full w-full object-contain"
            style={{ filter: "hue-rotate(180deg)" }}
          />
        </div>
      </div>

      {/* Map Section */}
      <div className="px-4 py-4">
        <div className="h-64 rounded-2xl overflow-hidden bg-[#1c1c1e]">
          <FindMyVehicleMap booking={booking} vehicleColor={vehicle?.color || "#2a5d8f"} />
        </div>
      </div>

      {/* Rental Info Row */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between bg-[#1c1c1e] rounded-2xl p-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Rental ends</p>
              <p className="text-sm font-bold text-white">{booking.end_date ? format(new Date(`${booking.end_date}T23:59:59`), "MMM d, yyyy") : "N/A"}</p>
              <p className="text-xs text-gray-400">{booking.end_date ? format(new Date(`${booking.end_date}T23:59:59`), "h:mm a") : ""}</p>
            </div>
          </div>
          <div className="w-px h-10 bg-[#262626]" />
          <div className="flex items-center gap-3 flex-1">
            <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <Gauge className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Remaining</p>
              <p className="text-sm font-bold text-white">{daysRemaining ? `${Math.floor(daysRemaining / 60)}h ${daysRemaining % 60}m` : "N/A"}</p>
            </div>
          </div>
          <div className="w-px h-10 bg-[#262626]" />
          <div className="flex items-center gap-3 flex-1">
            <Fuel className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">Fuel</p>
              <p className="text-sm font-bold text-white">72%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Remote Controls */}
      <div className="px-4 py-4">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">REMOTE CONTROLS</p>
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={() => handleCommand("lock")}
            disabled={!isBookingActive || !!activeCommand || !pickupInspectionComplete || dropoffInspectionComplete}
            className={`aspect-square rounded-2xl p-3 flex flex-col items-center justify-center transition-all ${
              !pickupInspectionComplete || dropoffInspectionComplete
                ? "bg-[#1c1c1e] opacity-50"
                : "bg-[#1c1c1e] active:scale-95"
            }`}
          >
            <Lock className="h-6 w-6 mb-2 text-white" />
            <p className="text-xs font-bold text-white">Lock</p>
            <p className="text-[9px] text-gray-400">Doors</p>
          </button>
          <button
            onClick={() => handleCommand("unlock")}
            disabled={!isBookingActive || !!activeCommand || !pickupInspectionComplete || dropoffInspectionComplete}
            className={`aspect-square rounded-2xl p-3 flex flex-col items-center justify-center transition-all ${
              !pickupInspectionComplete || dropoffInspectionComplete
                ? "bg-[#1c1c1e] opacity-50"
                : "bg-[#1c1c1e] active:scale-95"
            }`}
          >
            <Unlock className="h-6 w-6 mb-2 text-white" />
            <p className="text-xs font-bold text-white">Unlock</p>
            <p className="text-[9px] text-gray-400">Doors</p>
          </button>
          <button className="aspect-square rounded-2xl p-3 flex flex-col items-center justify-center bg-[#1c1c1e]">
            <Fan className="h-6 w-6 mb-2 text-white" />
            <p className="text-xs font-bold text-white">Climate</p>
            <p className="text-[9px] text-gray-400">Off</p>
          </button>
          <button
            onClick={() => handleCommand("find")}
            disabled={!!activeCommand || !isBookingActive || dropoffInspectionComplete}
            className={`aspect-square rounded-2xl p-3 flex flex-col items-center justify-center transition-all border-2 ${
              !isBookingActive || dropoffInspectionComplete
                ? "bg-[#1c1c1e] opacity-50 border-transparent"
                : "bg-[#1c1c1e] active:scale-95 border-blue-500/30"
            }`}
          >
            <BellRing className="h-6 w-6 mb-2 text-white" />
            <p className="text-xs font-bold text-white">Find Vehicle</p>
            <p className="text-[9px] text-gray-400">Flash & Honk</p>
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-2 text-center">Lock and unlock available after pickup</p>
      </div>

      {/* End Rental Button */}
      {!dropoffInspectionComplete && isBookingActive && (
        <div className="px-4 pb-4">
          <button
            onClick={() => setInspectionTarget({ booking, type: "dropoff" })}
            className="w-full rounded-2xl bg-[#7F1D1D] p-4 active:scale-98"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                <Camera className="h-5 w-5 text-white" />
              </div>
              <div className="text-left">
                <p className="text-base font-bold text-white">End Your Rental</p>
                <p className="text-xs text-white/70">Complete return inspection to stop billing immediately</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Vehicle Health */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">VEHICLE HEALTH</p>
          <p className="text-xs text-[#30d158] flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            All systems normal
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-[#1c1c1e] rounded-xl p-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-[#30d158]" />
              <p className="text-sm font-bold text-white">Vehicle Online</p>
            </div>
          </div>
          <div className="flex items-center justify-between bg-[#1c1c1e] rounded-xl p-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-[#30d158]" />
              <p className="text-sm font-bold text-white">Doors Closed</p>
            </div>
          </div>
          <div className="flex items-center justify-between bg-[#1c1c1e] rounded-xl p-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-[#30d158]" />
              <p className="text-sm font-bold text-white">Hydrogen Good</p>
            </div>
          </div>
          <div className="flex items-center justify-between bg-[#1c1c1e] rounded-xl p-3">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-[#30d158]" />
              <p className="text-sm font-bold text-white">Location GPS Signal</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}