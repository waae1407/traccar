import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import ListingControlsCard from '@/components/vehicles/ListingControlsCard';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { format } from 'date-fns';

function SBadge({ status }) {
  const m = { Available: 'bg-green-500/20 text-green-400', paid: 'bg-green-500/20 text-green-400', valid: 'bg-green-500/20 text-green-400', online: 'bg-green-500/20 text-green-400', offline: 'bg-red-500/20 text-red-400', expired: 'bg-red-500/20 text-red-400', expiring_soon: 'bg-yellow-500/20 text-yellow-400', failed: 'bg-red-500/20 text-red-400' };
  return <Badge className={m[status] || 'bg-muted text-muted-foreground text-xs'}>{status?.replace(/_/g, ' ')}</Badge>;
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div className="rounded-xl bg-secondary/40 p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || ''}`}>{value}</p>
      {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

export default function HostVehicle360() {
  const { user } = useAuth();
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const qc = useQueryClient();

  // Only host's own vehicles
  const { data: hosts = [] } = useQuery({
    queryKey: ['my_host_v360', user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({
    queryKey: ['host_vehicles_v360', host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }, '-updated_date', 200),
    enabled: !!host?.id,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['vehicle360_host', selectedVehicleId],
    queryFn: () => base44.functions.invoke('getVehicle360', { vehicle_id: selectedVehicleId }).then(r => r.data),
    enabled: !!selectedVehicleId,
  });

  const v = data?.vehicle;
  const fin = data?.financials;
  const gps = data?.gps;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vehicle 360</h1>
        <p className="text-muted-foreground text-sm mt-1">Full vehicle view — revenue, expenses, maintenance, GPS, compliance</p>
      </div>

      <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
        <SelectTrigger className="w-80"><SelectValue placeholder="Select one of your vehicles..." /></SelectTrigger>
        <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model} — {v.vin || v.plate || v.id.slice(-6)}</SelectItem>)}</SelectContent>
      </Select>

      {isLoading && selectedVehicleId && <div className="flex items-center gap-2 text-muted-foreground text-sm py-2"><div className="h-4 w-4 border-2 border-border border-t-primary rounded-full animate-spin" />Loading vehicle data…</div>}

      {data?.warnings?.map((w, i) => <Alert key={i} className="border-yellow-500/30 bg-yellow-500/10 py-2"><AlertTriangle className="h-3 w-3 text-yellow-400" /><AlertDescription className="text-yellow-300 text-xs">{w}</AlertDescription></Alert>)}

      {!selectedVehicleId && <div className="rounded-xl border border-border/50 bg-secondary/20 px-6 py-10 text-center text-muted-foreground"><p className="text-sm">Select one of your vehicles above to load its full 360° view.</p></div>}

      {v && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Gross Revenue" value={`$${(fin?.gross_revenue || 0).toLocaleString()}`} sub="Paid payments" color="text-green-400" />
            <MetricCard label="Total Expenses" value={`$${(fin?.total_expenses || 0).toLocaleString()}`} />
            <MetricCard label="Maintenance Cost" value={`$${(fin?.total_maintenance_cost || 0).toLocaleString()}`} />
            <MetricCard label="Net Profit" value={`$${(fin?.net_profit || 0).toLocaleString()}`} sub={fin?.roi_percent != null ? `ROI: ${fin.roi_percent.toFixed(1)}%` : ''} color={fin?.net_profit >= 0 ? 'text-green-400' : 'text-red-400'} />
          </div>

          <ListingControlsCard vehicle={v} hostPlan={data?.plan?.active_mode || data?.plan?.selected_mode} onUpdate={() => qc.invalidateQueries({ queryKey: ['vehicle360_host', selectedVehicleId] })} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-4 text-sm space-y-2">
                <p className="font-semibold text-base">{v.year} {v.make} {v.model}</p>
                <p className="text-muted-foreground text-xs">VIN: {v.vin || '—'}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-muted-foreground text-xs">Status</p><SBadge status={v.status} /></div>
                  <div><p className="text-muted-foreground text-xs">Approval</p><SBadge status={v.approval_status} /></div>
                  <div><p className="text-muted-foreground text-xs">Weekly Rate</p><p className="text-green-400">${v.weekly_rate || 0}</p></div>
                  <div><p className="text-muted-foreground text-xs">Mileage</p><p>{v.mileage?.toLocaleString() || '—'}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4 text-sm space-y-2">
                <p className="font-semibold">GPS / Telematics</p>
                {gps ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">{gps.online ? <Wifi className="h-4 w-4 text-green-400" /> : <WifiOff className="h-4 w-4 text-red-400" />}<SBadge status={gps.status} /></div>
                    <p className="text-muted-foreground text-xs">Last seen: {gps.last_seen ? format(new Date(gps.last_seen), 'MMM d, h:mm a') : '—'}</p>
                    {gps.starter_disabled && <Badge className="bg-red-500/20 text-red-400 text-xs">⚡ Starter Disabled</Badge>}
                  </div>
                ) : <p className="text-muted-foreground text-xs">No telematics device assigned</p>}
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4 text-sm space-y-2">
                <p className="font-semibold">Compliance</p>
                <div><p className="text-muted-foreground text-xs">Registration</p>{data.compliance?.registration ? <SBadge status={data.compliance.registration.status} /> : <Badge className="bg-red-500/20 text-red-400 text-xs">Missing</Badge>}<p className="text-xs text-muted-foreground">Expires: {data.compliance?.registration?.expiry_date || '—'}</p></div>
                <div><p className="text-muted-foreground text-xs">Insurance</p>{data.compliance?.insurance ? <SBadge status={data.compliance.insurance.status} /> : <Badge className="bg-red-500/20 text-red-400 text-xs">Missing</Badge>}<p className="text-xs text-muted-foreground">Expires: {data.compliance?.insurance?.expiry_date || '—'}</p></div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="revenue">
            <TabsList className="flex-wrap h-auto gap-1">
              {[['revenue','Revenue'],['expenses','Expenses'],['maintenance','Maintenance'],['commands','Commands'],['alert360','Alert360'],['inspections','Inspections'],['bookings','Booking History']].map(([val,l]) => (
                <TabsTrigger key={val} value={val}>{l}</TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="revenue" className="mt-4 space-y-2">
              {data.payment_logs?.filter(p => p.status === 'paid').map(p => (
                <div key={p.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div><p className="font-medium">${(p.amount || 0).toFixed(2)} · Week {p.week_number}</p><p className="text-muted-foreground text-xs">{p.paid_at ? format(new Date(p.paid_at), 'MMM d, yyyy') : '—'}</p></div>
                  <SBadge status={p.status} />
                </div>
              ))}
              {!data.payment_logs?.filter(p => p.status === 'paid').length && <p className="text-muted-foreground text-sm">No paid records found.</p>}
            </TabsContent>

            <TabsContent value="expenses" className="mt-4 space-y-2">
              {data.expenses?.map(e => (
                <div key={e.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div><p className="font-medium">{e.expense_type?.replace(/_/g,' ')} — {e.description || '—'}</p><p className="text-muted-foreground text-xs">{e.date}</p></div>
                  <p className="text-red-400 font-medium">${(e.amount || 0).toFixed(2)}</p>
                </div>
              ))}
              {!data.expenses?.length && <p className="text-muted-foreground text-sm">No expenses found.</p>}
            </TabsContent>

            <TabsContent value="maintenance" className="mt-4 space-y-2">
              {data.maintenance?.logs?.map(m => (
                <div key={m.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div><p className="font-medium">{m.service_type?.replace(/_/g,' ')}</p><p className="text-muted-foreground text-xs">{m.date} · {m.shop_name || '—'}</p>{m.next_service_date && <p className="text-xs text-yellow-400">Next due: {m.next_service_date}</p>}</div>
                  <p className="text-muted-foreground">${(m.cost || 0).toFixed(2)}</p>
                </div>
              ))}
              {!data.maintenance?.logs?.length && <p className="text-muted-foreground text-sm">No maintenance records.</p>}
            </TabsContent>

            <TabsContent value="commands" className="mt-4 space-y-2">
              {data.telematics_commands?.map(cmd => (
                <div key={cmd.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div><p className="font-medium">{cmd.command_type?.replace(/_/g,' ')}</p><p className="text-muted-foreground text-xs">{cmd.requested_by} · {cmd.created_at ? format(new Date(cmd.created_at), 'MMM d, h:mm a') : '—'}</p></div>
                  <SBadge status={cmd.queue_status || cmd.status} />
                </div>
              ))}
              {!data.telematics_commands?.length && <p className="text-muted-foreground text-sm">No commands found.</p>}
            </TabsContent>

            <TabsContent value="alert360" className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Active Alerts</p>
                <div className="space-y-2">
                  {data.safety_events?.filter(e => e.visible_to_host && e.is_active).map(ev => (
                    <div key={ev.id} className="flex justify-between rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-foreground">{ev.alert_title || ev.alert_type} <span className="text-muted-foreground font-normal ml-1">x{ev.occurrence_count || 1}</span></p>
                        </div>
                        <p className="text-muted-foreground text-xs">{ev.category} · Last seen: {ev.last_seen_at ? format(new Date(ev.last_seen_at), 'MMM d, h:mm a') : '—'}</p>
                      </div>
                      <SBadge status={ev.status} />
                    </div>
                  ))}
                  {!data.safety_events?.filter(e => e.visible_to_host && e.is_active).length && <p className="text-muted-foreground text-sm">No active alerts.</p>}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Alert Timeline</p>
                <div className="space-y-2 relative border-l-2 border-border ml-2 pl-4">
                  {data.safety_events?.filter(e => e.visible_to_host).sort((a,b) => new Date(b.first_seen_at) - new Date(a.first_seen_at)).map(ev => (
                    <div key={ev.id} className="relative mb-4">
                      <div className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${ev.is_active ? 'bg-red-400' : 'bg-green-400'}`}></div>
                      <p className="font-medium text-sm">{ev.alert_title || ev.alert_type}</p>
                      <p className="text-muted-foreground text-xs">{ev.first_seen_at ? format(new Date(ev.first_seen_at), 'MMM d, yyyy h:mm a') : '—'} · {ev.is_active ? 'Active' : 'Resolved'}</p>
                    </div>
                  ))}
                  {!data.safety_events?.filter(e => e.visible_to_host).length && <p className="text-muted-foreground text-sm -ml-4">No alert history.</p>}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="inspections" className="mt-4 space-y-2">
              {data.inspections?.map(i => (
                <div key={i.id} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div className="flex justify-between"><p className="font-medium">{i.inspection_type?.replace(/_/g,' ')} · by {i.submitted_by_role}</p><SBadge status={i.evidence_status} /></div>
                  <p className="text-muted-foreground text-xs">{i.submitted_at ? format(new Date(i.submitted_at), 'MMM d, yyyy') : '—'}</p>
                </div>
              ))}
              {!data.inspections?.length && <p className="text-muted-foreground text-sm">No inspections found.</p>}
            </TabsContent>

            <TabsContent value="bookings" className="mt-4 space-y-2">
              {data.all_bookings?.slice(0, 20).map(b => (
                <div key={b.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div><p className="font-medium">{b.customer_full_name || b.user_email}</p><p className="text-muted-foreground text-xs">{b.start_date} → {b.end_date || '—'}</p></div>
                  <SBadge status={b.booking_status} />
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}