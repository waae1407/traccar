import React from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const ALLOWED_STATUSES = ["active", "approved", "confirmed", "payment_due", "grace_period", "return_pending_host_review", "under_review"];

// Premium black teardrop pin with white car silhouette + blue radial glow at base
function createVehicleIcon() {
  const iconHtml = `
    <div style="position:relative;width:44px;height:58px;">
      <!-- Blue radial glow at base -->
      <div style="
        position:absolute;
        bottom:-6px;
        left:50%;
        transform:translateX(-50%);
        width:44px;
        height:22px;
        background:radial-gradient(ellipse at center, rgba(47,128,255,0.65) 0%, transparent 70%);
        filter:blur(4px);
      "></div>
      <!-- Pin shape -->
      <svg viewBox="0 0 44 58" fill="none" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:1;width:44px;height:58px;">
        <!-- Outer white border -->
        <path d="M22 1C10.402 1 1 10.402 1 22C1 36.5 22 57 22 57C22 57 43 36.5 43 22C43 10.402 33.598 1 22 1Z" fill="#111111" stroke="#FFFFFF" stroke-width="2"/>
        <!-- Car silhouette white -->
        <g transform="translate(9,10)">
          <!-- Car body -->
          <path d="M2 14 L4 9 L7 7 L17 7 L20 9 L22 14 L22 18 L2 18 Z" fill="#FFFFFF"/>
          <!-- Roof -->
          <path d="M7 7 L9 3 L15 3 L17 7 Z" fill="#FFFFFF"/>
          <!-- Windows (cutout dark) -->
          <path d="M9 7 L10 4 L14 4 L15 7 Z" fill="#111111"/>
          <!-- Wheels -->
          <circle cx="7" cy="18" r="2.5" fill="#111111" stroke="#FFFFFF" stroke-width="1"/>
          <circle cx="17" cy="18" r="2.5" fill="#111111" stroke="#FFFFFF" stroke-width="1"/>
        </g>
      </svg>
    </div>
  `;

  return L.divIcon({
    html: iconHtml,
    className: "",
    iconSize: [44, 58],
    iconAnchor: [22, 57],
    popupAnchor: [0, -58],
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