import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import InstallerCard from '@/components/installers/InstallerCard';
import InstallerLocatorMap from '@/components/installers/InstallerLocatorMap';
import InstallerSearchControls from '@/components/installers/InstallerSearchControls';
import { filterAndRankInstallers } from '@/lib/installers/installerLocatorUtils';

const LOGO_ICON = 'https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg';

async function geocodeSearch(query) {
  const value = String(query || '').trim();
  if (!value) return null;
  if (/^\d{5}$/.test(value)) {
    const res = await base44.functions.invoke('geocodeZipcode', { zipcode: value });
    return { lat: res.data.lat, lon: res.data.lon };
  }
  if (/\d+\s+/.test(value)) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&country=US&format=json&limit=1`);
    const hit = (await res.json())?.[0];
    return hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
  }
  const [city, state = ''] = value.split(',').map(part => part.trim());
  const res = await base44.functions.invoke('geocodeCity', { city, state });
  return { lat: res.data.lat, lon: res.data.lon };
}

export default function Installers() {
  const [query, setQuery] = useState('');
  const [center, setCenter] = useState(null);
  const queryClient = useQueryClient();
  const [radius, setRadius] = useState(25);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [importedKey, setImportedKey] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const { data: installers = [], isLoading } = useQuery({
    queryKey: ['public-installer-leads'],
    queryFn: () => base44.entities.PreferredInstallerLead.list('-successful_install_count', 500)
  });

  const visible = useMemo(() => filterAndRankInstallers(installers, center, radius), [installers, center, radius]);

  useEffect(() => {
    if (!center || isLoading || visible.length >= 5) return;
    const key = `${center.lat.toFixed(4)},${center.lon.toFixed(4)},${radius}`;
    if (importedKey === key) return;
    setImportedKey(key);
    setIsImporting(true);
    base44.functions.invoke('importNearbyInstallerBusinesses', { latitude: center.lat, longitude: center.lon, radius_miles: radius })
      .then(() => queryClient.refetchQueries({ queryKey: ['public-installer-leads'] }))
      .catch(error => console.warn('Installer import failed', error?.message))
      .finally(() => setIsImporting(false));
  }, [center, radius, visible.length, isLoading, importedKey, queryClient]);

  const handleSearch = async (value) => {
    setLoadingSearch(true);
    const loc = await geocodeSearch(value);
    if (loc?.lat && loc?.lon) setCenter(loc);
    setLoadingSearch(false);
  };

  const useCurrentLocation = () => {
    navigator.geolocation?.getCurrentPosition(pos => setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2 font-black"><img src={LOGO_ICON} alt="uRide" className="h-8 w-8 rounded-xl object-cover" /> uRide</Link>
          <Link to="/installer/telematics" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Installer Portal</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-5 px-5 py-8">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">uRide Installer Network</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Find GPS and vehicle security installers</h1>
          <p className="mt-2 max-w-2xl text-slate-600">Search for installer leads near you. Verification badges show progress based on successful uRide installation tests.</p>
        </div>
        <InstallerSearchControls query={query} setQuery={setQuery} radius={radius} setRadius={setRadius} onSearch={handleSearch} onCurrentLocation={useCurrentLocation} loading={loadingSearch} />
        <InstallerLocatorMap installers={visible} center={center ? [center.lat, center.lon] : null} />
        {isLoading || isImporting ? <div className="rounded-3xl bg-white p-8 text-center font-bold text-slate-500">Loading nearby installers...</div> : visible.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center">
            <h2 className="text-xl font-black">No installers found nearby yet.</h2>
            <p className="mt-2 text-slate-500">Try a nearby ZIP code or expand your search radius.</p>
          </div>
        ) : <div className="grid gap-4 md:grid-cols-2">{visible.map(installer => <InstallerCard key={installer.id} installer={installer} />)}</div>}
      </main>
    </div>
  );
}