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

// White car icon inside a white drop-pin shape with soft blue glow aura
function createVehicleMarkerElement(isStale = false) {
  const el = document.createElement("div");
  const labelHtml = isStale
    ? `<div style="position:absolute;top:-24px;left:50%;transform:translateX(-50%);background:rgba(255,159,10,0.95);color:#1A1A1A;font-size:9px;font-weight:800;letter-spacing:0.05em;padding:2px 7px;border-radius:6px;white-space:nowrap;z-index:3;box-shadow:0 2px 8px rgba(0,0,0,0.4);">DELAYED</div>`
    : "";
  el.innerHTML = `
    <div style="position:relative;width:80px;height:80px;">
      ${labelHtml}
      <div style="position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);width:76px;height:76px;border-radius:50%;background:radial-gradient(circle, rgba(59,130,246,0.35) 0%, rgba(59,130,246,0.12) 50%, transparent 70%);filter:blur(3px);z-index:0;"></div>
      <svg width="44" height="56" viewBox="0 0 44 56" fill="none" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1;filter:drop-shadow(0 0 12px rgba(59,130,246,0.6)) drop-shadow(0 2px 6px rgba(0,0,0,0.5));">
        <path d="M22 2C11.5 2 3 10.5 3 21c0 12 19 31 19 31s19-19 19-31C41 10.5 32.5 2 22 2z" fill="#ffffff" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M22 5C13.2 5 6 12.2 6 21c0 9.5 16 26 16 26s16-16.5 16-26C38 12.2 30.8 5 22 5z" fill="#1a1a1a" opacity="0.05"/>
        <g transform="translate(10, 14) scale(1.0)">
          <path d="M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11v6h-1v1.5a1 1 0 01-2 0V17H8v1.5a1 1 0 01-2 0V17H5v-6z" fill="#1a1a1a" stroke="#1a1a1a" stroke-width="0.5" stroke-linejoin="round"/>
          <path d="M7 11h10" stroke="#fff" stroke-width="0.8" stroke-linecap="round" opacity="0.5"/>
          <circle cx="8" cy="14.5" r="1.2" fill="#1a1a1a"/>
          <circle cx="16" cy="14.5" r="1.2" fill="#1a1a1a"/>
        </g>
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
  const isStaleRef = useRef(false);
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

    map.on("load", () => setMapReady(true));
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
        element: createVehicleMarkerElement(isStale),
        anchor: "center",
      })
        .setLngLat([lng, lat])
        .addTo(map);
    }
    map.panTo([lng, lat], { duration: 500 });
  }, [mapReady, lat, lng]);

  // ── Update stale indicator on marker ──
  useEffect(() => {
    if (isStale === isStaleRef.current) return;
    isStaleRef.current = isStale;
    const map = mapRef.current;
    if (!map || !markerRef.current) return;

    const pos = markerRef.current.getLngLat();
    markerRef.current.remove();
    markerRef.current = new maplibregl.Marker({
      element: createVehicleMarkerElement(isStale),
      anchor: "center",
    })
      .setLngLat([pos.lng, pos.lat])
      .addTo(map);
  }, [isStale]);

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
            background: "rgba(255,159,10,0.92)",
            color: "#1A1A1A",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.05em",
            padding: "4px 10px",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 5,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#1A1A1A",
            }}
          />
          DELAYED GPS
        </div>
      )}
    </div>
  );
}