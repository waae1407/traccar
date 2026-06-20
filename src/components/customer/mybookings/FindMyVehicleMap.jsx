import React from "react";
import { MapPin, Car } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

const ALLOWED_STATUSES = ["active", "approved", "confirmed", "pending_review"];

export default function FindMyVehicleMap({ booking, compact = false }) {
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
    <div className="relative h-full w-full rounded-2xl overflow-hidden border border-gray-200">
      <iframe
        width="100%"
        height="100%"
        frameBorder="0"
        scrolling="no"
        marginHeight="0"
        marginWidth="0"
        src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
        className="absolute inset-0"
      />
      
      {/* Vehicle marker overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          <div className="absolute -inset-4 bg-primary/20 rounded-full animate-ping" />
          <div className="relative h-12 w-12 rounded-full bg-white shadow-xl flex items-center justify-center border-2 border-primary">
            <Car className="h-6 w-6 text-primary" />
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-primary rotate-45" />
        </div>
      </div>

      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 right-3 bg-white px-3 py-2 rounded-lg text-xs font-bold shadow-lg hover:bg-gray-50"
      >
        Open in Maps
      </a>
    </div>
  );
}