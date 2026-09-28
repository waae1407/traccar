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
function createVehicleIcon(isStale = false) {
  const coreColor = isStale ? "#FF9F0A" : "#78e4e1";
  const ringBorder = isStale ? "rgba(255,159,10,0.25)" : "rgba(120,228,225,0.2)";
  const pulse1Bg = isStale ? "rgba(255,159,10,0.25)" : "rgba(120,228,225,0.25)";
  const pulse2Bg = isStale ? "rgba(255,159,10,0.15)" : "rgba(120,228,225,0.15)";
  const glowShadow = isStale
    ? "0 0 12px rgba(255,159,10,0.9), 0 0 28px rgba(255,159,10,0.35)"
    : "0 0 12px rgba(120,228,225,0.9), 0 0 28px rgba(120,228,225,0.35)";
  const labelHtml = isStale
    ? `<div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(255,159,10,0.95);color:#1A1A1A;font-size:9px;font-weight:800;letter-spacing:0.05em;padding:2px 7px;border-radius:6px;white-space:nowrap;z-index:3;box-shadow:0 2px 8px rgba(0,0,0,0.4);">DELAYED</div>`
    : "";

  const iconHtml = `
    <div style="position:relative;width:64px;height:64px; display:flex; align-items:center; justify-content:center;">
      ${labelHtml}
      <!-- Orbital ring (static) -->
      <div style="
        position:absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 1px solid ${ringBorder};
        z-index: 0;
      "></div>

      <!-- Radar pulse 1 -->
      <div style="
        position:absolute;
        width: 60%;
        height: 60%;
        border-radius: 50%;
        background: ${pulse1Bg};
        animation: orbitalPulse 3s ease-out infinite;
        z-index: 0;
      "></div>

      <!-- Radar pulse 2 (offset) -->
      <div style="
        position:absolute;
        width: 60%;
        height: 60%;
        border-radius: 50%;
        background: ${pulse2Bg};
        animation: orbitalPulse 3s ease-out infinite;
        animation-delay: 1.5s;
        z-index: 0;
      "></div>

      <!-- Inner core -->
      <div style="
        position:relative;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: ${coreColor};
        border: 2px solid rgba(255,255,255,0.92);
        box-shadow: ${glowShadow};
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

  const device = devices[0];

  // ── Live position: pull directly from Traccar every 20s ──
  // Bypasses the 15-min cron cache so the map shows real-time GPS.
  // syncSingleTraccarPosition also writes to the DB, refreshing the cache for
  // all consumers (address, VehicleCommandCenter, etc.).
  const { data: livePos } = useQuery({
    queryKey: ["live-vehicle-position", device?.id],
    queryFn: () => base44.functions.invoke("syncSingleTraccarPosition", { telematics_device_id: device.id }),
    enabled: !!device?.id && canShow,
    refetchInterval: 20_000,
    retry: 1,
  });

  const liveLat = livePos?.position?.lat;
  const liveLng = livePos?.position?.lng;
  const liveSeenAt = livePos?.seen_at;

  const lat = liveLat || device?.last_latitude;
  const lng = liveLng || device?.last_longitude;

  // Staleness: "delayed" if the effective fix time is >2 min old.
  // Uses the live Traccar fix time when available, falls back to DB last_seen_at.
  const effectiveSeenAt = liveSeenAt || device?.last_seen_at;
  const isStale = !effectiveSeenAt || (Date.now() - new Date(effectiveSeenAt).getTime() > 2 * 60 * 1000);

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
        <Marker position={[lat, lng]} icon={createVehicleIcon(isStale)} />
        <MapRecenter lat={lat} lng={lng} />
      </MapContainer>

      {/* Delayed GPS indicator */}
      {isStale && (
        <div style={{
          position: "absolute", top: 10, left: 10, zIndex: 400,
          background: "rgba(255,159,10,0.92)", color: "#1A1A1A",
          fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
          padding: "4px 10px", borderRadius: 8,
          display: "flex", alignItems: "center", gap: 5,
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1A1A1A" }} />
          DELAYED GPS
        </div>
      )}

      {/* Tesla orbital map styling */}
      <style>{`
        .leaflet-control-attribution { display: none !important; }
        .tesla-orbital-tiles { filter: brightness(0.6) contrast(1.15) saturate(0.7) hue-rotate(185deg); }
      `}</style>
    </div>
  );
}