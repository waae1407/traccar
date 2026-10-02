import { useState, useEffect, useCallback } from "react";

// Vehicle UI skin registry. Each skin picks an overlay variant + map style.
// "original" = pre-mockup UI (SAFE DRIVER pill, stronger glows) — default.
// "neon" / "slate" = compact mockup UI with neon / slate map.
export const VEHICLE_SKINS = [
  { id: "original", label: "Original", blurb: "Safe Driver pill, stronger glow", mapStyleName: "neon", overlay: "original" },
  { id: "neon", label: "Neon", blurb: "Compact mockup, neon map", mapStyleName: "neon", overlay: "compact" },
  { id: "slate", label: "Slate", blurb: "Compact mockup, slate map", mapStyleName: "slate", overlay: "compact" },
];

const STORAGE_KEY = "vehicle_skin";
const DEFAULT_SKIN = "original";

export function useVehicleSkin() {
  const [skin, setSkinState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_SKIN;
    } catch {
      return DEFAULT_SKIN;
    }
  });

  const setSkin = useCallback((id) => {
    setSkinState(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }, []);

  // Sync across tabs/components.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) setSkinState(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const skinConfig = VEHICLE_SKINS.find((s) => s.id === skin) || VEHICLE_SKINS[0];
  return { skin, setSkin, skinConfig };
}