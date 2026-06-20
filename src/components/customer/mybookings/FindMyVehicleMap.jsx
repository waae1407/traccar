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
      {/* Vehicle marker overlay - teardrop pin with blue glow at base */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          {/* Blue neon glow at base of pin */}
          <div 
            className="absolute"
            style={{ 
              width: '48px', 
              height: '48px', 
              marginLeft: '-24px', 
              marginTop: '-12px',
              background: "radial-gradient(ellipse at center bottom, rgba(46,104,255,0.6) 0%, rgba(46,104,255,0.2) 40%, transparent 70%)",
              filter: "blur(8px)"
            }} 
          />
          {/* Black teardrop pin with white border */}
          <div className="relative" style={{ width: '32px', height: '44px' }}>
            <svg viewBox="0 0 32 44" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* White border/stroke */}
              <path 
                d="M16 0C7.163 0 0 7.163 0 16C0 26.4 16 44 16 44C16 44 32 26.4 32 16C32 7.163 24.837 0 16 0Z" 
                fill="#000000" 
                stroke="#FFFFFF" 
                strokeWidth="2.5"
              />
              {/* White car icon - frontal view */}
              <path 
                d="M8 18C8 18 9 16 12 16H20C23 16 24 18 24 18V24C24 24 23 26 20 26H12C9 26 8 24 8 24V18Z" 
                fill="#FFFFFF"
              />
              <rect x="10" y="20" width="3" height="2" fill="#000000" />
              <rect x="19" y="20" width="3" height="2" fill="#000000" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}