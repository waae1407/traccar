import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

function buildInstallerHref(vehicle, source) {
  const params = new URLSearchParams();
  if (source) params.set('source', source);
  if (vehicle?.id) params.set('vehicle_id', vehicle.id);
  if (Number.isFinite(Number(vehicle?.vehicle_lat)) && Number.isFinite(Number(vehicle?.vehicle_lon))) {
    params.set('lat', vehicle.vehicle_lat);
    params.set('lon', vehicle.vehicle_lon);
  }
  const suffix = params.toString();
  return `/host/installers${suffix ? `?${suffix}` : ''}`;
}

export default function InstallerLocatorCTA({
  source = 'manual_navigation',
  vehicle,
  title = 'Need an Installer?',
  description = 'Find a verified installer near you.',
  variant = 'card',
}) {
  const href = buildInstallerHref(vehicle, source);

  if (variant === 'button') {
    return (
      <Button asChild size="sm">
        <Link to={href}><MapPin className="h-4 w-4" />Find Installer</Link>
      </Button>
    );
  }

  return (
    <div className="rounded-2xl border border-pink-100 bg-pink-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-pink-600 shadow-sm">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-950">{title}</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{description}</p>
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0 rounded-xl">
          <Link to={href}>Find Installer</Link>
        </Button>
      </div>
    </div>
  );
}