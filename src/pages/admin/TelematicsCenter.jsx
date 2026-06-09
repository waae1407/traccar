import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Wifi, WifiOff, Zap, MapPin, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';

function MetricCard({ label, value, sub, color }) {
  return (
    <div className="rounded-xl bg-secondary/40 border border-border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || ''}`}>{value}</p>
      {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function SBadge({ status }) {
  const m = { online: 'bg-green-500/20 text-green-400', offline: 'bg-red-500/20 text-red-400', sent: 'bg-blue-500/20 text-blue-400', executed: 'bg-green-500/20 text-green-400', failed: 'bg-red-500/20 text-red-400', expired: 'bg-muted text-muted-foreground', queued: 'bg-yellow-500/20 text-yellow-400', completed: 'bg-green-500/20 text-green-400', verified: 'bg-green-500/20 text-green-400' };
  return <Badge className={m[status] || 'bg-muted text-muted-foreground text-xs'}>{status?.replace(/_/g,' ')}</Badge>;
}

export default function TelematicsCenter() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['telematics_center'],
    queryFn: () => base44.functions.invoke('getTelematicsCenterMetrics', {}).then(r => r.data),
    refetchInterval: 60000,
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading Telematics Center…</div>;

  const kpis = data?.kpis;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Telematics Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Devices · Commands · Offline · Installers · Alarms · GPS Map</p>
        </div>
        <button onClick={() => refetch()} className="text-xs text-muted-foreground hover:text-foreground">↻ Refresh</button>
      </div>

      {data?.warnings?.map((w, i) => <Alert key={i} className="border-yellow-500/30 bg-yellow-500/10 py-2"><AlertTriangle className="h-3 w-3 text-yellow-400" /><AlertDescription className="text-yellow-300 text-xs">{w}</AlertDescription></Alert>)}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Devices" value={kpis?.total_devices || 0} />
        <MetricCard label="Online" value={kpis?.online_count || 0} color="text-green-400" />
        <MetricCard label="Offline" value={kpis?.offline_count || 0} color="text-red-400" />
        <MetricCard label="Stale Heartbeat" value={kpis?.stale_count || 0} color="text-yellow-400" />
        <MetricCard label="Starter Disabled" value={kpis?.starter_disabled_count || 0} color={kpis?.starter_disabled_count > 0 ? 'text-red-400' : ''} />
        <MetricCard label="Commands Failed" value={kpis?.command_failed_count || 0} color={kpis?.command_failed_count > 0 ? 'text-red-400' : ''} />
        <MetricCard label="Active Alarms" value={kpis?.active_alarms || 0} color={kpis?.active_alarms > 0 ? 'text-orange-400' : ''} />
        <MetricCard label="Install Pending" value={kpis?.install_pending || 0} color="text-yellow-400" />
      </div>

      <Tabs defaultValue="devices">
        <TabsList className="flex-wrap h-auto gap-1">
          {[['devices','Devices'],['commands','Commands'],['offline','Offline Vehicles'],['installers','Installers'],['install','Installation'],['alerts','Alerts']].map(([v,l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="devices" className="mt-4 space-y-2">
          {data?.devices?.map(d => (
            <div key={d.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div className="flex items-center gap-3">
                {d.online_status === 'online' ? <Wifi className="h-4 w-4 text-green-400" /> : d.online_status === 'offline' ? <WifiOff className="h-4 w-4 text-red-400" /> : <Wifi className="h-4 w-4 text-muted-foreground" />}
                <div>
                  <p className="font-medium">{d.unique_id} — {d.provider_key}</p>
                  <p className="text-muted-foreground text-xs">{d.vehicle ? `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model}` : 'No vehicle'} · Last: {d.last_seen_at ? format(new Date(d.last_seen_at), 'MMM d, h:mm a') : 'never'}</p>
                  {d.is_stale && <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Stale heartbeat</Badge>}
                </div>
              </div>
              <div className="text-right space-y-1">
                <SBadge status={d.online_status} />
                {d.starter_disabled && <div><Badge className="bg-red-500/20 text-red-400 text-xs">⚡ Starter Off</Badge></div>}
                {d.last_latitude && <p className="text-xs text-muted-foreground">{d.last_latitude?.toFixed(4)}, {d.last_longitude?.toFixed(4)}</p>}
              </div>
            </div>
          ))}
          {!data?.devices?.length && <p className="text-muted-foreground text-sm">No devices found.</p>}
        </TabsContent>

        <TabsContent value="commands" className="mt-4 space-y-2">
          {data?.commands?.map(cmd => (
            <div key={cmd.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div className="flex items-center gap-3">
                {['failed','blocked','expired'].includes(cmd.queue_status || cmd.status) ? <XCircle className="h-4 w-4 text-red-400" /> : ['executed','delivered','acknowledged','confirmed'].includes(cmd.queue_status || cmd.status) ? <CheckCircle className="h-4 w-4 text-green-400" /> : <div className="h-4 w-4 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" />}
                <div>
                  <p className="font-medium">{cmd.command_type?.replace(/_/g,' ')} {cmd.production_command && <span className="text-green-400 text-xs">LIVE</span>}</p>
                  <p className="text-muted-foreground text-xs">{cmd.requested_by} · {cmd.created_at ? format(new Date(cmd.created_at), 'MMM d, h:mm a') : '—'}</p>
                  {cmd.failure_reason && <p className="text-red-400 text-xs">{cmd.failure_reason}</p>}
                </div>
              </div>
              <SBadge status={cmd.queue_status || cmd.status} />
            </div>
          ))}
          {!data?.commands?.length && <p className="text-muted-foreground text-sm">No commands found.</p>}
        </TabsContent>

        <TabsContent value="offline" className="mt-4 space-y-2">
          {data?.offline_vehicles?.map(v => (
            <div key={v?.id} className="flex items-center justify-between rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
              <div><p className="font-medium">{v?.year} {v?.make} {v?.model}</p><p className="text-muted-foreground text-xs">{v?.vin || '—'}</p></div>
              <Badge className="bg-red-500/20 text-red-400">GPS Offline</Badge>
            </div>
          ))}
          {data?.stale_heartbeat_devices?.filter(d => !data?.offline_vehicles?.some(v => v?.id === d.vehicle_id)).map(d => (
            <div key={d.id} className="flex items-center justify-between rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-sm">
              <div><p className="font-medium">{d.unique_id}</p><p className="text-muted-foreground text-xs">Last seen: {d.last_seen_at ? format(new Date(d.last_seen_at), 'MMM d, h:mm a') : 'never'}</p></div>
              <Badge className="bg-yellow-500/20 text-yellow-400">Stale</Badge>
            </div>
          ))}
          {!data?.offline_vehicles?.length && !data?.stale_heartbeat_devices?.length && <p className="text-muted-foreground text-sm">All devices online.</p>}
        </TabsContent>

        <TabsContent value="installers" className="mt-4 space-y-2">
          {data?.installer_leads?.map(l => (
            <div key={l.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{l.installer_name || l.business_name}</p>
                <p className="text-muted-foreground text-xs">{l.business_city}, {l.business_state} · {l.installer_email}</p>
                <p className="text-xs text-muted-foreground">Installs: {l.successful_install_count || 0} ✓ / {l.failed_install_count || 0} ✗</p>
              </div>
              <SBadge status={l.installer_status} />
            </div>
          ))}
          {!data?.installer_leads?.length && <p className="text-muted-foreground text-sm">No installer records.</p>}
        </TabsContent>

        <TabsContent value="install" className="mt-4 space-y-2">
          {data?.install_records?.map(r => (
            <div key={r.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{r.vin || r.vin_entered || 'Unknown VIN'}</p>
                <p className="text-muted-foreground text-xs">{r.installer_business_name || r.installer_name || '—'} · {r.installation_completed_at ? format(new Date(r.installation_completed_at), 'MMM d, yyyy') : 'Not completed'}</p>
              </div>
              <SBadge status={r.install_status} />
            </div>
          ))}
          {!data?.install_records?.length && <p className="text-muted-foreground text-sm">No install records.</p>}
        </TabsContent>

        <TabsContent value="alerts" className="mt-4 space-y-2">
          {data?.operational_alerts?.map(a => (
            <div key={a.id} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div className="flex justify-between"><p className="font-medium">{a.title}</p><Badge className={a.severity === 'critical' ? 'bg-red-500/20 text-red-400 text-xs' : 'bg-yellow-500/20 text-yellow-400 text-xs'}>{a.severity}</Badge></div>
              <p className="text-muted-foreground text-xs mt-1">{a.message}</p>
            </div>
          ))}
          {!data?.operational_alerts?.length && <p className="text-muted-foreground text-sm">No telematics alerts.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}