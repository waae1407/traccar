import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Play, Pause, SkipBack, SkipForward, Loader2, X, Route as RouteIcon, Calendar } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getVehicleDisplayName } from "@/lib/vehicleDisplayName";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "prev_week", label: "Previous Week" },
  { value: "this_month", label: "This Month" },
  { value: "prev_month", label: "Previous Month" },
  { value: "custom", label: "Custom" },
];

function getPeriodRange(period, customFrom, customTo) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today":
      return { from: todayStart.toISOString(), to: now.toISOString() };
    case "yesterday": {
      const yStart = new Date(todayStart); yStart.setDate(yStart.getDate() - 1);
      const yEnd = new Date(todayStart); yEnd.setMilliseconds(-1);
      return { from: yStart.toISOString(), to: yEnd.toISOString() };
    }
    case "this_week": {
      const sw = new Date(todayStart); sw.setDate(sw.getDate() - sw.getDay());
      return { from: sw.toISOString(), to: now.toISOString() };
    }
    case "prev_week": {
      const sw = new Date(todayStart); sw.setDate(sw.getDate() - sw.getDay() - 7);
      const ew = new Date(sw); ew.setDate(ew.getDate() + 6); ew.setHours(23, 59, 59, 999);
      return { from: sw.toISOString(), to: ew.toISOString() };
    }
    case "this_month": {
      const sm = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
      return { from: sm.toISOString(), to: now.toISOString() };
    }
    case "prev_month": {
      const sm = new Date(todayStart.getFullYear(), todayStart.getMonth() - 1, 1);
      const em = new Date(todayStart.getFullYear(), todayStart.getMonth(), 0); em.setHours(23, 59, 59, 999);
      return { from: sm.toISOString(), to: em.toISOString() };
    }
    case "custom": {
      if (!customFrom || !customTo) return null;
      const f = new Date(customFrom + "T00:00:00");
      const t = new Date(customTo + "T23:59:59");
      return { from: f.toISOString(), to: t.toISOString() };
    }
    default:
      return null;
  }
}

function speedColor(mph) {
  const t = Math.min(Math.max(mph, 0) / 60, 1);
  let r, g, b;
  if (t < 0.5) {
    const t2 = t * 2;
    r = 0;
    g = Math.round(255 * t2);
    b = Math.round(255 * (1 - t2));
  } else {
    const t2 = (t - 0.5) * 2;
    r = Math.round(255 * t2);
    g = Math.round(255 * (1 - t2));
    b = 0;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
    hour12: true,
  });
}

function makeArrowIcon(course, color) {
  return L.divIcon({
    html: `<div style="transform: rotate(${course}deg); display:flex; align-items:center; justify-content:center;"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1 L12 13 L7 10 L2 13 Z" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg></div>`,
    className: "route-arrow",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function makeCarIcon() {
  return L.divIcon({
    html: `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;background:#1e3a8a;border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg></div>`,
    className: "route-car-marker",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function RouteAutoFit({ positions }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!positions.length || fitted.current) return;
    const bounds = L.latLngBounds(positions.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    fitted.current = true;
    setTimeout(() => map.invalidateSize(), 200);
  }, [positions, map]);
  return null;
}

export default function DriveHistoryReplay({ vehicle, device, mode, onClose }) {
  const [phase, setPhase] = useState("select");
  const [period, setPeriod] = useState("today");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const vehicleLabel = useMemo(() => getVehicleDisplayName(vehicle, device), [vehicle, device]);

  const handleShow = useCallback(async () => {
    const range = getPeriodRange(period, customFrom, customTo);
    if (!range) { setError("Please select valid dates"); return; }

    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("getTraccarRouteReplay", {
        telematics_device_id: device.id,
        from: range.from,
        to: range.to,
      });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      if (!data.positions || data.positions.length === 0) {
        setError("No GPS data found for this period.");
        setLoading(false);
        return;
      }
      setPositions(data.positions);
      setCurrentIndex(0);
      setPhase("playback");
    } catch (err) {
      setError(err.message || "Failed to load route data");
    }
    setLoading(false);
  }, [device, period, customFrom, customTo]);

  // Playback auto-advance
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => {
        if (prev >= positions.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [playing, positions.length]);

  // Compute colored segments
  const segments = useMemo(() => {
    if (positions.length < 2) return [];
    return positions.slice(1).map((p, i) => {
      const prev = positions[i];
      const avgSpeed = (prev.speed_mph + p.speed_mph) / 2;
      return {
        from: [prev.lat, prev.lng],
        to: [p.lat, p.lng],
        color: speedColor(avgSpeed),
      };
    });
  }, [positions]);

  // Compute arrow markers (every Nth point)
  const arrows = useMemo(() => {
    if (positions.length < 2) return [];
    const step = Math.max(1, Math.floor(positions.length / 30));
    const result = [];
    for (let i = 0; i < positions.length; i += step) {
      const p = positions[i];
      result.push({
        position: [p.lat, p.lng],
        icon: makeArrowIcon(p.course, speedColor(p.speed_mph)),
        key: i,
      });
    }
    return result;
  }, [positions]);

  const currentPos = positions[currentIndex];
  const mapCenter = positions.length > 0 ? [positions[0].lat, positions[0].lng] : [39.5, -98.35];

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={() => phase === "playback" ? setPhase("select") : onClose()} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-lg font-bold text-foreground">Replay</h1>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <X className="h-5 w-5 text-foreground" />
        </button>
      </div>

      {/* Selection Phase */}
      {phase === "select" && (
        <div className="flex-1 flex flex-col items-center justify-start pt-8 px-4 bg-background">
          <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-xl p-5 space-y-4">
            {/* Device */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Device</label>
              <div className="mt-1 flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5">
                <span className="text-sm font-bold text-foreground">{vehicleLabel}</span>
                <RouteIcon className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {/* Period */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Period</label>
              <button
                onClick={() => setPeriodOpen(!periodOpen)}
                className="mt-1 w-full flex items-center justify-between rounded-xl border-2 px-3 py-2.5 transition-colors"
                style={{ borderColor: periodOpen ? "hsl(338 90% 56%)" : "hsl(var(--border))" }}
              >
                <span className="text-sm font-bold text-foreground">{PERIODS.find(p => p.value === period)?.label}</span>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </button>
              {periodOpen && (
                <div className="mt-1 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
                  {PERIODS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => { setPeriod(p.value); setPeriodOpen(false); }}
                      className={`w-full text-left px-3 py-2.5 text-sm hover:bg-secondary transition-colors ${period === p.value ? "bg-primary/10 font-bold text-primary" : "text-foreground"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Custom date inputs */}
            {period === "custom" && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-muted-foreground">From</label>
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-muted-foreground">To</label>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
                </div>
              </div>
            )}

            {/* Error */}
            {error && <p className="text-sm text-red-400 font-medium">{error}</p>}

            {/* SHOW button */}
            <Button
              onClick={handleShow}
              disabled={loading || (period === "custom" && (!customFrom || !customTo))}
              className="w-full h-12 rounded-xl border-2 border-emerald-600 bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600/20 text-sm font-black tracking-widest uppercase"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Show"}
            </Button>
          </div>
        </div>
      )}

      {/* Playback Phase */}
      {phase === "playback" && positions.length > 0 && (
        <>
          {/* Control panel */}
          <div className="bg-card border-b border-border px-4 py-3 space-y-2">
            <p className="text-center text-sm font-bold text-foreground">{vehicleLabel}</p>
            {/* Timeline slider */}
            <input
              type="range"
              min={0}
              max={positions.length - 1}
              value={currentIndex}
              onChange={e => { setCurrentIndex(Number(e.target.value)); setPlaying(false); }}
              className="w-full accent-primary"
            />
            {/* Controls row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground tabular-nums">{currentIndex + 1}/{positions.length}</span>
                <button onClick={() => { setCurrentIndex(Math.max(0, currentIndex - 1)); setPlaying(false); }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <SkipBack className="h-4 w-4 text-foreground" />
                </button>
                <button onClick={() => setPlaying(!playing)} className="p-2 rounded-full bg-primary hover:bg-primary/90 transition-colors">
                  {playing ? <Pause className="h-4 w-4 text-primary-foreground" /> : <Play className="h-4 w-4 text-primary-foreground" />}
                </button>
                <button onClick={() => { setCurrentIndex(Math.min(positions.length - 1, currentIndex + 1)); setPlaying(false); }} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <SkipForward className="h-4 w-4 text-foreground" />
                </button>
              </div>
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">{formatTimestamp(currentPos?.timestamp)}</span>
            </div>
          </div>

          {/* Map */}
          <div className="flex-1 relative">
            <MapContainer center={mapCenter} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
              <RouteAutoFit positions={positions} />
              <TileLayer attribution='&copy; Esri' url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}" />
              {/* Colored route segments */}
              {segments.map((seg, i) => (
                <Polyline key={i} positions={[seg.from, seg.to]} pathOptions={{ color: seg.color, weight: 5, opacity: 0.85 }} />
              ))}
              {/* Direction arrows */}
              {arrows.map(arrow => (
                <Marker key={arrow.key} position={arrow.position} icon={arrow.icon} interactive={false} />
              ))}
              {/* Current position car marker */}
              {currentPos && (
                <Marker position={[currentPos.lat, currentPos.lng]} icon={makeCarIcon()} />
              )}
            </MapContainer>

            {/* Speed legend */}
            <div className="absolute bottom-4 left-4 z-[1000] rounded-lg bg-white px-2.5 py-2 shadow-lg">
              <div className="h-2.5 w-28 rounded-full" style={{ background: "linear-gradient(to right, rgb(0,0,255), rgb(0,255,0), rgb(255,0,0))" }} />
              <p className="mt-1.5 text-center text-[11px] font-bold text-black">0 - 60 mph</p>
            </div>

            {/* Speed badge for current position */}
            {currentPos && (
              <div className="absolute top-3 right-3 z-[1000] rounded-xl bg-white/95 dark:bg-card/95 backdrop-blur px-3 py-2 shadow-lg border border-border">
                <p className="text-xs font-black text-foreground">{currentPos.speed_mph} mph</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}