import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2 } from 'lucide-react';

function MetricCard({ label, value, sub, color }) {
  return (
    <div className="rounded-xl bg-secondary/40 border border-border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || ''}`}>{value}</p>
      {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function MaintenanceRow({ m }) {
  const statusColor = { overdue: 'bg-red-500/10 border-red-500/30', due_soon: 'bg-yellow-500/10 border-yellow-500/30', in_maintenance: 'bg-blue-500/10 border-blue-500/30', completed: 'bg-secondary/30 border-border', scheduled: 'bg-secondary/30 border-border' };
  const badgeColor = { overdue: 'bg-red-500/20 text-red-400', due_soon: 'bg-yellow-500/20 text-yellow-400', completed: 'bg-muted text-muted-foreground', scheduled: 'bg-blue-500/20 text-blue-400', in_maintenance: 'bg-blue-500/20 text-blue-400' };
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${statusColor[m.computed_status] || 'bg-secondary/30 border-border'}`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium">{m.service_type?.replace(/_/g,' ')} — {m.vehicle_name}</p>
          <p className="text-muted-foreground text-xs">{m.date} · {m.shop_name || '—'} · ${(m.cost || 0).toFixed(2)}</p>
          {m.next_service_date && <p className="text-xs text-yellow-400 mt-0.5">Next due: {m.next_service_date}{m.days_until_service !== null && ` (${m.days_until_service > 0 ? m.days_until_service + 'd' : 'OVERDUE'})`}</p>}
        </div>
        <Badge className={`${badgeColor[m.computed_status] || 'bg-muted text-muted-foreground'} text-xs`}>{m.computed_status?.replace(/_/g,' ')}</Badge>
      </div>
    </div>
  );
}

export default function HostMaintenanceCenter() {
  const { user } = useAuth();
  const [filterVehicle, setFilterVehicle] = useState('');

  const { data: hosts = [] } = useQuery({
    queryKey: ['my_host_maint', user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user.email }),
    enabled: !!user?.email,
  });
  const myHost = hosts[0];

  // Only own vehicles
  const { data: vehicles = [] } = useQuery({
    queryKey: ['host_vehicles_maint', myHost?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: myHost.id }, '-created_date', 200),
    enabled: !!myHost?.id,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['host_maintenance_center', filterVehicle],
    queryFn: () => base44.functions.invoke('getMaintenanceCenterMetrics', { vehicle_id: filterVehicle || undefined }).then(r => r.data),
    enabled: !!myHost?.id,
  });

  if (isLoading && !data) return <div className="p-8 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading maintenance…</div>;

  const kpis = data?.kpis;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maintenance Center</h1>
        <p className="text-muted-foreground text-sm mt-1">Your fleet maintenance · Next service dates · Mileage alerts · Cost tracking</p>
      </div>

      {data?.warnings?.map((w, i) => <Alert key={i} className="border-yellow-500/30 bg-yellow-500/10 py-2"><AlertTriangle className="h-3 w-3 text-yellow-400" /><AlertDescription className="text-yellow-300 text-xs">{w}</AlertDescription></Alert>)}

      <Select value={filterVehicle} onValueChange={setFilterVehicle}>
        <SelectTrigger className="w-60"><SelectValue placeholder="All vehicles" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={null}>All vehicles</SelectItem>
          {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Cost" value={`$${(kpis?.total_cost || 0).toLocaleString()}`} />
        <MetricCard label="Overdue" value={kpis?.overdue_count || 0} color="text-red-400" />
        <MetricCard label="Due Soon" value={kpis?.due_soon_count || 0} color="text-yellow-400" />
        <MetricCard label="In Maintenance" value={kpis?.downtime_count || 0} color="text-blue-400" />
      </div>

      <Tabs defaultValue="due_soon">
        <TabsList className="flex-wrap h-auto gap-1">
          {[['due_soon','Due Soon'],['overdue','Overdue'],['scheduled','Scheduled'],['completed','Completed'],['by_vehicle','By Vehicle']].map(([v,l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="due_soon" className="mt-4 space-y-2">
          {data?.due_soon?.map(m => <MaintenanceRow key={m.id} m={m} />)}
          {!data?.due_soon?.length && <p className="text-muted-foreground text-sm">No items due soon.</p>}
        </TabsContent>

        <TabsContent value="overdue" className="mt-4 space-y-2">
          {data?.overdue?.map(m => <MaintenanceRow key={m.id} m={m} />)}
          {!data?.overdue?.length && <p className="text-muted-foreground text-sm">No overdue maintenance.</p>}
        </TabsContent>

        <TabsContent value="scheduled" className="mt-4 space-y-2">
          {data?.scheduled?.map(m => <MaintenanceRow key={m.id} m={m} />)}
          {!data?.scheduled?.length && <p className="text-muted-foreground text-sm">No scheduled maintenance.</p>}
        </TabsContent>

        <TabsContent value="completed" className="mt-4 space-y-2">
          {data?.completed?.slice(0, 30).map(m => <MaintenanceRow key={m.id} m={m} />)}
          {!data?.completed?.length && <p className="text-muted-foreground text-sm">No completed records.</p>}
        </TabsContent>

        <TabsContent value="by_vehicle" className="mt-4 space-y-2">
          {Object.entries(data?.breakdowns?.by_vehicle || {}).sort((a, b) => b[1] - a[1]).map(([vid, cost]) => {
            const v = vehicles.find(v => v.id === vid);
            return (
              <div key={vid} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                <p>{v ? `${v.year} ${v.make} ${v.model}` : vid.slice(-8)}</p>
                <p className="text-muted-foreground">${(cost || 0).toFixed(2)}</p>
              </div>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}