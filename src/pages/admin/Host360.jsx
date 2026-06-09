import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, DollarSign, Car, Users, Settings, Wifi } from 'lucide-react';

function SBadge({ status }) {
  const map = { approved: 'bg-green-500/20 text-green-400', active: 'bg-green-500/20 text-green-400', trialing: 'bg-blue-500/20 text-blue-400', live: 'bg-green-500/20 text-green-400', pending: 'bg-yellow-500/20 text-yellow-400', suspended: 'bg-red-500/20 text-red-400', verified: 'bg-green-500/20 text-green-400', failed: 'bg-red-500/20 text-red-400', paid: 'bg-green-500/20 text-green-400', held: 'bg-yellow-500/20 text-yellow-400' };
  return <Badge className={map[status] || 'bg-muted text-muted-foreground text-xs'}>{status?.replace(/_/g, ' ')}</Badge>;
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

export default function Host360() {
  const [selectedHostId, setSelectedHostId] = useState('');
  const [loadedHostId, setLoadedHostId] = useState('');

  const { data: allHosts } = useQuery({ queryKey: ['hosts_list'], queryFn: () => base44.entities.Host.list('-created_date', 200) });

  const { data, isLoading } = useQuery({
    queryKey: ['host360', loadedHostId],
    queryFn: () => base44.functions.invoke('getHost360', { host_id: loadedHostId }).then(r => r.data),
    enabled: !!loadedHostId,
  });

  const h = data?.host;
  const rev = data?.revenue;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Host 360</h1>
        <p className="text-muted-foreground text-sm mt-1">Complete host view — plan, fleet, revenue, payouts, compliance, telematics</p>
      </div>
      <div className="flex gap-3">
        <Select value={selectedHostId} onValueChange={setSelectedHostId}>
          <SelectTrigger className="w-80"><SelectValue placeholder="Select a host..." /></SelectTrigger>
          <SelectContent>{allHosts?.map(h => <SelectItem key={h.id} value={h.id}>{h.full_name} — {h.email}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={() => setLoadedHostId(selectedHostId)} disabled={!selectedHostId || isLoading}>{isLoading ? 'Loading…' : 'Load Host'}</Button>
      </div>

      {data?.warnings?.map((w, i) => <Alert key={i} className="border-yellow-500/30 bg-yellow-500/10 py-2"><AlertTriangle className="h-3 w-3 text-yellow-400" /><AlertDescription className="text-yellow-300 text-xs">{w}</AlertDescription></Alert>)}

      {h && (
        <div className="space-y-4">
          {/* Header */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-card border-border md:col-span-2">
              <CardContent className="pt-4 space-y-2 text-sm">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">{h.full_name?.[0]}</div>
                  <div><p className="font-semibold">{h.full_name}</p><p className="text-muted-foreground text-xs">{h.email}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-muted-foreground text-xs">Status</p><SBadge status={h.status} /></div>
                  <div><p className="text-muted-foreground text-xs">Type</p><p>{h.host_type}</p></div>
                  <div><p className="text-muted-foreground text-xs">Plan Mode</p><Badge className="bg-purple-500/20 text-purple-400">{data.plan_mode}</Badge></div>
                  <div><p className="text-muted-foreground text-xs">Subscription</p><SBadge status={data.subscription?.status} /></div>
                  <div><p className="text-muted-foreground text-xs">Stripe Connect</p><SBadge status={h.stripe_onboarding_complete ? 'verified' : 'pending'} /></div>
                  <div><p className="text-muted-foreground text-xs">ID Verification</p><SBadge status={h.verification_status} /></div>
                </div>
              </CardContent>
            </Card>
            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <MetricCard label="Gross Revenue" value={`$${(rev?.gross_revenue || 0).toLocaleString()}`} sub="From PaymentLog (paid)" color="text-green-400" />
              <MetricCard label="Net Host Paid Out" value={`$${(rev?.net_paid_out || 0).toLocaleString()}`} sub="From HostPayout" />
              <MetricCard label="Platform Fees" value={`$${(rev?.platform_fees || 0).toLocaleString()}`} sub="uRide commission" color="text-primary" />
              <MetricCard label="Subscription MRR" value={`$${(data?.subscription_mrr || 0).toFixed(2)}`} sub={data?.is_trialing ? '⚠ Trialing — no cash' : 'Monthly'} color={data?.is_trialing ? 'text-yellow-400' : ''} />
            </div>
          </div>

          <Tabs defaultValue="fleet">
            <TabsList className="flex-wrap h-auto gap-1">
              {[['fleet','Fleet'],['bookings','Bookings'],['payouts','Payouts'],['expenses','Expenses'],['compliance','Compliance'],['telematics','Telematics'],['alerts','Alerts']].map(([v,l]) => (
                <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="fleet" className="mt-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <MetricCard label="Total Vehicles" value={data.vehicles?.total || 0} />
                <MetricCard label="Live" value={data.vehicles?.live?.length || 0} color="text-green-400" />
                <MetricCard label="Offline/Suspended" value={data.vehicles?.offline?.length || 0} color="text-red-400" />
              </div>
              <div className="space-y-2">
                {data.vehicles?.all?.map(v => (
                  <div key={v.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                    <div><p className="font-medium">{v.year} {v.make} {v.model}</p><p className="text-muted-foreground text-xs">{v.vin || '—'} · ${v.weekly_rate || 0}/wk</p></div>
                    <SBadge status={v.status} />
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="bookings" className="mt-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <MetricCard label="Total Bookings" value={data.bookings?.all || 0} />
                <MetricCard label="Active" value={data.bookings?.active || 0} color="text-green-400" />
                <MetricCard label="Failed Payment" value={data.bookings?.failed_payment || 0} color="text-red-400" />
              </div>
            </TabsContent>

            <TabsContent value="payouts" className="mt-4 space-y-2">
              {data.payouts?.pending?.length > 0 && <p className="text-yellow-400 text-xs">⚠ {data.payouts.pending.length} pending payout(s)</p>}
              {data.payouts?.held?.length > 0 && <p className="text-red-400 text-xs">🔒 {data.payouts.held.length} held payout(s)</p>}
              {data.payouts?.all?.slice(0, 20).map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div><p className="font-medium">Net: ${(p.net_host_payout || p.net_payout || 0).toFixed(2)} · Gross: ${(p.gross_booking_amount || 0).toFixed(2)}</p><p className="text-muted-foreground text-xs">Transfer: {p.stripe_transfer_id || '—'}</p></div>
                  <SBadge status={p.status} />
                </div>
              ))}
            </TabsContent>

            <TabsContent value="expenses" className="mt-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <MetricCard label="Total Expenses" value={`$${(data.expenses?.total || 0).toLocaleString()}`} />
                <MetricCard label="Expense Records" value={data.expenses?.all?.length || 0} />
                <MetricCard label="Recurring" value={data.expenses?.recurring?.length || 0} />
              </div>
            </TabsContent>

            <TabsContent value="compliance" className="mt-4 space-y-2">
              {data.compliance?.expired?.map(d => <div key={d.id} className="flex justify-between rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm"><div><p className="font-medium">{d.doc_type?.replace(/_/g,' ')} — {d.vehicle_name}</p><p className="text-xs text-muted-foreground">Expired: {d.expiry_date}</p></div><SBadge status="failed" /></div>)}
              {data.compliance?.expiring?.map(d => <div key={d.id} className="flex justify-between rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-sm"><div><p className="font-medium">{d.doc_type?.replace(/_/g,' ')} — {d.vehicle_name}</p><p className="text-xs text-muted-foreground">Expires: {d.expiry_date}</p></div><SBadge status="pending" /></div>)}
              {!data.compliance?.expired?.length && !data.compliance?.expiring?.length && <p className="text-muted-foreground text-sm">No compliance issues found.</p>}
            </TabsContent>

            <TabsContent value="telematics" className="mt-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <MetricCard label="GPS Online" value={data.telematics?.gps_online || 0} color="text-green-400" />
                <MetricCard label="GPS Offline" value={data.telematics?.gps_offline || 0} color="text-red-400" />
                <MetricCard label="Unknown" value={data.telematics?.gps_unknown || 0} />
              </div>
              {data.telematics?.devices?.map(d => (
                <div key={d.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm mb-2">
                  <div><p className="font-medium">{d.unique_id}</p><p className="text-muted-foreground text-xs">{d.provider_key} · {d.last_seen_at?.slice(0, 10) || 'never seen'}</p></div>
                  <SBadge status={d.online_status} />
                </div>
              ))}
            </TabsContent>

            <TabsContent value="alerts" className="mt-4 space-y-2">
              {data.alerts?.map(a => <div key={a.id} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm"><div className="flex justify-between"><p className="font-medium">{a.title}</p><Badge className={a.severity === 'critical' ? 'bg-red-500/20 text-red-400 text-xs' : 'bg-yellow-500/20 text-yellow-400 text-xs'}>{a.severity}</Badge></div><p className="text-muted-foreground text-xs mt-1">{a.message}</p></div>)}
              {!data.alerts?.length && <p className="text-muted-foreground text-sm">No alerts.</p>}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}