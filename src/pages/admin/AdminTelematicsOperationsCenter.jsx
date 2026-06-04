import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, Router, Satellite, ShieldAlert, Wifi, WifiOff } from "lucide-react";
import TelematicsMetricCard from "@/components/telematics/TelematicsMetricCard";
import TelematicsMap from "@/components/telematics/TelematicsMap";
import TelematicsService from "@/lib/telematics/TelematicsService";
import SafetyEventsPanel from "@/components/telematics/safety/SafetyEventsPanel";
import ExpandableSection from "@/components/shared/ExpandableSection";
import { commandLabel, statusLabel } from "@/components/telematics/command-test/businessLanguage";

const COMMAND_STATES = ["queued", "sending", "sent", "delivered", "acknowledged", "executed", "failed", "expired"];

export default function AdminTelematicsOperationsCenter() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ provider: "all", command: "all", status: "all", search: "" });
  const { data: devices = [] } = useQuery({ queryKey: ["ops-telematics-devices"], queryFn: () => base44.entities.TelematicsDevice.list("-updated_date", 500), refetchInterval: 30000 });
  const { data: commands = [] } = useQuery({ queryKey: ["ops-telematics-commands"], queryFn: () => base44.entities.TelematicsCommand.list("-created_date", 300), refetchInterval: 15000 });
  const { data: providers = [] } = useQuery({ queryKey: ["ops-telematics-providers"], queryFn: () => base44.entities.TelematicsProviderConfig.list("provider_key", 100), refetchInterval: 60000 });
  const { data: alerts = [] } = useQuery({ queryKey: ["ops-telematics-alerts"], queryFn: () => base44.entities.OperationalAlert.list("-created_date", 100), refetchInterval: 30000 });
  const { data: vehicles = [] } = useQuery({ queryKey: ["ops-telematics-vehicles"], queryFn: () => base44.entities.Vehicle.list("-updated_date", 500), refetchInterval: 60000 });
  const { data: hosts = [] } = useQuery({ queryKey: ["ops-telematics-hosts"], queryFn: () => base44.entities.Host.list("business_name", 500), refetchInterval: 60000 });
  const { data: bookings = [] } = useQuery({ queryKey: ["ops-telematics-bookings"], queryFn: () => base44.entities.BookingRequest.list("-updated_date", 500), refetchInterval: 60000 });

  const staleCutoff = Date.now() - 6 * 60 * 60 * 1000;
  const staleDevices = devices.filter(d => !d.last_seen_at || new Date(d.last_seen_at).getTime() < staleCutoff);
  const filteredCommands = useMemo(() => commands.filter(c => {
    const text = `${c.provider_key} ${c.vehicle_id} ${c.telematics_device_id} ${c.command_type}`.toLowerCase();
    return (filters.provider === "all" || c.provider_key === filters.provider) &&
      (filters.command === "all" || c.command_type === filters.command) &&
      (filters.status === "all" || (c.queue_status || c.status) === filters.status) &&
      text.includes(filters.search.toLowerCase());
  }), [commands, filters]);

  const commandCounts = COMMAND_STATES.reduce((acc, key) => ({ ...acc, [key]: commands.filter(c => (c.queue_status || c.status) === key).length }), {});
  const telematicsAlerts = useMemo(() => alerts.filter(alert => alert.domain === "telematics" || alert.provider_key || alert.telematics_device_id), [alerts]);

  return <div className="p-4 sm:p-6 space-y-5">
    <div><p className="text-xs font-bold text-primary uppercase tracking-widest">Live Operations</p><h1 className="text-2xl font-black">Telematics Operations</h1><p className="text-sm text-muted-foreground">Monitor live fleet location, safety events, device health, vehicle-action results, service health, and telematics alerts.</p></div>

    <section className="space-y-3"><h2 className="font-black">Fleet GPS Map</h2><TelematicsMap role="admin" devices={devices} vehicles={vehicles} hosts={hosts} bookings={bookings} providers={providers} height={520} showFilters showRefresh refreshLabel="Refresh Locations" onRefresh={async () => { await TelematicsService.syncTraccarPositions(); qc.invalidateQueries({ queryKey: ["ops-telematics-devices"] }); }} /></section>

    <ExpandableSection title="Safety Events">
      <SafetyEventsPanel role="admin" title="Safety Events" />
    </ExpandableSection>

    <ExpandableSection title="Fleet Health">
      <div className="grid md:grid-cols-6 gap-3">
        <TelematicsMetricCard label="Total devices" value={devices.length} icon={Router} />
        <TelematicsMetricCard label="Online" value={devices.filter(d => d.online_status === "online").length} icon={Wifi} tone="text-green-400" />
        <TelematicsMetricCard label="Offline" value={devices.filter(d => d.online_status === "offline").length} icon={WifiOff} tone="text-red-400" />
        <TelematicsMetricCard label="Stale" value={staleDevices.length} icon={AlertTriangle} tone="text-yellow-400" />
        <TelematicsMetricCard label="Suspended" value={devices.filter(d => d.lifecycle_status === "suspended").length} icon={AlertTriangle} tone="text-orange-400" />
        <TelematicsMetricCard label="Active alerts" value={telematicsAlerts.length} icon={ShieldAlert} tone="text-red-400" />
      </div>
    </ExpandableSection>

    <ExpandableSection title="Vehicle Action Center" defaultOpen>
      <div className="grid md:grid-cols-8 gap-2 mb-3">{COMMAND_STATES.map(key => <button key={key} type="button" onClick={() => setFilters(f => ({ ...f, status: f.status === key ? "all" : key }))} className="text-left"><Card className={`glass transition-all hover:border-primary/40 ${filters.status === key ? "border-primary/50 ring-1 ring-primary/30" : ""}`}><CardContent className="p-3"><p className="text-xs text-muted-foreground capitalize">{statusLabel(key)}</p><p className="text-xl font-black">{commandCounts[key] || 0}</p></CardContent></Card></button>)}</div>
      <div className="space-y-3"><div className="grid md:grid-cols-3 gap-2"><Select value={filters.provider} onValueChange={provider => setFilters(f => ({ ...f, provider }))}><SelectTrigger><SelectValue placeholder="Service Network" /></SelectTrigger><SelectContent><SelectItem value="all">All service networks</SelectItem>{providers.map(p => <SelectItem key={p.id} value={p.provider_key}>Telematics Network</SelectItem>)}</SelectContent></Select><Select value={filters.command} onValueChange={command => setFilters(f => ({ ...f, command }))}><SelectTrigger><SelectValue placeholder="Vehicle Action" /></SelectTrigger><SelectContent><SelectItem value="all">All actions</SelectItem>{["locate", "lock", "unlock", "horn_lights", "disable_starter", "restore_starter", "status"].map(c => <SelectItem key={c} value={c}>{commandLabel(c)}</SelectItem>)}</SelectContent></Select><Input placeholder="Search host, vehicle, device..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} /></div>{filteredCommands.slice(0, 40).map(c => <div key={c.id} className="rounded-xl border border-border p-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{commandLabel(c.command_type)} · Telematics Network</span><span className="text-muted-foreground">{c.vehicle_id || c.telematics_device_id}</span><Badge variant="outline">{statusLabel(c.queue_status || c.status)}</Badge></div>)}</div>
    </ExpandableSection>

    <ExpandableSection title="Service Network Health">
      <div className="grid md:grid-cols-3 gap-3">{providers.map(provider => { const providerCommands = commands.filter(c => c.provider_key === provider.provider_key); const failed = providerCommands.filter(c => ["failed", "expired"].includes(c.queue_status || c.status)).length; const successRate = providerCommands.length ? Math.round(((providerCommands.length - failed) / providerCommands.length) * 100) : 100; return <Card key={provider.id} className="glass"><CardHeader><CardTitle className="text-base flex items-center gap-2"><Satellite className="h-4 w-4" />Telematics Network</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span>Status</span><Badge variant="outline">{provider.health_status || "unknown"}</Badge></div><div className="flex justify-between"><span>Last check</span><span className="text-muted-foreground">{provider.last_health_check_at ? new Date(provider.last_health_check_at).toLocaleString() : "—"}</span></div><div className="flex justify-between"><span>Devices</span><b>{devices.filter(d => d.provider_key === provider.provider_key).length}</b></div><div className="flex justify-between"><span>Action success</span><b>{successRate}%</b></div></CardContent></Card>; })}</div>
    </ExpandableSection>

    <ExpandableSection title="Telematics Alerts" defaultOpen>
      <div className="space-y-2">{telematicsAlerts.slice(0, 30).map(alert => <div key={alert.id} className="rounded-xl border border-border p-3 flex items-start justify-between gap-3"><div><p className="font-bold">{alert.title}</p><p className="text-xs text-muted-foreground">{alert.message}</p></div><Badge variant="outline">{alert.severity}</Badge></div>)}{telematicsAlerts.length === 0 && <p className="text-sm text-muted-foreground text-center py-6"><CheckCircle2 className="h-6 w-6 mx-auto mb-2" />No active telematics alerts.</p>}</div>
    </ExpandableSection>
  </div>;
}