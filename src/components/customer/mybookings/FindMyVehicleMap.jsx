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

// Gold map pin with green checkmark badge — matches mockup aesthetic
function createVehicleIcon(isStale = false) {
  const labelHtml = isStale
    ? `<div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(255,159,10,0.95);color:#1A1A1A;font-size:9px;font-weight:800;letter-spacing:0.05em;padding:2px 7px;border-radius:6px;white-space:nowrap;z-index:3;box-shadow:0 2px 8px rgba(0,0,0,0.4);">DELAYED</div>`
    : "";

  const iconHtml = `
    <div style="position:relative;width:48px;height:56px;display:flex;align-items:flex-start;justify-content:center;">
      ${labelHtml}
      <svg width="40" height="48" viewBox="0 0 24 28" fill="none" style="filter: drop-shadow(0 0 10px rgba(212,175,55,0.6));">
        <path d="M12 0C7.5 0 4 3.5 4 8c0 6 8 20 8 20s8-14 8-20c0-4.5-3.5-8-8-8z" fill="#D4AF37" stroke="#FFD700" stroke-width="0.8"/>
        <circle cx="12" cy="8" r="3.5" fill="#0a0a0a"/>
      </svg>
      <div style="position:absolute;bottom:0;right:0px;width:18px;height:18px;border-radius:50%;background:#39FF14;border:2px solid #000;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px rgba(57,255,20,0.6);">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M5 12l5 5L20 7" stroke="#000" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
  `;

  return L.divIcon({
    html: iconHtml,
    className: "",
    iconSize: [48, 56],
    iconAnchor: [24, 52],
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

  const effectiveSeenAt = liveSeenAt || device?.last_seen_at;
  const isStale = !effectiveSeenAt || (Date.now() - new Date(effectiveSeenAt).getTime() > 2 * 60 * 1000);

  if (!canShow) {
    return (
      <div style={{ height: "100%", width: "100%", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <MapPin style={{ margin: "0 auto 8px", color: "#3a3a3a", width: 20, height: 20 }} />
          <p style={{ fontSize: 12, color: "#4a4a4a", fontWeight: 500 }}>Vehicle location available during active rental</p>
        </div>
      </div>
    );
  }

  if (!lat || !lng) {
    return (
      <div style={{ height: "100%", width: "100%", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <MapPin style={{ margin: "0 auto 8px", color: "#3a3a3a", width: 20, height: 20 }} />
          <p style={{ fontSize: 12, color: "#4a4a4a", fontWeight: 500 }}>Waiting for GPS location...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", background: "#000" }}>
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom={false}
        zoomControl={false}
        style={{ height: "100%", width: "100%", background: "#000" }}
      >
        <TileLayer
          attribution=""
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          className="neon-green-tiles"
        />
        <TileLayer
          attribution=""
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
          className="neon-green-labels"
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

      <style>{`
        .leaflet-control-attribution { display: none !important; }
        .neon-green-tiles { filter: hue-rotate(85deg) saturate(2.8) brightness(0.82) contrast(1.35); }
        .neon-green-labels { filter: hue-rotate(85deg) saturate(2) brightness(0.85) contrast(1.2); }
      `}</style>
    </div>
  );
}