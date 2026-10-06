import React, { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl/dist/maplibre-gl-csp.js";
import "maplibre-gl/dist/maplibre-gl.css";
import { classicDarkStyle } from "@/lib/mapStyles/classicDarkStyle";
import { base44 } from "@/api/base44Client";
import { BookOpen, X } from "lucide-react";
import InstallerActionSheet from "@/components/installer/InstallerActionSheet";

const C360_LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";
const WIRING_DIAGRAM_URL = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e9b6202d9_9BC92AC8-0378-4BFD-A602-63508FF6D79E.png";

// Default fallback center (US midpoint)
const DEFAULT_CENTER = { lat: 38.5, lng: -97.0 };

let workerBlobUrlPromise = null;
function getWorkerBlobUrl() {
  if (!workerBlobUrlPromise) {
    workerBlobUrlPromise = fetch("https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl-csp-worker.js")
      .then((r) => { if (!r.ok) throw new Error(`Worker fetch failed: ${r.status}`); return r.text(); })
      .then((t) => { const b = new Blob([t], { type: "application/javascript" }); return URL.createObjectURL(b); });
  }
  return workerBlobUrlPromise;
}

function createDefaultPin(onClick) {
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = `
    <div style="position:relative;width:72px;height:72px;pointer-events:auto;">
      <!-- Red boundary circle (not installed) -->
      <div style="position:absolute;inset:0;border-radius:50%;border:3px solid #FF453A;box-shadow:0 0 18px rgba(255,69,58,0.6);animation:installPulse 2s ease-in-out infinite;"></div>
      <!-- Vehicle pin icon -->
      <div style="position:absolute;inset:7px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,0.2);background:#0a0a0a;display:flex;align-items:center;justify-content:center;">
        <div style="font-size:24px;">🚗</div>
      </div>
      <!-- Post-it label -->
      <div style="position:absolute;bottom:-26px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#FF453A;color:white;font-size:9px;font-weight:800;padding:3px 10px;border-radius:9999px;text-transform:uppercase;letter-spacing:0.5px;box-shadow:0 2px 8px rgba(0,0,0,0.5);">Tap to begin</div>
    </div>`;
  el.addEventListener("click", () => onClick());
  return el;
}

function createCompletedPin() {
  const el = document.createElement("div");
  el.style.cursor = "default";
  el.innerHTML = `
    <div style="position:relative;width:72px;height:72px;">
      <!-- Solid green boundary (installed) -->
      <div style="position:absolute;inset:0;border-radius:50%;border:3px solid #50C878;box-shadow:0 0 18px rgba(80,200,120,0.5);"></div>
      <div style="position:absolute;inset:7px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,0.2);background:#0a0a0a;display:flex;align-items:center;justify-content:center;">
        <div style="font-size:24px;">✅</div>
      </div>
      <div style="position:absolute;bottom:-26px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#50C878;color:white;font-size:9px;font-weight:800;padding:3px 10px;border-radius:9999px;text-transform:uppercase;letter-spacing:0.5px;box-shadow:0 2px 8px rgba(0,0,0,0.5);">Installed</div>
    </div>`;
  return el;
}

export default function InstallerMapDashboard() {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const pinRef = useRef(null);
  const [workerReady, setWorkerReady] = useState(false);
  const [user, setUser] = useState(null);
  const [pinLocation, setPinLocation] = useState(DEFAULT_CENTER);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [installComplete, setInstallComplete] = useState(false);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);

  // Get installer's current location for the default pin
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setPinLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setPinLocation(DEFAULT_CENTER),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  useEffect(() => {
    getWorkerBlobUrl().then((url) => { maplibregl.setWorkerUrl(url); setWorkerReady(true); }).catch((e) => console.error("[InstallerMap] Worker:", e));
  }, []);

  useEffect(() => {
    if (!workerReady || !mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: classicDarkStyle,
      center: [pinLocation.lng, pinLocation.lat],
      zoom: 15,
      interactive: true,
      attributionControl: false,
    });
    map.on("error", (e) => console.error("[InstallerMap]", e));
    mapRef.current = map;
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, [workerReady]);

  // Place / update the default pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !workerReady) return;
    pinRef.current?.remove();
    const el = installComplete ? createCompletedPin() : createDefaultPin(() => setSheetOpen(true));
    const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([pinLocation.lng, pinLocation.lat]).addTo(map);
    pinRef.current = marker;
    map.flyTo({ center: [pinLocation.lng, pinLocation.lat], zoom: 15, duration: 600 });
  }, [pinLocation, workerReady, installComplete]);

  const handleComplete = useCallback(() => {
    setSheetOpen(false);
    setInstallComplete(true);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0a0a0a" }}>
      <style>{`@keyframes installPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.6; transform:scale(1.08); } }`}</style>
      <div ref={mapContainer} style={{ height: "100%", width: "100%" }} />

      {/* Top bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 10, pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "auto" }}>
          <img src={C360_LOGO} alt="C360" style={{ height: 26, objectFit: "contain" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#8E8E93", textTransform: "uppercase", letterSpacing: "0.05em" }}>Installer</span>
        </div>
        <button onClick={() => setShowGuide(true)} style={{ background: "rgba(28,28,30,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "7px 10px", display: "flex", alignItems: "center", gap: 5, cursor: "pointer", backdropFilter: "blur(10px)", pointerEvents: "auto" }}>
          <BookOpen size={15} color="#F5F5F7" />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#F5F5F7" }}>Guide</span>
        </button>
      </div>

      {/* Setup guide card beside the pin */}
      {!sheetOpen && !installComplete && (
        <div style={{ position: "absolute", right: 12, top: 56, maxWidth: 190, zIndex: 10 }}>
          <div style={{ background: "rgba(28,28,30,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 12, backdropFilter: "blur(10px)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <BookOpen size={15} color="#50C878" />
              <span style={{ fontSize: 12, fontWeight: 800, color: "#F5F5F7" }}>Setup Guide</span>
            </div>
            <p style={{ fontSize: 11, color: "#8E8E93", lineHeight: 1.5, margin: 0 }}>Tap the red pin to begin. Scan device, test commands, done in 60 seconds.</p>
            <button onClick={() => setShowGuide(true)} style={{ marginTop: 8, background: "none", border: "none", color: "#50C878", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>View wiring diagram →</button>
          </div>
        </div>
      )}

      {/* Guide modal */}
      {showGuide && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowGuide(false)}>
          <div style={{ background: "#1C1C1E", borderRadius: 16, padding: 14, maxWidth: 500, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#F5F5F7", margin: 0 }}>Wiring Diagram</h2>
              <button onClick={() => setShowGuide(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="#8E8E93" /></button>
            </div>
            <img src={WIRING_DIAGRAM_URL} alt="Wiring Diagram" style={{ width: "100%", borderRadius: 12, objectFit: "contain" }} />
          </div>
        </div>
      )}

      {/* Action sheet */}
      {sheetOpen && <InstallerActionSheet user={user} onClose={() => setSheetOpen(false)} onComplete={handleComplete} />}
    </div>
  );
}