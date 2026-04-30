import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";

const DEFAULT_LOCATION = { city: "Detroit", state: "MI", lat: 42.3314, lon: -83.0458 };
const STORAGE_KEY = "uride_user_location";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSavedLocation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Expire saved location after 24 hours so GPS re-detects automatically
    if (parsed._savedAt && Date.now() - parsed._savedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {}
  return null;
}

function saveLocation(loc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loc, _savedAt: Date.now() }));
  } catch {}
}

export default function useUserLocation(user) {
  const saved = getSavedLocation();
  const userSaved = user?.preferred_city ? {
    city: user.preferred_city,
    state: user.preferred_state || "",
    lat: user.preferred_lat || null,
    lon: user.preferred_lon || null,
  } : null;

  const initial = saved || userSaved || DEFAULT_LOCATION;

  const [location, setLocation] = useState(initial);
  const [detecting, setDetecting] = useState(false);
  const [source, setSource] = useState(saved ? "saved" : userSaved ? "profile" : "default");

  // Attempt GPS on mount (non-blocking)
  useEffect(() => {
    if (!navigator.geolocation) return;
    // Don't re-detect if user already has a saved preference
    if (saved) return;

    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await base44.functions.invoke("reverseGeocode", {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          });
          const loc = {
            city: res.data.city,
            state: res.data.state,
            zip: res.data.zip || "",
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          };
          setLocation(loc);
          setSource("gps");
          saveLocation(loc);
        } catch (err) {
          console.warn("Reverse geocode failed:", err.message);
        } finally {
          setDetecting(false);
        }
      },
      () => {
        // GPS denied or unavailable — keep default/saved
        setDetecting(false);
      },
      { timeout: 8000, maximumAge: 300000 }
    );
  }, []); // eslint-disable-line

  // Manual override by zip code
  const setByZip = useCallback(async (zipcode) => {
    const res = await base44.functions.invoke("geocodeZipcode", { zipcode });
    const d = res.data;
    if (d.error) throw new Error(d.error);
    const loc = { city: d.city, state: d.state, zip: zipcode, lat: d.lat, lon: d.lon };
    setLocation(loc);
    setSource("manual");
    saveLocation(loc);
    // Persist to user profile if logged in
    if (user) {
      base44.auth.updateMe({
        preferred_city: loc.city,
        preferred_state: loc.state,
        preferred_lat: loc.lat,
        preferred_lon: loc.lon,
      }).catch(() => {});
    }
    return loc;
  }, [user]);

  // Direct city override
  const setManualCity = useCallback((city, state, lat, lon) => {
    const loc = { city, state, lat, lon };
    setLocation(loc);
    setSource("manual");
    saveLocation(loc);
    if (user) {
      base44.auth.updateMe({
        preferred_city: city,
        preferred_state: state,
        preferred_lat: lat,
        preferred_lon: lon,
      }).catch(() => {});
    }
  }, [user]);

  return { location, detecting, source, setByZip, setManualCity };
}