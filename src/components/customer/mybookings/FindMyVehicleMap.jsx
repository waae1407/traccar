import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl/dist/maplibre-gl-csp.js";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { neonGreenDarkStyle } from "@/lib/mapStyles/neonGreenDarkStyle";
import { mutedDarkSlateStyle } from "@/lib/mapStyles/mutedDarkSlateStyle";
import { satelliteStyle } from "@/lib/mapStyles/satelliteStyle";

// Base44 Vite plugin blocks ?worker&url and ?raw imports, and browsers block
// cross-origin worker URLs. Fetch the worker script from CDN and create a
// same-origin blob URL that MapLibre can use.
let workerBlobUrlPromise = null;
function getWorkerBlobUrl() {
  if (!workerBlobUrlPromise) {
    workerBlobUrlPromise = fetch(
      "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl-csp-worker.js"
    )
      .then((r) => {
        if (!r.ok) throw new Error(`Worker fetch failed: ${r.status}`);
        return r.text();
      })
      .then((text) => {
        const blob = new Blob([text], { type: "application/javascript" });
        return URL.createObjectURL(blob);
      });
  }
  return workerBlobUrlPromise;
}

const ALLOWED_STATUSES = [
  "active",
  "approved",
  "confirmed",
  "payment_due",
  "grace_period",
  "return_pending_host_review",
  "under_review",
];

// Black teardrop pin (white outline) with a white car inside and a blue glow beneath — matches reference
function createVehicleMarkerElement() {
  const el = document.createElement("div");
  el.innerHTML = `
    <div style="position:relative;width:44px;height:56px;pointer-events:none;">
      <div style="position:absolute;left:50%;top:78%;width:96px;height:96px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle, rgba(47,128,255,0.75) 0%, rgba(47,128,255,0.35) 30%, rgba(47,128,255,0.10) 55%, transparent 72%);"></div>
      <svg width="44" height="56" viewBox="0 0 44 56" fill="none" style="position:absolute;inset:0;filter:drop-shadow(0 0 10px rgba(47,128,255,0.55)) drop-shadow(0 2px 4px rgba(0,0,0,0.6));">
        <path d="M22 2C11.5 2 3 10.5 3 21c0 12 19 31 19 31s19-19 19-31C41 10.5 32.5 2 22 2z" fill="#0A0A0A" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
        <path d="M15.5 19 L17.5 14.5 Q18 13.5 19.2 13.5 H24.8 Q26 13.5 26.5 14.5 L28.5 19 Z" fill="#FFFFFF"/>
        <path d="M17.6 18.3 L18.9 15.2 H25.1 L26.4 18.3 Z" fill="#0A0A0A"/>
        <rect x="13" y="19" width="18" height="7" rx="2" fill="#FFFFFF"/>
        <circle cx="16.5" cy="22.5" r="1.2" fill="#0A0A0A"/>
        <circle cx="27.5" cy="22.5" r="1.2" fill="#0A0A0A"/>
        <rect x="14" y="25" width="3.5" height="3" rx="1" fill="#FFFFFF"/>
        <rect x="26.5" y="25" width="3.5" height="3" rx="1" fill="#FFFFFF"/>
      </svg>
    </div>
  `;
  el.style.cursor = "default";
  return el;
}

export default function FindMyVehicleMap({
  booking,
  compact = false,
  vehicleColor = "#2F80FF",
  mapStyleName,
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [workerReady, setWorkerReady] = useState(false);
  const [searchParams] = useSearchParams();
  const mapStyle =
    mapStyleName === "satellite" ? satelliteStyle
    : (mapStyleName === "slate" || searchParams.get("map") === "slate") ? mutedDarkSlateStyle
    : neonGreenDarkStyle;

  // Load the MapLibre worker as a same-origin blob URL
  useEffect(() => {
    getWorkerBlobUrl()
      .then((url) => {
        maplibregl.setWorkerUrl(url);
        setWorkerReady(true);
      })
      .catch((err) => console.error("[FindMyVehicleMap] Worker load failed:", err));
  }, []);

  const canShow =
    ALLOWED_STATUSES.includes(booking?.booking_status) &&
    booking?.payment_status === "paid" &&
    !booking?.starter_disabled &&
    !booking?.moovetrax_kill_active;

  const { data: devices = [] } = useQuery({
    queryKey: ["customer-find-vehicle", booking?.vehicle_id, canShow],
    queryFn: () =>
      base44.entities.TelematicsDevice.filter({ vehicle_id: booking.vehicle_id }),
    enabled: !!booking?.vehicle_id && canShow,
    refetchInterval: 60_000,
  });

  const device = devices[0];

  // ── Live position: pull directly from Traccar every 20s ──
  const { data: livePos } = useQuery({
    queryKey: ["live-vehicle-position", device?.id],
    queryFn: () =>
      base44.functions.invoke("syncSingleTraccarPosition", {
        telematics_device_id: device.id,
      }),
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
  const isStale =
    !effectiveSeenAt ||
    Date.now() - new Date(effectiveSeenAt).getTime() > 2 * 60 * 1000;

  // ── Initialize map when canShow becomes true and worker is ready ──
  useEffect(() => {
    if (!workerReady || !canShow || !mapContainer.current || mapRef.current) return;

    const center = lat && lng ? [lng, lat] : [-87.6298, 41.8781]; // Default: Chicago

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: mapStyle,
      center,
      zoom: 14.7,
      interactive: false,
      attributionControl: false,
    });

    map.on("load", () => {
      // Auto-center: add bottom padding equal to the action dock height
      // so the vehicle marker centers in the visible area above the dock
      map.setPadding({ top: 0, bottom: 112, left: 0, right: 0 });
      setMapReady(true);
    });
    map.on("error", (e) => console.error("[FindMyVehicleMap] Map error:", e));
    mapRef.current = map;

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      setMapReady(false);
    };
  }, [workerReady, canShow, mapStyle]);

  // ── Add/update marker when map is ready or coordinates change ──
  useEffect(() => {
    if (!mapReady || !lat || !lng) return;
    const map = mapRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      markerRef.current = new maplibregl.Marker({
        element: createVehicleMarkerElement(),
        anchor: "bottom",
      })
        .setLngLat([lng, lat])
        .addTo(map);
    }
    // panTo uses the map's padding to auto-center the marker in the visible area
    map.panTo([lng, lat], { duration: 500 });
  }, [mapReady, lat, lng]);


  if (!canShow) {
    return (
      <div
        style={{
          height: "100%",
          width: "100%",
          background: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center", padding: 16 }}>
          <MapPin
            style={{ margin: "0 auto 8px", color: "#3a3a3a", width: 20, height: 20 }}
          />
          <p style={{ fontSize: 12, color: "#4a4a4a", fontWeight: 500 }}>
            Vehicle location available during active rental
          </p>
        </div>
      </div>
    );
  }

  // Always render the map container so the ref is available for the init effect.
  // Loading/stale messages are overlaid on top.
  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        background: "#0a0a0a",
      }}
    >
      <div ref={mapContainer} style={{ height: "100%", width: "100%" }} />
      {(!lat || !lng) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0a0a",
          }}
        >
          <div style={{ textAlign: "center", padding: 16 }}>
            <MapPin
              style={{ margin: "0 auto 8px", color: "#3a3a3a", width: 20, height: 20 }}
            />
            <p style={{ fontSize: 12, color: "#4a4a4a", fontWeight: 500 }}>
              Waiting for GPS location...
            </p>
          </div>
        </div>
      )}
      {isStale && lat && lng && (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 400,
            background: "rgba(10,10,12,0.78)",
            border: "1px solid rgba(255,179,64,0.3)",
            color: "#FFB340",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.06em",
            padding: "4px 9px",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 5,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#FFB340",
            }}
          />
          DELAYED GPS
        </div>
      )}
    </div>
  );
}