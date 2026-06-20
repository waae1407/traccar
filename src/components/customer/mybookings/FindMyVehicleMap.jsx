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
      <div className="h-full w-full rounded-2xl border border-gray-100 bg-gray-50 flex items-center justify-center">
        <div className="text-center p-4">
          <MapPin className="mx-auto mb-2 h-5 w-5 text-gray-300" />
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
      <div className="h-full w-full rounded-2xl border border-gray-100 bg-gray-50 flex items-center justify-center">
        <div className="text-center p-4">
          <MapPin className="mx-auto mb-2 h-5 w-5 text-gray-300" />
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
        style={{ filter: "invert(90%) hue-rotate(180deg) contrast(1.2)" }}
      />
      {/* Vehicle marker overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          <div className="absolute inset-0 blur-xl opacity-60 bg-blue-500 rounded-full" style={{ width: '80px', height: '80px', marginLeft: '-40px', marginTop: '-40px' }} />
          <div className="relative bg-white rounded-full p-4 shadow-2xl">
            <Car className="h-6 w-6 text-blue-500" />
          </div>
        </div>
      </div>
    </div>
  );
}