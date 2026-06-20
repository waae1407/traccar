import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Signal, Lock, Unlock, BellRing, Camera, Calendar, MessageSquare, Wrench, FileText, ChevronUp, MapPin } from "lucide-react";
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

  if (authLoading || bookingsLoading) return <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center"><div className="w-8 h-8 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin" /></div>;
  if (!user) return <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center text-white text-center px-8"><div><p className="font-bold text-lg mb-2">Sign In Required</p><p className="text-sm text-gray-400">Please log in to access your vehicle</p></div></div>;
  if (!booking) return <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center text-white text-center px-8"><div><p className="font-bold text-lg mb-2">No Active Rental</p><p className="text-sm text-gray-400">Book a vehicle to access remote controls</p></div></div>;

  const name = vehicleName(vehicle, booking);
  const daysRemaining = booking.end_date ? Math.max(0, differenceInCalendarDays(new Date(`${booking.end_date}T23:59:59`), new Date())) : null;
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
    <div className="fixed inset-0 bg-[#0b0e14] overflow-hidden flex flex-col">
      {inspectionTarget && <VehicleInspectionSheet booking={inspectionTarget.booking} type={inspectionTarget.type} onClose={() => setInspectionTarget(null)} onComplete={() => {}} />}

      {/* Map Section - Top Half */}
      <div className="relative h-[45vh] min-h-[280px] flex-shrink-0">
        <FindMyVehicleMap booking={booking} vehicleColor={vehicle?.color || "#2a5d8f"} />
        
        {/* Vehicle Info Overlay */}
        <div className="absolute top-3 left-3 right-3">
          <div className="rounded-2xl bg-[#171c26] border border-white/10 p-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${gps.status === "online" ? "bg-emerald-400" : "bg-gray-400"}`} />
                <div>
                  <p className="text-sm font-bold text-white">{name}</p>
                  <p className="text-[10px] text-gray-400">{gps.status === "online" ? "Online • Live" : "Offline"}</p>
                </div>
              </div>
              <button className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-[10px] font-bold text-white">
                <MapPin className="h-3 w-3" />
                Full Map
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Section - Bottom Half */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 pb-20">
        {/* Remote Controls */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">REMOTE CONTROLS</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleCommand("lock")}
              disabled={!isBookingActive || !!activeCommand || !pickupInspectionComplete || dropoffInspectionComplete}
              className={`rounded-2xl p-3 transition-all ${
                !pickupInspectionComplete || dropoffInspectionComplete
                  ? "bg-[#171c26] opacity-50"
                  : "bg-[#2a5d8f] active:scale-95"
              }`}
            >
              <Lock className="h-5 w-5 text-white mx-auto mb-1" />
              <p className="text-xs font-bold text-white">Lock</p>
              <p className="text-[9px] text-gray-300">{pickupInspectionComplete && !dropoffInspectionComplete ? "Doors" : "Complete pickup"}</p>
            </button>
            <button
              onClick={() => handleCommand("unlock")}
              disabled={!isBookingActive || !!activeCommand || !pickupInspectionComplete || dropoffInspectionComplete}
              className={`rounded-2xl p-3 transition-all ${
                !pickupInspectionComplete || dropoffInspectionComplete
                  ? "bg-[#171c26] opacity-50"
                  : "bg-[#2a7e6f] active:scale-95"
              }`}
            >
              <Unlock className="h-5 w-5 text-white mx-auto mb-1" />
              <p className="text-xs font-bold text-white">Unlock</p>
              <p className="text-[9px] text-gray-300">{pickupInspectionComplete && !dropoffInspectionComplete ? "Doors" : "Complete pickup"}</p>
            </button>
            <button
              onClick={() => handleCommand("find")}
              disabled={!!activeCommand || !isBookingActive || dropoffInspectionComplete}
              className={`rounded-2xl p-3 transition-all ${
                !isBookingActive || dropoffInspectionComplete
                  ? "bg-[#171c26] opacity-50"
                  : "bg-[#e9527a] active:scale-95"
              }`}
            >
              <BellRing className="h-5 w-5 text-white mx-auto mb-1" />
              <p className="text-xs font-bold text-white">Find</p>
              <p className="text-[9px] text-gray-300">Locate vehicle</p>
            </button>
          </div>
        </div>

        {/* End Rental Button */}
        {!dropoffInspectionComplete && isBookingActive && (
          <button
            onClick={() => setInspectionTarget({ booking, type: "dropoff" })}
            className="w-full rounded-2xl bg-gradient-to-r from-[#e94e5b] to-[#f05252] p-3 active:scale-98"
          >
            <div className="flex items-center justify-center gap-2">
              <Camera className="h-4 w-4 text-white" />
              <div className="text-left">
                <p className="text-sm font-bold text-white">End Your Rental</p>
                <p className="text-[9px] text-white/80">Complete return inspection to stop billing immediately</p>
              </div>
            </div>
          </button>
        )}

        {/* Vehicle Status */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">VEHICLE STATUS</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-[#171c26] p-3">
              <Signal className={`h-4 w-4 mb-1 ${gps.status === "online" ? "text-emerald-400" : "text-gray-400"}`} />
              <p className="text-[9px] font-bold text-gray-400 uppercase">GPS SIGNAL</p>
              <p className="text-sm font-bold text-white">{gps.label}</p>
            </div>
            <div className="rounded-2xl bg-[#171c26] p-3">
              <Calendar className="h-4 w-4 mb-1 text-blue-400" />
              <p className="text-[9px] font-bold text-gray-400 uppercase">RENTAL DAYS</p>
              <p className="text-sm font-bold text-white">{dropoffInspectionComplete ? "Returned" : `${daysRemaining ?? 0} left`}</p>
            </div>
          </div>
        </div>

        {/* Rental Tools */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">RENTAL TOOLS</p>
          <div className="space-y-2">
            <button className="w-full rounded-2xl bg-[#171c26] p-3 flex items-center gap-3 active:scale-98">
              <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-blue-400" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-bold text-white">Message Host</p>
                <p className="text-[9px] text-gray-400">Start a conversation</p>
              </div>
            </button>
            <button className="w-full rounded-2xl bg-[#171c26] p-3 flex items-center gap-3 active:scale-98">
              <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Wrench className="h-4 w-4 text-blue-400" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-bold text-white">Support</p>
                <p className="text-[9px] text-gray-400">Get help with your rental</p>
              </div>
            </button>
            <button className="w-full rounded-2xl bg-[#171c26] p-3 flex items-center gap-3 active:scale-98">
              <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                <FileText className="h-4 w-4 text-blue-400" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-bold text-white">Documents</p>
                <p className="text-[9px] text-gray-400">View rental agreement</p>
              </div>
            </button>
          </div>
        </div>

        {/* Show Menu Toggle */}
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="w-full rounded-full bg-[#171c26] border border-white/10 py-2 flex items-center justify-center gap-1"
        >
          <ChevronUp className={`h-3 w-3 text-gray-400 transition-transform ${showMenu ? "rotate-180" : ""}`} />
          <span className="text-[10px] font-bold text-gray-400">{showMenu ? "Hide Menu" : "Show Menu"}</span>
        </button>
      </div>

      {/* Floating Chat Button */}
      <button className="fixed bottom-20 right-4 h-12 w-12 rounded-full bg-[#ff3b75] flex items-center justify-center shadow-lg active:scale-90">
        <MessageSquare className="h-5 w-5 text-white" />
      </button>
    </div>
  );
}