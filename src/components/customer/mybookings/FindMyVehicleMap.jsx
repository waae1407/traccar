import React from "react";
import { MapPin, Car } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

const ALLOWED_STATUSES = ["active", "approved", "confirmed", "pending_review"];

export default function FindMyVehicleMap({ booking, compact = false, vehicleColor = "#e91e8c" }) {
  const canShow = ALLOWED_STATUSES.includes(booking?.booking_status) &&
    booking?.payment_status === "paid" &&
    !booking?.starter_disabled &&
    !booking?.moovetrax_kill_active;

  const { data: devices = [], refetch } = useQuery({
    queryKey: ["customer-find-vehicle", booking?.vehicle_id, canShow],
    queryFn: () => base44.entities.TelematicsDevice.filter({ vehicle_id: booking.vehicle_id }),
    enabled: !!booking?.vehicle_id && canShow,
    refetchInterval: 60_000,
  });

  if (!canShow) {
    return (
      <div className="h-full w-full rounded-2xl border border-[#262626] bg-[#121212] flex items-center justify-center">
        <div className="text-center p-4">
          <MapPin className="mx-auto mb-2 h-5 w-5 text-gray-600" />
          <p className="text-xs font-semibold text-gray-500">Vehicle location available during active rental</p>
        </div>
      </div>
    );
  }

  const device = devices[0];
  const lat = device?.last_latitude;
  const lng = device?.last_longitude;

  if (!lat || !lng) {
    return (
      <div className="h-full w-full rounded-2xl border border-[#262626] bg-[#121212] flex items-center justify-center">
        <div className="text-center p-4">
          <MapPin className="mx-auto mb-2 h-5 w-5 text-gray-600" />
          <p className="text-xs font-semibold text-gray-500">Waiting for GPS location...</p>
        </div>
      </div>
    );
  }

  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}&z=15`;

  return (
    <div className="relative h-full w-full rounded-2xl overflow-hidden">
      <iframe
        width="100%"
        height="100%"
        frameBorder="0"
        scrolling="no"
        marginHeight="0"
        marginWidth="0"
        src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
        className="absolute inset-0"
        style={{ 
          filter: "invert(92%) hue-rotate(180deg) brightness(90%) contrast(95%) saturate(0.8)",
          background: "#0a0a0a"
        }}
      />
      {/* Vehicle marker overlay - white teardrop pin with cyan glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          {/* Bright cyan/blue glow underneath */}
          <div 
            className="absolute rounded-full"
            style={{ 
              width: '72px', 
              height: '72px', 
              marginLeft: '-36px', 
              marginTop: '-36px',
              background: "radial-gradient(circle, rgba(41,151,255,0.6) 0%, rgba(41,151,255,0.2) 60%, transparent 70%)",
              filter: "blur(14px)"
            }} 
          />
          {/* White teardrop-shaped pin */}
          <div className="relative flex flex-col items-center">
            <div 
              className="h-12 w-12 rounded-full bg-white flex items-center justify-center shadow-2xl"
              style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.4), 0 0 0 4px rgba(41,151,255,0.4)" }}
            >
              <Car className="h-7 w-7 text-[#2997ff]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}