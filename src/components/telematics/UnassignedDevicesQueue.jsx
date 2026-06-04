import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PackageSearch } from 'lucide-react';
import { deviceFreshness, formatDeviceTime, vehicleLabel } from './deviceStatus';

export default function UnassignedDevicesQueue({ devices = [], vehicles = [], providers = [], role = 'admin', onChanged }) {
  const [filters, setFilters] = useState({ provider: 'all', online: 'all', lifecycle: 'all', install: 'all', search: '' });
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [vehicleId, setVehicleId] = useState('');
  const providerByKey = useMemo(() => Object.fromEntries(providers.map(p => [p.provider_key, p])), [providers]);
  const unassigned = devices.filter(d => !d.vehicle_id);
  const filtered = unassigned.filter(d => {
    const text = [d.unique_id, d.device_imei, d.sim_iccid, d.provider_device_id, d.traccar_device_id, d.moovetrax_device_id, d.provider_key].join(' ').toLowerCase();
    if (filters.search && !text.includes(filters.search.toLowerCase())) return false;
    if (filters.provider !== 'all' && d.provider_key !== filters.provider) return false;
    if (filters.online !== 'all' && (d.online_status || 'unknown') !== filters.online) return false;
    if (filters.lifecycle !== 'all' && d.lifecycle_status !== filters.lifecycle) return false;
    if (filters.install !== 'all' && d.install_status !== filters.install) return false;
    return true;
  });
  const providersList = [...new Set(devices.map(d => d.provider_key).filter(Boolean))];
  const assign = async () => {
    await base44.functions.invoke('manageTelematicsDeviceAssignment', { action: 'link_device', device_id: selectedDevice.id, vehicle_id: vehicleId });
    setSelectedDevice(null); setVehicleId(''); await onChanged?.();
  };

  return <Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><PackageSearch className="h-4 w-4" />Unassigned Devices</CardTitle></CardHeader><CardContent className="space-y-3">
    <div className="grid gap-2 md:grid-cols-5"><Input placeholder="Search devices" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} /><Select value={filters.provider} onValueChange={provider => setFilters(f => ({ ...f, provider }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All service networks</SelectItem>{providersList.map(p => <SelectItem key={p} value={p}>Telematics Network</SelectItem>)}</SelectContent></Select><Select value={filters.online} onValueChange={online => setFilters(f => ({ ...f, online }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any status</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="offline">Offline</SelectItem><SelectItem value="unknown">Unknown</SelectItem></SelectContent></Select><Select value={filters.lifecycle} onValueChange={lifecycle => setFilters(f => ({ ...f, lifecycle }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any lifecycle</SelectItem><SelectItem value="inventory">Inventory</SelectItem><SelectItem value="provisioned">Provisioned</SelectItem><SelectItem value="retired">Retired</SelectItem></SelectContent></Select><Select value={filters.install} onValueChange={install => setFilters(f => ({ ...f, install }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any install</SelectItem><SelectItem value="not_started">Not started</SelectItem><SelectItem value="installed">Installed</SelectItem><SelectItem value="failed">Failed</SelectItem><SelectItem value="retired">Retired</SelectItem></SelectContent></Select></div>
    <div className="grid gap-3 lg:grid-cols-2">{filtered.map(device => { const fresh = deviceFreshness(device); return <div key={device.id} className="rounded-2xl border border-border p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{device.unique_id || device.id}</p><p className="text-xs text-muted-foreground">Telematics Network</p></div><Badge variant="outline" className={fresh.tone}>{fresh.label}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><span>IMEI: <b>{device.device_imei || '—'}</b></span><span>SIM: <b>{device.sim_iccid || '—'}</b></span><span>Last seen: <b>{formatDeviceTime(device.last_seen_at)}</b></span><span>Install: <b>{device.install_status || '—'}</b></span></div><Button size="sm" className="mt-3 w-full" onClick={() => setSelectedDevice(device)}>Assign</Button></div>; })}</div>
    {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No unassigned devices match these filters.</p>}
    <Dialog open={!!selectedDevice} onOpenChange={() => setSelectedDevice(null)}><DialogContent><DialogHeader><DialogTitle>Assign {selectedDevice?.unique_id}</DialogTitle></DialogHeader><Select value={vehicleId} onValueChange={setVehicleId}><SelectTrigger><SelectValue placeholder="Choose vehicle" /></SelectTrigger><SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>)}</SelectContent></Select><Button disabled={!vehicleId} onClick={assign}>Assign to Vehicle</Button></DialogContent></Dialog>
  </CardContent></Card>;
}