import React from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { MapPin, Navigation } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const ALLOWED_STATUSES = ["active", "approved", "confirmed", "payment_due", "grace_period", "return_pending_host_review", "under_review"];

// Custom teardrop marker icon
function createVehicleIcon() {
  const iconHtml = `
    <div style="position: relative; width: 40px; height: 52px;">
      <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 32px; height: 16px; background: radial-gradient(ellipse at center, rgba(46,104,255,0.5) 0%, transparent 70%); filter: blur(6px);"></div>
      <svg viewBox="0 0 40 52" fill="none" xmlns="http://www.w3.org/2000/svg" style="position: relative; z-index: 1;">
        <path d="M20 0C8.954 0 0 8.954 0 20C0 33 20 52 20 52C20 52 40 33 40 20C40 8.954 31.046 0 20 0Z" fill="#000000" stroke="#FFFFFF" stroke-width="3"/>
        <path d="M12 22C12 22 14 18 18 18H22C26 18 28 22 28 22V28C28 28 26 32 22 32H18C14 32 12 28 12 28V22Z" fill="#FFFFFF"/>
        <rect x="14" y="24" width="4" height="3" fill="#000000"/>
        <rect x="22" y="24" width="4" height="3" fill="#000000"/>
      </svg>
    </div>
  `;
  
  return L.divIcon({
    html: iconHtml,
    className: 'vehicle-marker',
    iconSize: [40, 52],
    iconAnchor: [20, 52],
    popupAnchor: [0, -52]
  });
}

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

  const handleOpenNavigation = () => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank");
  };

  return (
    <div className="relative h-full w-full rounded-2xl overflow-hidden bg-[#0f0f0f]">
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        scrollWheelZoom={false}
        zoomControl={false}
        className="h-full w-full"
        style={{ background: "#0f0f0f" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Marker position={[lat, lng]} icon={createVehicleIcon()} />
      </MapContainer>
      
      {/* Navigation button */}
      <button
        onClick={handleOpenNavigation}
        className="absolute top-3 right-3 h-9 w-9 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors"
      >
        <Navigation className="h-4 w-4 text-white" style={{ transform: "rotate(45deg)" }} />
      </button>
    </div>
  );
}