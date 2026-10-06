import React, { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Circle, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import { MapPin, Check } from "lucide-react";

// Draggable center marker icon
function makeCenterIcon() {
  return L.divIcon({
    html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:hsl(338 90% 56%);border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
    className: "geofence-center-marker",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function makeVehicleIcon() {
  return L.divIcon({
    html: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;background:#3B82F6;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
    className: "geofence-vehicle-marker",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

function FitOnce({ center }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    if (center) {
      map.setView([center.lat, center.lon], 15);
      done.current = true;
    }
  }, [center, map]);
  return null;
}

export default function GeofenceCenterPicker({ device, center, radiusMiles, onPick }) {
  const vehiclePos = device?.last_latitude && device?.last_longitude
    ? [device.last_latitude, device.last_longitude]
    : null;

  const initialCenter = center
    ? [center.lat, center.lon]
    : vehiclePos || [39.5, -98.35];

  const radiusMeters = (radiusMiles || 0.5) * 1609.34;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-white/50">
        <MapPin size={12} color="#E91E8C" />
        <span>
          {center
            ? <span className="text-white/70">Center set · {center.lat.toFixed(5)}, {center.lon.toFixed(5)}</span>
            : "Tap the map to set the geofence center"}
        </span>
      </div>
      <div className="relative rounded-xl overflow-hidden border border-white/10" style={{ height: 240 }}>
        <MapContainer center={initialCenter} zoom={14} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
          <ClickHandler onPick={onPick} />
          <FitOnce center={center || (vehiclePos ? { lat: vehiclePos[0], lon: vehiclePos[1] } : null)} />
          <TileLayer
            attribution="&copy; Esri, HERE, Garmin"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
            className="map-tiles-muted"
          />
          {/* Vehicle reference marker */}
          {vehiclePos && (
            <Marker position={vehiclePos} icon={makeVehicleIcon()} interactive={false} />
          )}
          {/* Chosen center + radius circle */}
          {center && (
            <>
              <Marker
                position={[center.lat, center.lon]}
                icon={makeCenterIcon()}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const ll = e.target.getLatLng();
                    onPick({ lat: ll.lat, lon: ll.lng });
                  },
                }}
              />
              <Circle
                center={[center.lat, center.lon]}
                radius={radiusMeters}
                pathOptions={{ color: "#E91E8C", fillColor: "#E91E8C", fillOpacity: 0.12, weight: 2 }}
              />
            </>
          )}
        </MapContainer>
      </div>
      {center && (
        <div className="flex items-center gap-1.5 text-xs text-green-400">
          <Check size={12} />
          <span>Drag the pin to fine-tune, or tap elsewhere to move it.</span>
        </div>
      )}
    </div>
  );
}