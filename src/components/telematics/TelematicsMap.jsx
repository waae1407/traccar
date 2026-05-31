import React, { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { RefreshCw, Satellite, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  return { label: "Offline / Needs attention", tone: "bg-red-600 text-white", ms };
}

function ago(device) {
  const ms = ageMs(device.last_seen_at || device.location_updated_at);
  if (!Number.isFinite(ms)) return "No recent location";
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `Last updated ${sec} seconds ago`;
  return `Last updated ${Math.round(sec / 60)} minutes ago`;
}

function vehicleName(vehicle, device) {
  if (!vehicle) return device.unique_id || "Vehicle";
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.vin || device.unique_id;
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

export default function TelematicsMap({
  role = "admin",
  devices = [],
  vehicles = [],
  hosts = [],
  bookings = [],
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
  const vehicleById = useMemo(() => Object.fromEntries(vehicles.map(v => [v.id, v])), [vehicles]);
  const hostById = useMemo(() => Object.fromEntries(hosts.map(h => [h.id, h])), [hosts]);
  const activeVehicleIds = useMemo(() => new Set([
    ...vehicles.filter(v => ACTIVE_VEHICLE_STATUSES.includes(v.status)).map(v => v.id),
    ...bookings.filter(b => ACTIVE_BOOKING_STATUSES.includes(b.booking_status)).map(b => b.vehicle_id).filter(Boolean)
  ]), [vehicles, bookings]);

  const located = devices.filter(d => getMapPosition(d));
  const providers = [...new Set(devices.map(d => d.provider_key).filter(Boolean))];
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
          <select className="rounded-xl border border-border bg-background px-3 py-2 text-xs" value={filters.provider} onChange={e => setFilters(f => ({ ...f, provider: e.target.value }))}><option value="all">All providers</option>{providers.map(p => <option key={p} value={p}>{p}</option>)}</select>
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
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {filtered.map(device => {
              const vehicle = vehicleById[device.vehicle_id];
              const host = hostById[device.host_id];
              const fresh = locationFreshness(device);
              const icon = L.divIcon({
                html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:${markerColor(fresh)};border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.2)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5s-5 2.24-5 5v2H6c-1.1 0-2 .9-2 2v10h16V10c0-1.1-.9-2-2-2zm-7-2h4v2h-4V6zm0 12H9v-2h2v2zm4 0h-2v-2h2v2z"></path></svg></div>`,
                className: "",
                iconSize: [32, 32],
                popupAnchor: [0, -16]
              });
              return (
                <Marker key={device.id} position={getMapPosition(device)} icon={icon}>
                  <Popup>
                    <div className="min-w-56 space-y-2 text-sm">
                      <div><b>{vehicleName(vehicle, device)}</b><p>{ago(device)}</p></div>
                      {showStaleBadges && <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${fresh.tone}`}>{fresh.label}</span>}
                      {role !== "customer" && vehicle?.vin && <p><b>VIN:</b> {vehicle.vin}</p>}
                      {role !== "customer" && <p><b>Device:</b> {device.unique_id} · {device.provider_key}</p>}
                      {role === "admin" && host && <p><b>Host:</b> {host.business_name || host.full_name || host.email}</p>}
                      <p><b>Speed:</b> {Number(device.speed || 0).toFixed(0)} mph</p>
                      <p><b>Ignition:</b> {device.ignition_status || "unknown"}</p>
                      <p><b>Status:</b> {device.online_status || "unknown"}</p>
                      {role !== "customer" && vehicle?.status && <p><b>Vehicle:</b> {vehicle.status}</p>}
                      {role !== "customer" && !compact && vehicle?.id && <Link to={role === "admin" ? "/admin/telematics" : "/host/telematics"} className="text-primary underline">Open telematics controls</Link>}
                    </div>
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