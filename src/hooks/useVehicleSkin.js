import { useState, useEffect, useCallback } from "react";

// Vehicle UI skin registry.
// "classic" = full original dashboard (weather hero, map card, controls, health) — default.
// "neon" / "slate" = compact full-bleed map overlay with neon / slate map style.
export const VEHICLE_SKINS = [
  { id: "classic", label: "Classic", blurb: "Full dashboard with weather, map, controls", mapStyleName: "neon", overlay: "classic" },
  { id: "neon", label: "Neon", blurb: "Compact map view, neon map", mapStyleName: "neon", overlay: "compact" },
  { id: "slate", label: "Slate", blurb: "Compact map view, slate map", mapStyleName: "slate", overlay: "compact" },
];

const STORAGE_KEY = "vehicle_skin";
const DEFAULT_SKIN = "classic";

export function useVehicleSkin() {
  const [skin, setSkinState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // Migrate old "original" value to "classic"
      if (saved === "original") return "classic";
      return saved || DEFAULT_SKIN;
    } catch {
      return DEFAULT_SKIN;
    }
  });

  const setSkin = useCallback((id) => {
    setSkinState(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }, []);

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