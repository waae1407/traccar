import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Link as LinkIcon, MapPin, RefreshCw, Unlink } from 'lucide-react';
import { deviceFreshness, formatDeviceTime, providerDisplayName } from './deviceStatus';
import InstallerLocatorCTA from '@/components/installers/InstallerLocatorCTA';

function Detail({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-xs font-bold">{value || '—'}</p>
    </div>
  );
}

function DeviceRow({ device, onSelect }) {
  const fresh = deviceFreshness(device);
  return (
    <div className="space-y-2 rounded-2xl border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black">{device.unique_id || device.id}</p>
          <p className="text-xs text-muted-foreground">Telematics Network</p>
        </div>
        <Badge variant="outline" className={fresh.tone}>{fresh.label}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Detail label="IMEI" value={device.device_imei} />
        <Detail label="SIM ICCID" value={device.sim_iccid} />
        <Detail label="Last seen" value={formatDeviceTime(device.last_seen_at)} />
        <Detail label="Linked vehicle" value={device.linked_vehicle_name || device.vehicle_id || 'Unlinked'} />
      </div>
      <Button size="sm" onClick={() => onSelect(device)} className="w-full">Assign</Button>
    </div>
  );
}

export default function TelematicsDeviceAssignmentPanel({ vehicle, devices = [], providers = [], role = 'admin', onChanged }) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typedDeviceId, setTypedDeviceId] = useState('');
  const [manualProvider, setManualProvider] = useState('manual_unknown');
  const [oldDisposition, setOldDisposition] = useState('inventory');
  const providerByKey = useMemo(() => Object.fromEntries(providers.map((p) => [p.provider_key, p])), [providers]);
  const linkedDevices = devices.filter((d) => d.vehicle_id === vehicle?.id && d.lifecycle_status !== 'retired');
  const linked = linkedDevices[0] || devices.find((d) => d.id === vehicle?.telematics_device_id) || null;
  const mismatch = !!linked && ((vehicle?.telematics_device_id && vehicle.telematics_device_id !== linked.id) || linked.host_id !== vehicle?.host_id);

  const invoke = async (payload) => {
    setLoading(true);
    const res = await base44.functions.invoke('manageTelematicsDeviceAssignment', payload);
    setLoading(false);
    await onChanged?.();
    return res.data;
  };

  const search = async () => {
    const res = await invoke({ action: 'search_devices', query, filters: { assignment: 'unassigned' } });
    setSearchResults(res.devices || []);
  };

  const linkDevice = async (device) => {
    if (linked && linked.id !== device.id) {
      setSearchResults([device]);
      setReplaceOpen(true);
      return;
    }
    await invoke({ action: 'link_device', device_id: device.id, vehicle_id: vehicle.id });
    setAssignOpen(false);
  };

  const replaceDevice = async (device) => {
    await invoke({
      action: 'replace_device',
      old_device_id: linked.id,
      new_device_id: device.id,
      vehicle_id: vehicle.id,
      old_device_disposition: oldDisposition,
    });
    setReplaceOpen(false);
    setAssignOpen(false);
  };

  const unlinkDevice = async () => {
    if (!linked || !confirm('Unlink this telematics device from the vehicle?')) return;
    await invoke({ action: 'unlink_device', device_id: linked.id, disposition: 'provisioned', keep_host_ownership: role === 'host' });
  };

  const createAndLink = async () => {
    await invoke({ action: 'find_or_create_and_link', vehicle_id: vehicle.id, typed_device_id: typedDeviceId, provider_key: manualProvider });
    setTypedDeviceId('');
    setAssignOpen(false);
  };

  const copyQr = () => navigator.clipboard.writeText(`${window.location.origin}/installer/telematics?vehicle_id=${vehicle.id}`);
  const fresh = deviceFreshness(linked);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black">Telematics Device</p>
          <p className="text-xs text-muted-foreground">Secure vehicle device assignment</p>
        </div>
        {linked ? <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">Linked</Badge> : <Badge variant="outline">Unlinked</Badge>}
      </div>

      {mismatch && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-300">
          <p className="font-bold">Assignment mismatch detected.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => invoke({ action: 'repair_assignment', vehicle_id: vehicle.id })}>Repair Assignment</Button>
        </div>
      )}

      {role === 'host' && !linked && (
        <InstallerLocatorCTA
          source="telematics_setup"
          vehicle={vehicle}
          title="Need an Installer?"
          description="Find a verified installer near you."
        />
      )}

      {linked ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Detail label="Service Network" value="Telematics Network" />
          <Detail label="Device ID" value={linked.unique_id} />
          <Detail label="Device Serial" value={linked.device_imei} />
          <Detail label="Connectivity ID" value={linked.sim_iccid} />
          <Detail label="Network Device ID" value={linked.provider_device_id || linked.traccar_device_id || linked.moovetrax_device_id} />
          <Detail label="Install" value={linked.install_status} />
          <Detail label="Lifecycle" value={linked.lifecycle_status} />
          <Detail label="Last seen" value={formatDeviceTime(linked.last_seen_at)} />
          <Detail label="Status" value={fresh.label} />
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No telematics device linked to this vehicle.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setAssignOpen(true)}><LinkIcon className="h-4 w-4" />Assign Existing Device</Button>
        {linked && <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}><RefreshCw className="h-4 w-4" />Replace Device</Button>}
        {linked && <Button size="sm" variant="outline" onClick={unlinkDevice}><Unlink className="h-4 w-4" />Unlink Device</Button>}
        <Button size="sm" variant="outline" onClick={() => { window.location.href = role === 'host' ? '/host/telematics' : '/admin/telematics-operations'; }}><MapPin className="h-4 w-4" />View on Map</Button>
        <Button size="sm" variant="outline" onClick={copyQr}><Copy className="h-4 w-4" />Copy Install QR Link</Button>
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Assign Existing Device</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="Search device identifier, serial, or connectivity ID..." value={query} onChange={(e) => setQuery(e.target.value)} />
              <Button onClick={search} disabled={loading}>Search</Button>
            </div>
            <div className="space-y-2 rounded-2xl border border-border p-3">
              <p className="text-xs font-bold uppercase text-muted-foreground">Find or Create Device</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Input placeholder="Typed device ID" value={typedDeviceId} onChange={(e) => setTypedDeviceId(e.target.value)} />
                <Input placeholder="Service network key" value={manualProvider} onChange={(e) => setManualProvider(e.target.value)} />
                <Button disabled={!typedDeviceId || loading} onClick={createAndLink}>Create and Link</Button>
              </div>
            </div>
            <div className="space-y-2">
              {searchResults.map((device) => <DeviceRow key={device.id} device={device} onSelect={linkDevice} />)}
              {searchResults.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Search for unassigned vehicle devices.</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Replace telematics device?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This vehicle already has a telematics device. Replace existing device?</p>
          {role === 'admin' && (
            <Select value={oldDisposition} onValueChange={setOldDisposition}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inventory">Unlink and return to inventory</SelectItem>
                <SelectItem value="provisioned">Mark replaced/provisioned</SelectItem>
                <SelectItem value="retired">Retire old device</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReplaceOpen(false)}>Cancel</Button>
            <Button onClick={() => replaceDevice(searchResults[0])} disabled={!searchResults[0] || loading}>Confirm Replace</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}