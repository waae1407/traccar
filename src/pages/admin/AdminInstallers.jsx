import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import InstallerCard from '@/components/installers/InstallerCard';
import InstallerLocatorMap from '@/components/installers/InstallerLocatorMap';
import InstallerStatusBadge from '@/components/installers/InstallerStatusBadge';
import InstallerSearchControls from '@/components/installers/InstallerSearchControls';
import { filterAndRankInstallers, sortInstallers } from '@/lib/installers/installerLocatorUtils';

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
function norm(value) { return String(value || '').trim().toLowerCase(); }
function relatedRecords(records, lead) {
  return records.filter(record => {
    if (lead.installer_email && norm(record.installer_email || record.assigned_installer_email) === norm(lead.installer_email)) return true;
    if (lead.installer_phone && norm(record.installer_phone) === norm(lead.installer_phone)) return true;
    return norm(record.installer_name) && norm(record.installer_name) === norm(lead.installer_name);
  }).slice(0, 5);
}

export default function AdminInstallers() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [center, setCenter] = useState(null);
  const [radius, setRadius] = useState(25);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [importedKey, setImportedKey] = useState('');
  const { data: installers = [], isLoading } = useQuery({ queryKey: ['admin-installer-leads'], queryFn: () => base44.entities.PreferredInstallerLead.list('-updated_date', 500) });
  const { data: installRecords = [] } = useQuery({ queryKey: ['admin-installer-install-records'], queryFn: () => base44.entities.TelematicsInstallRecord.list('-installation_completed_at', 500) });
  const sorted = useMemo(() => center ? filterAndRankInstallers(installers, center, radius) : [...installers].sort(sortInstallers), [installers, center, radius]);

  const updateLead = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PreferredInstallerLead.update(id, { ...data, updated_at: new Date().toISOString() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-installer-leads'] })
  });
  const refresh = useMutation({
    mutationFn: (lead) => base44.functions.invoke('recalculatePreferredInstallerProgress', { lead_id: lead.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-installer-leads'] })
  });
  const excludeRecord = useMutation({
    mutationFn: ({ record, lead }) => base44.entities.TelematicsInstallRecord.update(record.id, { verification_excluded: true, verification_exclusion_reason: 'Excluded by admin' }).then(() => base44.functions.invoke('recalculatePreferredInstallerProgress', { lead_id: lead.id })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-installer-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admin-installer-install-records'] });
    }
  });

  useEffect(() => {
    if (!center || isLoading || sorted.length >= 5) return;
    const key = `${center.lat.toFixed(4)},${center.lon.toFixed(4)},${radius}`;
    if (importedKey === key) return;
    setImportedKey(key);
    base44.functions.invoke('importNearbyInstallerBusinesses', { latitude: center.lat, longitude: center.lon, radius_miles: radius })
      .then(() => queryClient.invalidateQueries({ queryKey: ['admin-installer-leads'] }))
      .catch(error => console.warn('Installer import failed', error?.message));
  }, [center, radius, sorted.length, isLoading, importedKey, queryClient]);

  const handleSearch = async (value) => {
    setLoadingSearch(true);
    const loc = await geocodeSearch(value);
    if (loc?.lat && loc?.lon) setCenter(loc);
    setLoadingSearch(false);
  };
  const useCurrentLocation = () => navigator.geolocation?.getCurrentPosition(pos => setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude }));

  const actions = (lead) => (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => updateLead.mutate({ id: lead.id, data: { lead_status: 'contacted' } })}>Mark Contacted</Button>
      <Button size="sm" variant="outline" onClick={() => updateLead.mutate({ id: lead.id, data: { lead_status: 'active' } })}>Mark Active</Button>
      <Button size="sm" variant="outline" onClick={() => updateLead.mutate({ id: lead.id, data: { installer_status: 'suspended' } })}>Suspend</Button>
      <Button size="sm" onClick={() => updateLead.mutate({ id: lead.id, data: { installer_status: 'preferred' } })}>Set Preferred</Button>
      <Button size="sm" variant="outline" onClick={() => refresh.mutate(lead)}>Refresh Progress</Button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Admin</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">Installer Network Management</h1>
      </div>
      <InstallerSearchControls query={query} setQuery={setQuery} radius={radius} setRadius={setRadius} onSearch={handleSearch} onCurrentLocation={useCurrentLocation} loading={loadingSearch} />
      <InstallerLocatorMap installers={sorted} center={center ? [center.lat, center.lon] : null} />
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <div className="grid grid-cols-8 gap-3 border-b border-border p-4 text-xs font-black uppercase tracking-wider text-muted-foreground">
          <span className="col-span-2">Installer</span><span>Status</span><span>Progress</span><span>Success</span><span>Failed</span><span>Source</span><span>Lead</span>
        </div>
        {isLoading ? <div className="p-8 text-center text-muted-foreground">Loading installers...</div> : sorted.map(lead => (
          <div key={lead.id} className="grid grid-cols-8 gap-3 border-b border-border p-4 text-sm last:border-b-0">
            <div className="col-span-2"><p className="font-black">{lead.business_name || lead.installer_name}</p><p className="text-xs text-muted-foreground">{lead.installer_email || lead.installer_phone}</p></div>
            <InstallerStatusBadge status={lead.installer_status} count={lead.verification_progress_count} required={lead.verification_required_count || 3} />
            <span>{lead.verification_progress_count || 0}/{lead.verification_required_count || 3}</span>
            <span>{lead.successful_install_count || 0} · {lead.success_rate || 0}%</span>
            <span>{lead.failed_install_count || 0}</span>
            <span>{lead.source || 'install_completion'}</span>
            <span>{lead.lead_status || 'pending'}</span>
            <div className="col-span-8 space-y-3">
              <InstallerCard installer={lead} adminActions={actions(lead)} source="admin_installers" />
              <div className="rounded-2xl border border-border bg-background/40 p-3">
                <p className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">Related install records</p>
                {relatedRecords(installRecords, lead).length === 0 ? <p className="text-xs text-muted-foreground">No matching install records yet.</p> : relatedRecords(installRecords, lead).map(record => (
                  <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2 text-xs first:border-t-0">
                    <span>{record.vin || 'No VIN'} · {record.install_status} · {record.installation_completed_at ? new Date(record.installation_completed_at).toLocaleDateString() : 'No completion date'}</span>
                    <Button size="sm" variant="outline" disabled={record.verification_excluded} onClick={() => excludeRecord.mutate({ record, lead })}>{record.verification_excluded ? 'Excluded' : 'Exclude from count'}</Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}