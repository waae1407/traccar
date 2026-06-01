import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function vehicleName(vehicle) {
  if (!vehicle) return 'Not linked';
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.id;
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-white/35">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-white">{value || '—'}</p>
    </div>
  );
}

export default function DeviceSummaryCard({ data }) {
  if (!data?.device) return null;
  const { device, provider, vehicle, host, supported_commands = [], execution } = data;
  const offline = device.online_status === 'offline';
  return (
    <Card className="glass border-white/10">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Selected Device</p>
            <h2 className="mt-2 text-2xl font-black text-white">{device.unique_id || device.id}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={execution?.dry_run ? 'bg-yellow-500 text-black' : 'bg-emerald-500 text-white'}>{execution?.dry_run ? 'Dry Run' : 'Live Enabled'}</Badge>
            <Badge className="bg-white/10 text-white">{provider?.provider_name || provider?.provider_key || 'Provider'}</Badge>
          </div>
        </div>

        {offline && (
          <div className="flex gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-yellow-200">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm font-semibold">Device is currently offline. Commands may queue, fail, or require device reconnection.</p>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Provider" value={provider?.provider_key || device.provider_key} />
          <Info label="Model" value={device.model} />
          <Info label="Vehicle" value={vehicleName(vehicle)} />
          <Info label="Host" value={host?.business_name || host?.full_name || host?.email || 'Not linked'} />
          <Info label="Online Status" value={device.online_status || 'unknown'} />
          <Info label="Last Seen" value={device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : '—'} />
          <Info label="Lifecycle" value={device.lifecycle_status} />
          <Info label="Traccar ID" value={device.traccar_device_id} />
          <Info label="Provider Device ID" value={device.provider_device_id} />
        </div>

        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-white/35">Supported Capabilities</p>
          <div className="flex flex-wrap gap-2">
            {supported_commands.length ? supported_commands.map((command) => (
              <Badge key={command.key} className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                <CheckCircle2 className="mr-1 h-3 w-3" /> {command.label}
              </Badge>
            )) : <Badge className="bg-white/10 text-white/60">No supported commands found</Badge>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}