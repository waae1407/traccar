import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldAlert, AlertTriangle, AlertCircle, Search, Eye } from 'lucide-react';
import { format } from 'date-fns';

function MetricCard({ label, value, sub, color, warning }) {
  return (
    <div className={`rounded-xl p-4 border ${warning ? 'border-yellow-500/30 bg-yellow-500/10' : 'border-border bg-secondary/40'}`}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function SBadge({ status }) {
  const m = {
    new: 'bg-blue-500/20 text-blue-400',
    active: 'bg-red-500/20 text-red-400',
    acknowledged: 'bg-yellow-500/20 text-yellow-400',
    resolved: 'bg-green-500/20 text-green-400',
    dismissed_false_positive: 'bg-muted text-muted-foreground'
  };
  return <Badge className={m[status] || 'bg-muted text-muted-foreground text-xs'}>{status?.replace(/_/g, ' ')}</Badge>;
}

export default function AdminAlert360() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-alert360-dashboard'],
    queryFn: () => base44.functions.invoke('getAlert360Dashboard', {}).then(r => r.data),
    refetchInterval: 15000,
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading Alert360…</div>;

  const kpis = data?.kpis || {};
  const events = data?.events || [];
  const incidents = data?.incidents || [];

  const filteredEvents = events.filter((e) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return e.vehicle_display_name?.toLowerCase().includes(q) ||
             e.vin?.toLowerCase().includes(q) ||
             e.alert_title?.toLowerCase().includes(q) ||
             e.host_name?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Alert360</h1>
        <p className="text-muted-foreground text-sm mt-1">Safety • Security • Device Health • Compliance • Incidents</p>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Active Critical Alerts" value={kpis.activeCritical} color="text-red-400" warning={kpis.activeCritical > 0} />
        <MetricCard label="Active Warnings" value={kpis.activeWarnings} color="text-yellow-400" />
        <MetricCard label="Open Incidents" value={kpis.openIncidents} color="text-red-400" />
        <MetricCard label="Smoke Events Today" value={kpis.smokeToday} />
        <MetricCard label="Impact Events Today" value={kpis.impactToday} />
        <MetricCard label="Tracker Tamper Events" value={kpis.powerCutEvents} color={kpis.powerCutEvents > 0 ? 'text-red-400' : ''} />
        <MetricCard label="Offline Devices" value={kpis.offlineDevices} color={kpis.offlineDevices > 0 ? 'text-yellow-400' : ''} />
        <MetricCard label="Command ACK Issues" value={kpis.ackIssues} color={kpis.ackIssues > 0 ? 'text-yellow-400' : ''} />
        <MetricCard label="Parser Errors" value={kpis.parserErrors} />
        <MetricCard label="Average Resolution Time" value={kpis.meanRes} />
        <MetricCard label="Mean Time To Acknowledge" value={kpis.meanAck} />
        <MetricCard label="Most Active Vehicle" value={kpis.mostActiveVehicle} />
        <MetricCard label="Most Active Host" value={kpis.mostActiveHost} />
      </div>

      <Tabs defaultValue="active_alerts">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="active_alerts">Active Alerts</TabsTrigger>
          <TabsTrigger value="open_incidents">Open Incidents</TabsTrigger>
          <TabsTrigger value="all_history">Alert History</TabsTrigger>
        </TabsList>

        <div className="mt-4 mb-4 relative max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search alerts..." 
            className="w-full pl-9 pr-4 py-2 bg-secondary/40 border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <TabsContent value="active_alerts" className="space-y-2">
          {filteredEvents.filter(e => e.is_active).map(e => (
            <div key={e.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-lg bg-secondary/30 px-4 py-3 text-sm">
              <div className="flex items-start gap-3">
                {e.severity === 'critical' ? <ShieldAlert className="h-5 w-5 text-red-400 mt-0.5" /> : <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />}
                <div>
                  <p className="font-medium text-foreground">{e.alert_title} <span className="text-muted-foreground text-xs ml-2">x{e.occurrence_count || 1}</span></p>
                  <p className="text-muted-foreground text-xs">{e.category} · {e.vehicle_display_name} · Host: {e.host_name}</p>
                </div>
              </div>
              <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-4">
                <div className="text-left md:text-right">
                  <p className="text-muted-foreground text-xs">{format(new Date(e.last_seen_at || e.first_seen_at), 'MMM d, h:mm a')}</p>
                  <SBadge status={e.status} />
                </div>
                <button className="text-primary hover:text-primary/80 text-sm font-semibold flex items-center gap-1">
                  <Eye className="h-4 w-4" /> View
                </button>
              </div>
            </div>
          ))}
          {!filteredEvents.filter(e => e.is_active).length && <p className="text-muted-foreground text-sm">No active alerts.</p>}
        </TabsContent>

        <TabsContent value="open_incidents" className="space-y-2">
          {incidents.filter(i => i.status === 'open' || i.status === 'investigating').map(i => (
            <div key={i.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                <div>
                  <p className="font-bold text-foreground">{i.incident_title}</p>
                  <p className="text-muted-foreground text-xs">{i.incident_summary}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground text-xs">{format(new Date(i.last_seen_at || i.first_seen_at), 'MMM d, h:mm a')}</p>
                <Badge className="bg-red-500/20 text-red-400 text-xs mt-1 uppercase">{i.status}</Badge>
              </div>
            </div>
          ))}
          {!incidents.filter(i => i.status === 'open' || i.status === 'investigating').length && <p className="text-muted-foreground text-sm">No open incidents.</p>}
        </TabsContent>

        <TabsContent value="all_history" className="space-y-2">
          {filteredEvents.map(e => (
            <div key={e.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-lg bg-secondary/30 px-4 py-3 text-sm">
              <div className="flex items-start gap-3">
                {e.severity === 'critical' ? <ShieldAlert className="h-5 w-5 text-red-400 mt-0.5" /> : <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />}
                <div>
                  <p className="font-medium text-foreground">{e.alert_title} <span className="text-muted-foreground text-xs ml-2">x{e.occurrence_count || 1}</span></p>
                  <p className="text-muted-foreground text-xs">{e.category} · {e.vehicle_display_name} · Host: {e.host_name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground text-xs">{format(new Date(e.last_seen_at || e.first_seen_at), 'MMM d, h:mm a')}</p>
                <SBadge status={e.status} />
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}