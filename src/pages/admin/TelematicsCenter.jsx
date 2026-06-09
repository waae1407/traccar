import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Wifi, WifiOff, Zap, CheckCircle, XCircle, ChevronLeft, ChevronRight, RefreshCw, Calendar } from 'lucide-react';
import { format } from 'date-fns';

// ── helpers ─────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color }) {
  return (
    <div className="rounded-xl bg-secondary/40 border border-border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || ''}`}>{value ?? 0}</p>
      {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

const STATUS_COLORS = {
  online: 'bg-green-500/20 text-green-400',
  offline: 'bg-red-500/20 text-red-400',
  sent: 'bg-blue-500/20 text-blue-400',
  executed: 'bg-green-500/20 text-green-400',
  delivered: 'bg-green-500/20 text-green-400',
  acknowledged: 'bg-green-500/20 text-green-400',
  confirmed: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
  expired: 'bg-muted text-muted-foreground',
  blocked: 'bg-red-500/20 text-red-400',
  queued: 'bg-yellow-500/20 text-yellow-400',
  sending: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  verified: 'bg-green-500/20 text-green-400',
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-yellow-500/20 text-yellow-400',
  correction_needed: 'bg-orange-500/20 text-orange-400',
};

function SBadge({ status }) {
  return (
    <Badge className={`${STATUS_COLORS[status] || 'bg-muted text-muted-foreground'} text-xs`}>
      {status?.replace(/_/g, ' ')}
    </Badge>
  );
}

function DateFilter({ label, value, onChange, defaultDays }) {
  const preset = () => {
    const d = new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000);
    onChange(d.toISOString().split('T')[0]);
  };
  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{label}:</span>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs bg-secondary border border-border rounded px-2 py-1 text-foreground"
      />
      <button onClick={preset} className="text-xs text-primary hover:underline">Reset</button>
    </div>
  );
}

function Paginator({ page, hasMore, onPrev, onNext, loading }) {
  return (
    <div className="flex items-center justify-between pt-3 border-t border-border mt-2">
      <Button variant="outline" size="sm" onClick={onPrev} disabled={page <= 1 || loading}>
        <ChevronLeft className="h-3 w-3" /> Prev
      </Button>
      <span className="text-xs text-muted-foreground">Page {page}</span>
      <Button variant="outline" size="sm" onClick={onNext} disabled={!hasMore || loading}>
        Next <ChevronRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ── Tab data hook (lazy — only fires when activeTab matches) ─────
function useTabData(tab, activeTab, params) {
  return useQuery({
    queryKey: ['telematics_tab', tab, params],
    queryFn: () => base44.functions.invoke('getTelematicsTabData', { tab, ...params }).then(r => r.data),
    enabled: activeTab === tab,
    staleTime: 30000,
  });
}

// ── DEVICES TAB ─────────────────────────────────────────────────
function DevicesTab({ activeTab, scopeParams }) {
  const [page, setPage] = useState(1);
  const [dateFrom] = useState('');
  const { data, isLoading } = useTabData('devices', activeTab, { ...scopeParams, page });
  const devices = data?.data || [];
  return (
    <div className="space-y-2 mt-4">
      {isLoading && <p className="text-muted-foreground text-sm py-4">Loading devices…</p>}
      {!isLoading && devices.map(d => (
        <div key={d.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <div className="flex items-center gap-3">
            {d.online_status === 'online'
              ? <Wifi className="h-4 w-4 text-green-400" />
              : d.online_status === 'offline'
                ? <WifiOff className="h-4 w-4 text-red-400" />
                : <Wifi className="h-4 w-4 text-muted-foreground" />}
            <div>
              <p className="font-medium">{d.unique_id} — {d.provider_key}</p>
              <p className="text-muted-foreground text-xs">
                {d.vehicle ? `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model}` : 'No vehicle'}
                {' · Last: '}{d.last_seen_at ? format(new Date(d.last_seen_at), 'MMM d, h:mm a') : 'never'}
              </p>
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
      {!isLoading && !devices.length && <p className="text-muted-foreground text-sm">No devices found.</p>}
      <Paginator page={page} hasMore={data?.has_more} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} loading={isLoading} />
    </div>
  );
}

// ── COMMANDS TAB ─────────────────────────────────────────────────
function CommandsTab({ activeTab, scopeParams }) {
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  });
  const { data, isLoading } = useTabData('commands', activeTab, { ...scopeParams, page, date_from: dateFrom });
  const commands = data?.data || [];
  return (
    <div className="space-y-2 mt-4">
      <DateFilter label="From" value={dateFrom} onChange={v => { setDateFrom(v); setPage(1); }} defaultDays={7} />
      {isLoading && <p className="text-muted-foreground text-sm py-4">Loading commands…</p>}
      {!isLoading && commands.map(cmd => (
        <div key={cmd.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <div className="flex items-center gap-3">
            {['failed', 'blocked', 'expired'].includes(cmd.queue_status || cmd.status)
              ? <XCircle className="h-4 w-4 text-red-400" />
              : ['executed', 'delivered', 'acknowledged', 'confirmed'].includes(cmd.queue_status || cmd.status)
                ? <CheckCircle className="h-4 w-4 text-green-400" />
                : <div className="h-4 w-4 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin" />}
            <div>
              <p className="font-medium">{cmd.command_type?.replace(/_/g, ' ')} {cmd.production_command && <span className="text-green-400 text-xs">LIVE</span>}</p>
              <p className="text-muted-foreground text-xs">{cmd.requested_by} · {cmd.created_at ? format(new Date(cmd.created_at), 'MMM d, h:mm a') : '—'}</p>
              {cmd.failure_reason && <p className="text-red-400 text-xs">{cmd.failure_reason}</p>}
            </div>
          </div>
          <SBadge status={cmd.queue_status || cmd.status} />
        </div>
      ))}
      {!isLoading && !commands.length && <p className="text-muted-foreground text-sm">No commands found for this date range.</p>}
      <Paginator page={page} hasMore={data?.has_more} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} loading={isLoading} />
    </div>
  );
}

// ── EVENTS TAB ───────────────────────────────────────────────────
function EventsTab({ activeTab, scopeParams }) {
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  });
  const { data, isLoading } = useTabData('events', activeTab, { ...scopeParams, page, date_from: dateFrom });
  const events = data?.data || [];
  return (
    <div className="space-y-2 mt-4">
      <DateFilter label="From" value={dateFrom} onChange={v => { setDateFrom(v); setPage(1); }} defaultDays={1} />
      {isLoading && <p className="text-muted-foreground text-sm py-4">Loading events…</p>}
      {!isLoading && events.map(e => (
        <div key={e.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <div>
            <p className="font-medium">{e.event_type?.replace(/_/g, ' ')}</p>
            <p className="text-muted-foreground text-xs">{e.telematics_device_id} · {e.created_at ? format(new Date(e.created_at), 'MMM d, h:mm a') : '—'}</p>
          </div>
          <Badge className="bg-secondary text-muted-foreground text-xs">{e.provider_key || e.source || '—'}</Badge>
        </div>
      ))}
      {!isLoading && !events.length && <p className="text-muted-foreground text-sm">No events found for this date range.</p>}
      <Paginator page={page} hasMore={data?.has_more} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} loading={isLoading} />
    </div>
  );
}

// ── OFFLINE TAB ──────────────────────────────────────────────────
function OfflineTab({ offlineSummary }) {
  if (!offlineSummary?.length) return <p className="text-muted-foreground text-sm mt-4">All devices reporting normally.</p>;
  return (
    <div className="space-y-2 mt-4">
      {offlineSummary.map(d => (
        <div key={d.id} className="flex items-center justify-between rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
          <div>
            <p className="font-medium">{d.unique_id}</p>
            <p className="text-muted-foreground text-xs">Last seen: {d.last_seen_at ? format(new Date(d.last_seen_at), 'MMM d, h:mm a') : 'never'} · {d.provider_key}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <SBadge status={d.online_status} />
            {d.starter_disabled && <Badge className="bg-red-500/20 text-red-400 text-xs">⚡ Starter Off</Badge>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── INSTALLERS TAB ───────────────────────────────────────────────
function InstallersTab({ activeTab, scopeParams }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useTabData('installers', activeTab, { ...scopeParams, page });
  const leads = data?.data || [];
  return (
    <div className="space-y-2 mt-4">
      {isLoading && <p className="text-muted-foreground text-sm py-4">Loading installers…</p>}
      {!isLoading && leads.map(l => (
        <div key={l.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <div>
            <p className="font-medium">{l.installer_name || l.business_name}</p>
            <p className="text-muted-foreground text-xs">{l.business_city}, {l.business_state} · {l.installer_email || '—'}</p>
            <p className="text-xs text-muted-foreground">Installs: {l.successful_install_count || 0} ✓ / {l.failed_install_count || 0} ✗</p>
          </div>
          <SBadge status={l.installer_status} />
        </div>
      ))}
      {!isLoading && !leads.length && <p className="text-muted-foreground text-sm">No installer records.</p>}
      <Paginator page={page} hasMore={data?.has_more} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} loading={isLoading} />
    </div>
  );
}

// ── INSTALLATIONS TAB ────────────────────────────────────────────
function InstallationsTab({ activeTab, scopeParams }) {
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  });
  const { data, isLoading } = useTabData('installations', activeTab, { ...scopeParams, page, date_from: dateFrom });
  const records = data?.data || [];
  return (
    <div className="space-y-2 mt-4">
      <DateFilter label="From" value={dateFrom} onChange={v => { setDateFrom(v); setPage(1); }} defaultDays={90} />
      {isLoading && <p className="text-muted-foreground text-sm py-4">Loading installation records…</p>}
      {!isLoading && records.map(r => (
        <div key={r.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <div>
            <p className="font-medium">{r.vin || r.vin_entered || 'Unknown VIN'}</p>
            <p className="text-muted-foreground text-xs">
              {r.installer_business_name || r.installer_name || '—'}
              {' · '}{r.installation_completed_at ? format(new Date(r.installation_completed_at), 'MMM d, yyyy') : 'Not completed'}
            </p>
          </div>
          <SBadge status={r.install_status} />
        </div>
      ))}
      {!isLoading && !records.length && <p className="text-muted-foreground text-sm">No install records in this date range.</p>}
      <Paginator page={page} hasMore={data?.has_more} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} loading={isLoading} />
    </div>
  );
}

// ── ALERTS TAB ───────────────────────────────────────────────────
function AlertsTab({ activeTab, scopeParams }) {
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  });
  const { data, isLoading } = useTabData('alerts', activeTab, { ...scopeParams, page, date_from: dateFrom });
  const alerts = data?.data || [];
  return (
    <div className="space-y-2 mt-4">
      <DateFilter label="From" value={dateFrom} onChange={v => { setDateFrom(v); setPage(1); }} defaultDays={30} />
      {isLoading && <p className="text-muted-foreground text-sm py-4">Loading alerts…</p>}
      {!isLoading && alerts.map(a => (
        <div key={a.id} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <div className="flex justify-between">
            <p className="font-medium">{a.title}</p>
            <Badge className={a.severity === 'critical' ? 'bg-red-500/20 text-red-400 text-xs' : 'bg-yellow-500/20 text-yellow-400 text-xs'}>{a.severity}</Badge>
          </div>
          <p className="text-muted-foreground text-xs mt-1">{a.message}</p>
        </div>
      ))}
      {!isLoading && !alerts.length && <p className="text-muted-foreground text-sm">No telematics alerts in this date range.</p>}
      <Paginator page={page} hasMore={data?.has_more} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} loading={isLoading} />
    </div>
  );
}

// ── MAP TAB ──────────────────────────────────────────────────────
function MapTab({ activeTab, scopeParams }) {
  const { data, isLoading } = useTabData('map', activeTab, { ...scopeParams, page: 1 });
  const positions = data?.data || [];
  return (
    <div className="space-y-2 mt-4">
      {isLoading && <p className="text-muted-foreground text-sm py-4">Loading GPS positions…</p>}
      {!isLoading && (
        <p className="text-xs text-muted-foreground mb-2">{positions.length} device(s) with GPS position · Latest positions only</p>
      )}
      {!isLoading && positions.map(d => (
        <div key={d.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
          <div className="flex items-center gap-3">
            {d.online_status === 'online'
              ? <Wifi className="h-4 w-4 text-green-400" />
              : <WifiOff className="h-4 w-4 text-red-400" />}
            <div>
              <p className="font-medium">{d.unique_id}</p>
              <p className="text-muted-foreground text-xs">
                {d.last_latitude?.toFixed(5)}, {d.last_longitude?.toFixed(5)}
                {d.speed > 0 ? ` · ${d.speed?.toFixed(1)} mph` : ''}
                {d.address ? ` · ${d.address}` : ''}
              </p>
            </div>
          </div>
          <div className="text-right space-y-1">
            <SBadge status={d.online_status} />
            <p className="text-xs text-muted-foreground">{d.last_seen_at ? format(new Date(d.last_seen_at), 'MMM d, h:mm a') : 'never'}</p>
          </div>
        </div>
      ))}
      {!isLoading && !positions.length && <p className="text-muted-foreground text-sm">No GPS positions available.</p>}
    </div>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────────
export default function TelematicsCenter() {
  const [activeTab, setActiveTab] = useState('devices');

  // Dashboard summary — loads on mount, no detailed data
  const { data: dash, isLoading: dashLoading, refetch: refetchDash } = useQuery({
    queryKey: ['telematics_dashboard'],
    queryFn: () => base44.functions.invoke('getTelematicsDashboard', {}).then(r => r.data),
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const kpis = dash?.kpis;
  // Pass host_id scope downstream only when dash resolved (admin without host_id = global)
  const scopeParams = {};

  if (dashLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Loading Telematics Center…
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Telematics Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Devices · Commands · Offline · Installers · Alarms · GPS Map</p>
        </div>
        <button onClick={() => refetchDash()} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* Warnings */}
      {dash?.warnings?.map((w, i) => (
        <Alert key={i} className="border-yellow-500/30 bg-yellow-500/10 py-2">
          <AlertTriangle className="h-3 w-3 text-yellow-400" />
          <AlertDescription className="text-yellow-300 text-xs">{w}</AlertDescription>
        </Alert>
      ))}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Devices" value={kpis?.total_devices} />
        <MetricCard label="Online" value={kpis?.online_count} color="text-green-400" />
        <MetricCard label="Offline" value={kpis?.offline_count} color={kpis?.offline_count > 0 ? 'text-red-400' : ''} />
        <MetricCard label="Stale Heartbeat" value={kpis?.stale_count} color={kpis?.stale_count > 0 ? 'text-yellow-400' : ''} />
        <MetricCard label="Starter Disabled" value={kpis?.starter_disabled_count} color={kpis?.starter_disabled_count > 0 ? 'text-red-400' : ''} />
        <MetricCard label="Commands Failed" value={kpis?.command_failed_count} color={kpis?.command_failed_count > 0 ? 'text-red-400' : ''} sub="last 50" />
        <MetricCard label="Active Alarms" value={kpis?.active_alarms} color={kpis?.active_alarms > 0 ? 'text-orange-400' : ''} />
        <MetricCard label="Pending QA" value={kpis?.installs_pending_qa} color={kpis?.installs_pending_qa > 0 ? 'text-yellow-400' : ''} />
      </div>

      {/* Tabs — lazy loaded */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          {[
            ['devices', 'Devices'],
            ['commands', 'Commands'],
            ['events', 'Events'],
            ['offline', 'Offline'],
            ['installers', 'Installers'],
            ['installations', 'Installation'],
            ['alerts', 'Alerts'],
            ['map', 'GPS Map'],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="devices">
          <DevicesTab activeTab={activeTab} scopeParams={scopeParams} />
        </TabsContent>

        <TabsContent value="commands">
          <CommandsTab activeTab={activeTab} scopeParams={scopeParams} />
        </TabsContent>

        <TabsContent value="events">
          <EventsTab activeTab={activeTab} scopeParams={scopeParams} />
        </TabsContent>

        <TabsContent value="offline">
          <OfflineTab offlineSummary={dash?.offline_device_summary} />
        </TabsContent>

        <TabsContent value="installers">
          <InstallersTab activeTab={activeTab} scopeParams={scopeParams} />
        </TabsContent>

        <TabsContent value="installations">
          <InstallationsTab activeTab={activeTab} scopeParams={scopeParams} />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertsTab activeTab={activeTab} scopeParams={scopeParams} />
        </TabsContent>

        <TabsContent value="map">
          <MapTab activeTab={activeTab} scopeParams={scopeParams} />
        </TabsContent>
      </Tabs>
    </div>
  );
}