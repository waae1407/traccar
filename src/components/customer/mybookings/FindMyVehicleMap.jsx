import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import { MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Re-centers the map when the vehicle position changes (Leaflet ignores center prop after mount)
function MapRecenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.panTo([lat, lng], { animate: true, duration: 0.5 });
    }
  }, [lat, lng, map]);
  return null;
}

const ALLOWED_STATUSES = ["active", "approved", "confirmed", "payment_due", "grace_period", "return_pending_host_review", "under_review"];

// Tesla-style orbital vehicle marker — cyan core, radar pulse rings, orbital halo
function createVehicleIcon() {
  const iconHtml = `
    <div style="position:relative;width:64px;height:64px; display:flex; align-items:center; justify-content:center;">
      <!-- Orbital ring (static) -->
      <div style="
        position:absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 1px solid rgba(120,228,225,0.2);
        z-index: 0;
      "></div>

      <!-- Radar pulse 1 -->
      <div style="
        position:absolute;
        width: 60%;
        height: 60%;
        border-radius: 50%;
        background: rgba(120,228,225,0.25);
        animation: orbitalPulse 3s ease-out infinite;
        z-index: 0;
      "></div>

      <!-- Radar pulse 2 (offset) -->
      <div style="
        position:absolute;
        width: 60%;
        height: 60%;
        border-radius: 50%;
        background: rgba(120,228,225,0.15);
        animation: orbitalPulse 3s ease-out infinite;
        animation-delay: 1.5s;
        z-index: 0;
      "></div>

      <!-- Inner cyan core -->
      <div style="
        position:relative;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #78e4e1;
        border: 2px solid rgba(255,255,255,0.92);
        box-shadow: 0 0 12px rgba(120,228,225,0.9), 0 0 28px rgba(120,228,225,0.35);
        z-index: 2;
      "></div>

      <style>
        @keyframes orbitalPulse {
          0% { transform: scale(0.3); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      </style>
    </div>
  `;

  return L.divIcon({
    html: iconHtml,
    className: "",
    iconSize: [64, 64],
    iconAnchor: [32, 32],
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
      <div style={{ height: "100%", width: "100%", background: "#050506", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
      <div style={{ height: "100%", width: "100%", background: "#050506", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <MapPin style={{ margin: "0 auto 8px", color: "#3a3a3a", width: 20, height: 20 }} />
          <p style={{ fontSize: 12, color: "#4a4a4a", fontWeight: 500 }}>Waiting for GPS location...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "relative", height: "100%", width: "100%", background: "#0a1420",
      WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)",
      WebkitMaskComposite: "source-in",
      maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)",
      maskComposite: "intersect",
    }}>
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom={false}
        zoomControl={false}
        style={{ height: "100%", width: "100%", background: "#0a1420" }}
      >
        <TileLayer
          attribution='&copy; Esri'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          className="tesla-orbital-tiles"
        />
        <Marker position={[lat, lng]} icon={createVehicleIcon()} />
        <MapRecenter lat={lat} lng={lng} />
      </MapContainer>

      {/* Tesla orbital map styling */}
      <style>{`
        .leaflet-control-attribution { display: none !important; }
        .tesla-orbital-tiles { filter: brightness(0.6) contrast(1.15) saturate(0.7) hue-rotate(185deg); }
      `}</style>
    </div>
  );
}