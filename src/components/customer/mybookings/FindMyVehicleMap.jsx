import React from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const ALLOWED_STATUSES = ["active", "approved", "confirmed", "payment_due", "grace_period", "return_pending_host_review", "under_review"];

// Premium pulsing dot representing the vehicle
function createVehicleIcon() {
  const iconHtml = `
    <div style="position:relative;width:40px;height:40px; display:flex; align-items:center; justify-content:center;">
      <!-- Pulsing outer ring -->
      <div style="
        position:absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: rgba(47,128,255,0.3);
        animation: mapPulse 2s ease-in-out infinite;
        z-index: 0;
      "></div>
      
      <!-- Inner blue dot -->
      <div style="
        position:relative;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #2F80FF;
        border: 2.5px solid #FFFFFF;
        box-shadow: 0 0 10px rgba(47,128,255,0.8);
        z-index: 1;
      "></div>
      
      <style>
        @keyframes mapPulse {
          0% { transform: scale(0.8); opacity: 0.8; }
          50% { transform: scale(1.5); opacity: 0.2; }
          100% { transform: scale(0.8); opacity: 0.8; }
        }
      </style>
    </div>
  `;

  return L.divIcon({
    html: iconHtml,
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

export default function FindMyVehicleMap({ booking, compact = false, vehicleColor = "#2F80FF" }) {
  const canShow = ALLOWED_STATUSES.includes(booking?.booking_status) &&
    booking?.payment_status === "paid" &&
    !booking?.starter_disabled &&
    !booking?.moovetrax_kill_active;

  const { data: devices = [] } = useQuery({
    queryKey: ["customer-find-vehicle", booking?.vehicle_id, canShow],
    queryFn: () => base44.entities.TelematicsDevice.filter({ vehicle_id: booking.vehicle_id }),
    enabled: !!booking?.vehicle_id && canShow,
    refetchInterval: 60_000,
  });

  if (!canShow) {
    return (
      <div style={{ height: "100%", width: "100%", background: "#0a0b0e", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <MapPin style={{ margin: "0 auto 8px", color: "#3a3a3a", width: 20, height: 20 }} />
          <p style={{ fontSize: 12, color: "#4a4a4a", fontWeight: 500 }}>Vehicle location available during active rental</p>
        </div>
      </div>
    );
  }

  const device = devices[0];
  const lat = device?.last_latitude;
  const lng = device?.last_longitude;

  if (!lat || !lng) {
    return (
      <div style={{ height: "100%", width: "100%", background: "#0a0b0e", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <MapPin style={{ margin: "0 auto 8px", color: "#3a3a3a", width: 20, height: 20 }} />
          <p style={{ fontSize: 12, color: "#4a4a4a", fontWeight: 500 }}>Waiting for GPS location...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", background: "#0a0b0e" }}>
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        scrollWheelZoom={false}
        zoomControl={false}
        style={{ height: "100%", width: "100%", background: "#0a0b0e" }}
      >
        {/* Dark blue-black Carto tiles — most premium dark style available */}
        <TileLayer
          attribution=""
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        />
        {/* Labels layer on top, styled minimally */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
        />
        <Marker position={[lat, lng]} icon={createVehicleIcon()} />
      </MapContainer>

      {/* Hide Leaflet attribution */}
      <style>{`.leaflet-control-attribution { display: none !important; }`}</style>
    </div>
  );
}