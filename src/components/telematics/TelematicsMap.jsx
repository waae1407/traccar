import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { RefreshCw, Satellite, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import TelematicsVehiclePopup from "@/components/telematics/TelematicsVehiclePopup";
import { getVehicleDisplayName, getVehicleMapLabel } from "@/lib/vehicleDisplayName";

const ACTIVE_VEHICLE_STATUSES = ["Booked", "Active Rental", "Reserved", "Payment Due", "Grace Period"];
const ACTIVE_BOOKING_STATUSES = ["active", "confirmed", "approved", "pending_review"];

function ageMs(dateValue) {
  if (!dateValue) return Infinity;
  const time = new Date(dateValue).getTime();
  return Number.isNaN(time) ? Infinity : Date.now() - time;
}

export function locationFreshness(device) {
  const ms = ageMs(device.last_seen_at || device.location_updated_at);
  if (ms < 2 * 60 * 1000) return { label: "Live / Recent", tone: "bg-emerald-500 text-white", ms };
  if (ms < 5 * 60 * 1000) return { label: "Delayed", tone: "bg-yellow-500 text-black", ms };
  if (ms < 30 * 60 * 1000) return { label: "Stale", tone: "bg-orange-500 text-white", ms };
  return { label: "Location stale / Needs attention", tone: "bg-red-600 text-white", ms };
}

function ago(device) {
  const ms = ageMs(device.last_seen_at || device.location_updated_at);
  if (!Number.isFinite(ms)) return "No recent location";
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `Last updated ${sec} seconds ago`;
  return `Last updated ${Math.round(sec / 60)} minutes ago`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function markerColor(freshness) {
  if (freshness.label.startsWith("Live")) return "#10b981";
  if (freshness.label === "Delayed") return "#eab308";
  if (freshness.label === "Stale") return "#f97316";
  return "#dc2626";
}

function getMapPosition(device) {
  const lat = Number(device.last_latitude);
  const lng = Number(device.last_longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const validLatLng = Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const likelySwapped = Math.abs(lat) > 85 && Math.abs(lng) <= 90;
  if (likelySwapped) return [lng, lat];
  return validLatLng ? [lat, lng] : null;
}

function directionsUrl(position) {
  if (!position) return "#";
  return `https://www.google.com/maps/dir/?api=1&destination=${position[0]},${position[1]}`;
}

function coordinateLabel(position) {
  return `${position[0].toFixed(5)}, ${position[1].toFixed(5)}`;
}

export default function TelematicsMap({
  role = "admin",
  devices = [],
  vehicles = [],
  hosts = [],
  bookings = [],
  providers = [],
  height = 320,
  showFilters = false,
  showRefresh = true,
  showStaleBadges = true,
  compact = false,
  onRefresh,
  refreshLabel,
}) {
  const [filters, setFilters] = useState({ provider: "all", host: "all", online: "all", stale: "all", active: "all", lifecycle: "all" });
  const [refreshing, setRefreshing] = useState(false);
  const [resolvedAddresses, setResolvedAddresses] = useState({});
  const [vehicleOverrides, setVehicleOverrides] = useState({});
  const vehicleById = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, { ...v, ...(vehicleOverrides[v.id] || {}) }])), [vehicles, vehicleOverrides]);
  const hostById = useMemo(() => Object.fromEntries(hosts.map(h => [h.id, h])), [hosts]);
  const providerByKey = useMemo(() => Object.fromEntries(providers.map(p => [p.provider_key, p])), [providers]);
  const activeVehicleIds = useMemo(() => new Set([
    ...vehicles.filter(v => ACTIVE_VEHICLE_STATUSES.includes(v.status)).map(v => v.id),
    ...bookings.filter(b => ACTIVE_BOOKING_STATUSES.includes(b.booking_status)).map(b => b.vehicle_id).filter(Boolean)
  ]), [vehicles, bookings]);

  const located = devices.filter(d => getMapPosition(d));
  const providerOptions = [...new Set(devices.map(d => d.provider_key).filter(Boolean))];
  const hostOptions = hosts.filter(h => devices.some(d => d.host_id === h.id));
  const filtered = located.filter(device => {
    const fresh = locationFreshness(device);
    if (filters.provider !== "all" && device.provider_key !== filters.provider) return false;
    if (filters.host !== "all" && device.host_id !== filters.host) return false;
    if (filters.online !== "all" && (device.online_status || "unknown") !== filters.online) return false;
    if (filters.stale === "stale" && fresh.ms < 5 * 60 * 1000) return false;
    if (filters.stale === "recent" && fresh.ms >= 5 * 60 * 1000) return false;
    if (filters.active === "active" && !activeVehicleIds.has(device.vehicle_id)) return false;
    if (filters.lifecycle !== "all" && device.lifecycle_status !== filters.lifecycle) return false;
    return true;
  });
  const center = filtered[0] ? getMapPosition(filtered[0]) : [39.5, -98.35];

  useEffect(() => {
    filtered.slice(0, 20).forEach(async (device) => {
      if (device.address || resolvedAddresses[device.id] !== undefined) return;
      const position = getMapPosition(device);
      if (!position) return;
      try {
        const response = await base44.functions.invoke("reverseGeocode", { lat: position[0], lon: position[1] });
        const address = response.data?.address || response.data?.display_name || null;
        setResolvedAddresses((current) => ({ ...current, [device.id]: address }));
      } catch {
        setResolvedAddresses((current) => ({ ...current, [device.id]: null }));
      }
    });
  }, [filtered, resolvedAddresses]);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black"><Satellite className="h-4 w-4 text-primary" /> Fleet GPS Map</p>
          <p className="text-xs text-muted-foreground">Near-real-time cached location. Not true live streaming.</p>
          <p className="text-xs font-semibold text-primary">Map devices with coordinates: {located.length}</p>
        </div>
        {showRefresh && <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing || !onRefresh}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />{refreshLabel || "Refresh Locations"}</Button>}
      </div>
      {showFilters && !compact && (
        <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-3 lg:grid-cols-6">
          <select className="rounded-xl border border-border bg-background px-3 py-2 text-xs" value={filters.provider} onChange={e => setFilters(f => ({ ...f, provider: e.target.value }))}><option value="all">All providers</option>{providerOptions.map(p => <option key={p} value={p}>{p}</option>)}</select>
          {role === "admin" && <select className="rounded-xl border border-border bg-background px-3 py-2 text-xs" value={filters.host} onChange={e => setFilters(f => ({ ...f, host: e.target.value }))}><option value="all">All hosts</option>{hostOptions.map(h => <option key={h.id} value={h.id}>{h.business_name || h.full_name || h.email}</option>)}</select>}
          <select className="rounded-xl border border-border bg-background px-3 py-2 text-xs" value={filters.online} onChange={e => setFilters(f => ({ ...f, online: e.target.value }))}><option value="all">Any status</option><option value="online">Online</option><option value="offline">Offline</option><option value="unknown">Unknown</option></select>
          <select className="rounded-xl border border-border bg-background px-3 py-2 text-xs" value={filters.stale} onChange={e => setFilters(f => ({ ...f, stale: e.target.value }))}><option value="all">Any freshness</option><option value="recent">Recent</option><option value="stale">Stale</option></select>
          <select className="rounded-xl border border-border bg-background px-3 py-2 text-xs" value={filters.active} onChange={e => setFilters(f => ({ ...f, active: e.target.value }))}><option value="all">All vehicles</option><option value="active">Active rental</option></select>
          <select className="rounded-xl border border-border bg-background px-3 py-2 text-xs" value={filters.lifecycle} onChange={e => setFilters(f => ({ ...f, lifecycle: e.target.value }))}><option value="all">Any lifecycle</option><option value="live_enabled">Live enabled</option><option value="assigned">Assigned</option><option value="suspended">Suspended</option></select>
        </div>
      )}
      <div style={{ height }}>
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground"><TimerReset className="mb-2 h-7 w-7" /><p className="text-sm font-semibold">No cached GPS locations available yet.</p><p className="text-xs">Locations appear after the next Traccar position sync.</p></div>
        ) : (
          <MapContainer center={center} zoom={compact ? 9 : 11} scrollWheelZoom={!compact} style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution='&copy; OpenStreetMap contributors &copy; CARTO' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
            {filtered.map(device => {
              const vehicle = vehicleById[device.vehicle_id];
              const host = hostById[device.host_id];
              const provider = providerByKey[device.provider_key];
              const fresh = locationFreshness(device);
              const position = getMapPosition(device);
              const displayName = getVehicleDisplayName(vehicle, device);
              const mapLabel = escapeHtml(getVehicleMapLabel(vehicle, device));
              const icon = L.divIcon({
                html: `<div title="${escapeHtml(displayName)}" style="display:flex;align-items:center;gap:6px;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.35));"><div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;background:${markerColor(fresh)};border-radius:50%;border:2px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.3);flex:0 0 auto;"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg></div><div style="max-width:118px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid rgba(15,23,42,0.16);background:rgba(255,255,255,0.94);color:#0f172a;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800;line-height:1;">${mapLabel}</div></div>`,
                className: "vehicle-map-marker",
                iconSize: [166, 42],
                iconAnchor: [18, 18],
                popupAnchor: [0, -18]
              });
              return (
                <Marker key={device.id} position={position} icon={icon}>
                  <Popup className="luxury-telematics-popup">
                    <TelematicsVehiclePopup
                      role={role}
                      device={device}
                      vehicle={vehicle}
                      host={host}
                      provider={provider}
                      bookings={bookings}
                      position={position}
                      freshness={fresh}
                      address={device.address || resolvedAddresses[device.id]}
                      showStaleBadges={showStaleBadges}
                      compact={compact}
                      onVehicleUpdated={(updated) => setVehicleOverrides((current) => ({ ...current, [updated.id]: updated }))}
                    />
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        )}
      </div>
    </div>
  );
}