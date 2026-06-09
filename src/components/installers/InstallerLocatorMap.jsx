import React, { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import InstallerStatusBadge from './InstallerStatusBadge';

function markerIcon(status) {
  const color = status === 'preferred' ? '#e91e63' : status === 'verified' ? '#10b981' : status === 'almost_verified' ? '#f59e0b' : status === 'in_progress' ? '#3b82f6' : '#64748b';
  return L.divIcon({
    html: `<div style="height:30px;width:30px;border-radius:999px;background:${color};border:3px solid white;box-shadow:0 6px 18px rgba(15,23,42,.28)"></div>`,
    className: 'installer-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function InstallerMapController({ center, located }) {
  const map = useMap();

  useEffect(() => {
    if (located.length > 1) {
      const bounds = L.latLngBounds(located.map(installer => [Number(installer.business_latitude), Number(installer.business_longitude)]));
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
      return;
    }
    if (center) map.setView(center, located.length ? 11 : 10);
  }, [center, located, map]);

  return null;
}

export default function InstallerLocatorMap({ installers = [], center }) {
  const located = installers.filter(i => Number.isFinite(Number(i.business_latitude)) && Number.isFinite(Number(i.business_longitude)));
  const mapCenter = center || (located[0] ? [Number(located[0].business_latitude), Number(located[0].business_longitude)] : [39.5, -98.35]);

  return (
    <div className="h-[360px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <MapContainer center={mapCenter} zoom={located.length ? 10 : 4} style={{ height: '100%', width: '100%' }}>
        <InstallerMapController center={mapCenter} located={located} />
        <TileLayer attribution="&copy; OpenStreetMap contributors &copy; CARTO" url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
        {located.map(installer => (
          <Marker key={installer.id} position={[Number(installer.business_latitude), Number(installer.business_longitude)]} icon={markerIcon(installer.installer_status)}>
            <Popup>
              <div className="min-w-48 space-y-2">
                <p className="font-black text-slate-950">{installer.business_name || installer.installer_name}</p>
                <InstallerStatusBadge status={installer.installer_status} count={installer.verification_progress_count} required={installer.verification_required_count || 3} />
                <p className="text-xs text-slate-500">{[installer.business_city, installer.business_state].filter(Boolean).join(', ')}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}