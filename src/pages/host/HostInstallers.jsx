import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ChevronDown } from 'lucide-react';
import InstallerCard from '@/components/installers/InstallerCard';
import InstallerLocatorMap from '@/components/installers/InstallerLocatorMap';
import InstallerSearchControls from '@/components/installers/InstallerSearchControls';
import InstallerResultsSummary from '@/components/installers/InstallerResultsSummary';
import { filterAndRankInstallers } from '@/lib/installers/installerLocatorUtils';

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

export default function HostInstallers() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [center, setCenter] = useState(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState(searchParams.get('vehicle_id') || '');
  const [radius, setRadius] = useState(25);
  const queryClient = useQueryClient();
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [locationInitialized, setLocationInitialized] = useState(false);
  const [importedKey, setImportedKey] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);

  const { data: me } = useQuery({ queryKey: ['me-host-installers'], queryFn: () => base44.auth.me() });
  const { data: host } = useQuery({ queryKey: ['host-installers-host', me?.id, me?.email], enabled: !!me, queryFn: async () => (await base44.entities.Host.filter({ user_id: me.id }))[0] || (await base44.entities.Host.filter({ email: me.email }))[0] || null });
  const { data: vehicles = [] } = useQuery({ queryKey: ['host-installer-vehicles', host?.id], enabled: !!host?.id, queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }) });
  const { data: installers = [], isLoading } = useQuery({ queryKey: ['host-installer-leads'], queryFn: () => base44.entities.PreferredInstallerLead.list('-successful_install_count', 500) });

  useEffect(() => {
    const source = searchParams.get('source') || 'manual_navigation';
    base44.analytics.track({ eventName: 'installer_locator_opened', properties: { source, vehicle_id: searchParams.get('vehicle_id') || null } });
  }, [searchParams]);

  useEffect(() => {
    if (locationInitialized || center) return;
    const lat = Number(searchParams.get('lat'));
    const lon = Number(searchParams.get('lon'));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      setCenter({ lat, lon });
      setLocationInitialized(true);
      return;
    }
    if (!host) return;
    const hostLocation = [host.business_address, host.city, host.state].filter(Boolean).join(', ');
    if (hostLocation) {
      geocodeSearch(hostLocation).then(loc => {
        if (loc?.lat && loc?.lon) setCenter(loc);
        else navigator.geolocation?.getCurrentPosition(pos => setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude }));
        setLocationInitialized(true);
      });
      return;
    }
    navigator.geolocation?.getCurrentPosition(pos => setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude }));
    setLocationInitialized(true);
  }, [host, center, locationInitialized, searchParams]);

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const effectiveCenter = selectedVehicle?.vehicle_lat && selectedVehicle?.vehicle_lon ? { lat: selectedVehicle.vehicle_lat, lon: selectedVehicle.vehicle_lon } : center;
  const visible = useMemo(() => filterAndRankInstallers(installers, effectiveCenter, radius), [installers, effectiveCenter, radius]);

  useEffect(() => {
    if (!effectiveCenter || isLoading || visible.length >= 5) return;
    const key = `${Number(effectiveCenter.lat).toFixed(4)},${Number(effectiveCenter.lon).toFixed(4)},${radius}`;
    if (importedKey === key) return;
    setImportedKey(key);
    setIsImporting(true);
    base44.functions.invoke('importNearbyInstallerBusinesses', { latitude: effectiveCenter.lat, longitude: effectiveCenter.lon, radius_miles: radius })
      .then(() => queryClient.refetchQueries({ queryKey: ['host-installer-leads'] }))
      .catch(error => console.warn('Installer import failed', error?.message))
      .finally(() => setIsImporting(false));
  }, [effectiveCenter, radius, visible.length, isLoading, importedKey, queryClient]);

  const handleSearch = async (value) => {
    setLoadingSearch(true);
    const loc = await geocodeSearch(value);
    if (loc?.lat && loc?.lon) setCenter(loc);
    setLoadingSearch(false);
  };
  const useCurrentLocation = () => navigator.geolocation?.getCurrentPosition(pos => setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude }));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Installer Locator</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">Find GPS and vehicle security installers near your fleet.</h1>
      </div>
      <InstallerSearchControls query={query} setQuery={setQuery} radius={radius} setRadius={setRadius} onSearch={handleSearch} onCurrentLocation={useCurrentLocation} loading={loadingSearch} />
      {vehicles.length > 0 && (
        <select value={selectedVehicleId} onChange={e => setSelectedVehicleId(e.target.value)} className="h-12 w-full rounded-2xl border border-border bg-card px-4 text-sm font-bold text-foreground md:max-w-md">
          <option value="">Filter near selected vehicle</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{[v.year, v.make, v.model, v.vin].filter(Boolean).join(' ')}</option>)}
        </select>
      )}
      <InstallerResultsSummary installers={visible} />
      <button onClick={() => setMapExpanded(!mapExpanded)} className="flex w-full items-center justify-between rounded-3xl border border-border bg-card p-4 shadow-sm">
        <span className="text-lg font-black text-foreground">{mapExpanded ? 'Hide' : 'Show'} Map</span>
        <ChevronDown className={`h-5 w-5 transition-transform ${mapExpanded ? 'rotate-180' : ''}`} />
      </button>
      {mapExpanded && <InstallerLocatorMap installers={visible} center={effectiveCenter ? [effectiveCenter.lat, effectiveCenter.lon] : null} />}
      {isLoading || isImporting ? <div className="rounded-3xl bg-card p-8 text-center font-bold text-muted-foreground">Loading nearby installers...</div> : visible.length === 0 ? <div className="rounded-3xl border border-border bg-card p-8 text-center font-bold text-muted-foreground">No installers found nearby yet.</div> : <div className="grid gap-4 md:grid-cols-2">{visible.map(installer => <InstallerCard key={installer.id} installer={installer} source={searchParams.get('source') || 'manual_navigation'} />)}</div>}
    </div>
  );
}