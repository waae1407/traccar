import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Wifi, WifiOff, CheckCircle, XCircle, ChevronLeft, ChevronRight, RefreshCw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

function MetricCard({ label, value, sub, color }) {
  return (
    <div className="rounded-xl bg-secondary/40 border border-border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || ''}`}>{value ?? 0}</p>
      {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function SBadge({ status }) {
  const m = { online: 'bg-green-500/20 text-green-400', offline: 'bg-red-500/20 text-red-400', sent: 'bg-blue-500/20 text-blue-400', executed: 'bg-green-500/20 text-green-400', failed: 'bg-red-500/20 text-red-400', queued: 'bg-yellow-500/20 text-yellow-400' };
  return <Badge className={`${m[status] || 'bg-muted text-muted-foreground'} text-xs`}>{status?.replace(/_/g, ' ')}</Badge>;
}

function Paginator({ page, hasMore, onPrev, onNext, loading }) {
  return (
    <div className="flex items-center justify-between pt-3 border-t border-border mt-2">
      <Button variant="outline" size="sm" onClick={onPrev} disabled={page <= 1 || loading}><ChevronLeft className="h-3 w-3" /> Prev</Button>
      <span className="text-xs text-muted-foreground">Page {page}</span>
      <Button variant="outline" size="sm" onClick={onNext} disabled={!hasMore || loading}>Next <ChevronRight className="h-3 w-3" /></Button>
    </div>
  );
}

function useHostTabData(tab, activeTab, scopeParams) {
  return useQuery({
    queryKey: ['host_telematics_tab', tab, scopeParams],
    queryFn: () => base44.functions.invoke('getTelematicsTabData', { tab, ...scopeParams }).then(r => r.data),
    enabled: activeTab === tab,
    staleTime: 30000,
  });
}

function DevicesTab({ activeTab, scopeParams }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useHostTabData('devices', activeTab, { ...scopeParams, page });
  const devices = data?.data || [];
  return (
    <div className="space-y-2 mt-4">
      {isLoading && <p className="text-muted-foreground text-sm py-4">Loading devices…</p>}
      {devices.map(d => (
        <div key={d.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <div className="flex items-center gap-3">
            {d.online_status === 'online' ? <Wifi className="h-4 w-4 text-green-400" /> : <WifiOff className="h-4 w-4 text-red-400" />}
            <div>
              <p className="font-medium">{d.unique_id} — {d.provider_key}</p>
              <p className="text-muted-foreground text-xs">{d.vehicle ? `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model}` : 'No vehicle'} · Last seen: {d.last_seen_at ? format(new Date(d.last_seen_at), 'MMM d, h:mm a') : 'never'}</p>
              {d.is_stale && <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Stale heartbeat</Badge>}
            </div>
          </div>
          <div className="text-right space-y-1">
            <SBadge status={d.online_status} />
            {d.starter_disabled && <div><Badge className="bg-red-500/20 text-red-400 text-xs">⚡ Starter Off</Badge></div>}
          </div>
        </div>
      ))}
      {!isLoading && !devices.length && <p className="text-muted-foreground text-sm">No devices found.</p>}
      <Paginator page={page} hasMore={data?.has_more} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} loading={isLoading} />
    </div>
  );
}

function CommandsTab({ activeTab, scopeParams }) {
  const [page, setPage] = useState(1);
  const [dateFrom] = useState(() => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const { data, isLoading } = useHostTabData('commands', activeTab, { ...scopeParams, page, date_from: dateFrom });
  const commands = data?.data || [];
  return (
    <div className="space-y-2 mt-4">
      {isLoading && <p className="text-muted-foreground text-sm py-4">Loading commands…</p>}
      {commands.map(cmd => (
        <div key={cmd.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <div className="flex items-center gap-3">
            {['failed','blocked','expired'].includes(cmd.queue_status || cmd.status) ? <XCircle className="h-4 w-4 text-red-400" /> : ['executed','delivered','acknowledged','confirmed'].includes(cmd.queue_status || cmd.status) ? <CheckCircle className="h-4 w-4 text-green-400" /> : <div className="h-4 w-4 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" />}
            <div>
              <p className="font-medium">{cmd.command_type?.replace(/_/g, ' ')} {cmd.production_command && <span className="text-green-400 text-xs">Live</span>}</p>
              <p className="text-muted-foreground text-xs">{cmd.created_at ? format(new Date(cmd.created_at), 'MMM d, h:mm a') : '—'}</p>
            </div>
          </div>
          <SBadge status={cmd.queue_status || cmd.status} />
        </div>
      ))}
      {!isLoading && !commands.length && <p className="text-muted-foreground text-sm">No commands found.</p>}
      <Paginator page={page} hasMore={data?.has_more} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} loading={isLoading} />
    </div>
  );
}

function OfflineTab({ offlineSummary }) {
  if (!offlineSummary?.length) return <p className="text-muted-foreground text-sm mt-4">All your devices are reporting normally.</p>;
  return (
    <div className="space-y-2 mt-4">
      {offlineSummary.map(d => (
        <div key={d.id} className="flex items-center justify-between rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
          <div><p className="font-medium">{d.unique_id}</p><p className="text-muted-foreground text-xs">Last seen: {d.last_seen_at ? format(new Date(d.last_seen_at), 'MMM d, h:mm a') : 'never'}</p></div>
          <div className="flex flex-col items-end gap-1"><SBadge status={d.online_status} />{d.starter_disabled && <Badge className="bg-red-500/20 text-red-400 text-xs">⚡ Starter Off</Badge>}</div>
        </div>
      ))}
    </div>
  );
}

export default function HostTelematicsCenter() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('devices');

  const { data: hosts = [] } = useQuery({
    queryKey: ['my_host_telematics', user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user.email }),
    enabled: !!user?.email,
  });
  const myHost = hosts[0];

  const { data: dash, isLoading: dashLoading, refetch } = useQuery({
    queryKey: ['host_telematics_dashboard', myHost?.id],
    queryFn: () => base44.functions.invoke('getTelematicsDashboard', { host_id: myHost.id }).then(r => r.data),
    enabled: !!myHost?.id,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const scopeParams = myHost?.id ? { host_id: myHost.id } : {};
  const kpis = dash?.kpis;

  if (dashLoading || !myHost) {
    return <div className="p-8 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading telematics…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Telematics Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Your devices · Commands · Offline · GPS Map</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><RefreshCw className="h-3 w-3" /> Refresh</button>
      </div>

      {dash?.warnings?.map((w, i) => (
        <Alert key={i} className="border-yellow-500/30 bg-yellow-500/10 py-2">
          <AlertTriangle className="h-3 w-3 text-yellow-400" />
          <AlertDescription className="text-yellow-300 text-xs">{w}</AlertDescription>
        </Alert>
      ))}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Devices" value={kpis?.total_devices} />
        <MetricCard label="Online" value={kpis?.online_count} color="text-green-400" />
        <MetricCard label="Offline" value={kpis?.offline_count} color={kpis?.offline_count > 0 ? 'text-red-400' : ''} />
        <MetricCard label="Starter Disabled" value={kpis?.starter_disabled_count} color={kpis?.starter_disabled_count > 0 ? 'text-red-400' : ''} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          {[['devices','Devices'],['commands','Commands'],['offline','Offline'],['map','GPS Map']].map(([v,l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="devices"><DevicesTab activeTab={activeTab} scopeParams={scopeParams} /></TabsContent>
        <TabsContent value="commands"><CommandsTab activeTab={activeTab} scopeParams={scopeParams} /></TabsContent>
        <TabsContent value="offline"><OfflineTab offlineSummary={dash?.offline_device_summary} /></TabsContent>
        <TabsContent value="map">
          <div className="mt-4 text-muted-foreground text-sm p-4 rounded-lg bg-secondary/20">
            GPS map is available in the Vehicle Command Center. Click on any vehicle to see its live location.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}