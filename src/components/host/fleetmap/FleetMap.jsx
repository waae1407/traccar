import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl/dist/maplibre-gl-csp.js";
import "maplibre-gl/dist/maplibre-gl.css";
import { classicDarkStyle } from "@/lib/mapStyles/classicDarkStyle";

// ── Worker blob (same pattern as FindMyVehicleMap) ──
let workerBlobUrlPromise = null;
function getWorkerBlobUrl() {
  if (!workerBlobUrlPromise) {
    workerBlobUrlPromise = fetch(
      "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl-csp-worker.js"
    )
      .then((r) => { if (!r.ok) throw new Error(`Worker fetch failed: ${r.status}`); return r.text(); })
      .then((text) => { const blob = new Blob([text], { type: "application/javascript" }); return URL.createObjectURL(blob); });
  }
  return workerBlobUrlPromise;
}

// ── Status colors ──
export const STATUS_COLORS = {
  Available: "#22C55E",
  Booked: "#3B82F6",
  "Active Rental": "#3B82F6",
  Reserved: "#3B82F6",
  "Payment Due": "#FF9F0A",
  "Grace Period": "#FF9F0A",
  Suspended: "#FF453A",
  Maintenance: "#8E8E93",
  "Out of Service": "#6B6B70",
  "Compliance Hold": "#FF453A",
  Retired: "#6B6B70",
  default: "#8E8E93",
};

export const STATUS_LABELS = {
  Available: "Available",
  Booked: "Rented",
  "Active Rental": "Rented",
  Reserved: "Reserved",
  "Payment Due": "Pay Due",
  "Grace Period": "Grace",
  Suspended: "Suspended",
  Maintenance: "Service",
  "Out of Service": "Off Road",
  "Compliance Hold": "Hold",
  Retired: "Retired",
  default: "Active",
};

function getStatusColor(status) { return STATUS_COLORS[status] || STATUS_COLORS.default; }
function getStatusLabel(status) { return STATUS_LABELS[status] || STATUS_LABELS.default; }

// ── Vehicle photo marker ──
function createVehicleMarkerElement(vehicle, device, onClick, onLongPress) {
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  const photo = vehicle.hero_image_url || vehicle.image_url;
  const statusColor = getStatusColor(vehicle.status);
  const statusLabel = getStatusLabel(vehicle.status);
  const hasGps = !!(device?.last_latitude);
  const gpsOnline = hasGps && device?.online_status !== "offline";
  const gpsColor = !hasGps ? "#6B6B70" : gpsOnline ? "#22C55E" : "#FF9F0A";

  el.innerHTML = `
    <div style="position:relative;width:54px;height:66px;pointer-events:auto;">
      <div style="position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);width:34px;height:6px;border-radius:50%;background:rgba(0,0,0,0.45);filter:blur(3px);"></div>
      <div style="width:48px;height:48px;border-radius:50%;border:3px solid ${statusColor};overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.1);position:relative;">
        ${photo
          ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"/><div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;background:#1a1a1a;color:#666;font-size:20px;">🚗</div>`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#1a1a1a;color:#666;font-size:20px;">🚗</div>`}
      </div>
      <div style="position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:${gpsColor};border:2px solid #0a0a0a;box-shadow:0 0 4px ${gpsColor};"></div>
      <div style="position:absolute;bottom:-15px;left:50%;transform:translateX(-50%);white-space:nowrap;background:${statusColor};color:white;font-size:9px;font-weight:800;padding:2px 8px;border-radius:9999px;text-transform:uppercase;letter-spacing:0.5px;box-shadow:0 1px 4px rgba(0,0,0,0.4);font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;">${statusLabel}</div>
    </div>
  `;

  // Tap + long-press
  let pressTimer = null;
  let pressed = false;
  const startPress = (e) => {
    pressed = false;
    pressTimer = setTimeout(() => { pressed = true; onLongPress(vehicle, e); }, 500);
  };
  const endPress = (e) => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (!pressed) { onClick(vehicle, e); }
  };
  const cancelPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };

  el.addEventListener("mousedown", startPress);
  el.addEventListener("mouseup", endPress);
  el.addEventListener("mouseleave", cancelPress);
  el.addEventListener("touchstart", startPress, { passive: true });
  el.addEventListener("touchend", endPress, { passive: true });
  el.addEventListener("touchmove", cancelPress, { passive: true });

  return el;
}

// ── Declutter: spread overlapping markers in a spiral so all are visible ──
function declutterMarkers(map, markers) {
  if (!map || !markers || markers.length === 0) return;

  const points = markers.map((m) => {
    const ll = m.getLngLat();
    const pt = map.project(ll);
    return { marker: m, x: pt.x, y: pt.y };
  });

  // Build adjacency — markers within 50px of each other
  const threshold = 50;
  const adj = points.map(() => []);
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < threshold) { adj[i].push(j); adj[j].push(i); }
    }
  }

  // Find connected components (BFS)
  const visited = new Array(points.length).fill(false);
  const groups = [];
  for (let i = 0; i < points.length; i++) {
    if (visited[i]) continue;
    const group = []; const queue = [i]; visited[i] = true;
    while (queue.length > 0) {
      const node = queue.shift(); group.push(node);
      for (const nb of adj[node]) { if (!visited[nb]) { visited[nb] = true; queue.push(nb); } }
    }
    groups.push(group);
  }

  // Apply spiral offset to overlapping groups (golden-angle sunflower pattern)
  const goldenAngle = 2.39996; // ~137.5°
  for (const group of groups) {
    if (group.length === 1) {
      points[group[0]].marker.setOffset([0, 0]);
    } else {
      for (let k = 0; k < group.length; k++) {
        const angle = k * goldenAngle;
        const radius = 30 + k * 8;
        points[group[k]].marker.setOffset([radius * Math.cos(angle), radius * Math.sin(angle)]);
      }
    }
  }
}

export default function FleetMap({ vehicles = [], devices = [], onSelectVehicle, onLongPressVehicle, focusVehicleId }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [workerReady, setWorkerReady] = useState(false);

  // Build a map of device by vehicle_id for quick lookup
  const deviceByVehicle = React.useMemo(() => {
    const map = {};
    for (const d of devices) { if (d.vehicle_id) map[d.vehicle_id] = d; }
    return map;
  }, [devices]);

  // Load worker
  useEffect(() => {
    getWorkerBlobUrl().then((url) => { maplibregl.setWorkerUrl(url); setWorkerReady(true); })
      .catch((err) => console.error("[FleetMap] Worker load failed:", err));
  }, []);

  // Vehicles with position
  const positionedVehicles = React.useMemo(() => {
    return vehicles.map((v) => {
      const dev = deviceByVehicle[v.id];
      const lat = dev?.last_latitude || v.vehicle_lat;
      const lng = dev?.last_longitude || v.vehicle_lon;
      if (!lat || !lng) return null;
      return { vehicle: v, device: dev, lat, lng };
    }).filter(Boolean);
  }, [vehicles, deviceByVehicle]);

  // Init map
  useEffect(() => {
    if (!workerReady || !mapContainer.current || mapRef.current) return;

    const center = positionedVehicles[0]
      ? [positionedVehicles[0].lng, positionedVehicles[0].lat]
      : [-97.0, 38.5]; // Default: center of USA

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: classicDarkStyle,
      center,
      zoom: positionedVehicles.length === 1 ? 14 : 4,
      interactive: true,
      attributionControl: false,
    });

    map.on("load", () => {});
    map.on("error", (e) => console.error("[FleetMap] Map error:", e));

    // Declutter markers on pan/zoom so overlapping vehicles spread out
    let rafId = null;
    const declutter = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => declutterMarkers(map, markersRef.current));
    };
    map.on("move", declutter);
    map.on("zoom", declutter);

    mapRef.current = map;

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [workerReady]);

  // Add/update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !workerReady) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const pv of positionedVehicles) {
      const el = createVehicleMarkerElement(pv.vehicle, pv.device, onSelectVehicle, onLongPressVehicle);
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([pv.lng, pv.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }

    // Fit bounds if more than one vehicle
    if (positionedVehicles.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      positionedVehicles.forEach((pv) => bounds.extend([pv.lng, pv.lat]));
      map.fitBounds(bounds, { padding: 80, maxZoom: 14 });
    }

    // Declutter overlapping markers (spiral spread)
    requestAnimationFrame(() => declutterMarkers(map, markersRef.current));
  }, [positionedVehicles, workerReady, onSelectVehicle, onLongPressVehicle]);

  // Focus on a specific vehicle (when focusVehicleId changes)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusVehicleId) return;
    const pv = positionedVehicles.find((p) => p.vehicle.id === focusVehicleId);
    if (pv) map.flyTo({ center: [pv.lng, pv.lat], zoom: Math.max(map.getZoom(), 14), duration: 800 });
  }, [focusVehicleId]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", background: "#0a0a0a" }}>
      <div ref={mapContainer} style={{ height: "100%", width: "100%" }} />
      {positionedVehicles.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a" }}>
          <div style={{ textAlign: "center", padding: 16 }}>
            <p style={{ fontSize: 14, color: "#4a4a4a", fontWeight: 600 }}>No vehicles with GPS coordinates yet.</p>
            <p style={{ fontSize: 12, color: "#3a3a3a", marginTop: 4 }}>Vehicles appear on the map once they have a pickup location or GPS device.</p>
          </div>
        </div>
      )}
    </div>
  );
}