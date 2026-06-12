import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';

function MetricCard({ label, value, sub, color, alert }) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? 'border-red-500/30 bg-red-500/10' : 'border-border bg-secondary/40'}`}>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || ''}`}>{value}</p>
      {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function SBadge({ status }) {
  const m = { active: 'bg-green-500/20 text-green-400', payment_due: 'bg-yellow-500/20 text-yellow-400', suspended: 'bg-red-500/20 text-red-400', failed: 'bg-red-500/20 text-red-400', Available: 'bg-green-500/20 text-green-400', grace_period: 'bg-orange-500/20 text-orange-400' };
  return <Badge className={m[status] || 'bg-muted text-muted-foreground text-xs'}>{status?.replace(/_/g,' ')}</Badge>;
}

export default function HostOperationsCenter() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['host_ops_center'],
    queryFn: () => base44.functions.invoke('getOperationsCenterMetrics', {}).then(r => r.data),
    refetchInterval: 120000,
  });

  if (isLoading) return <div className="p-8 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading operations…</div>;

  const s = data?.summary;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Operations Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Your customers · Bookings · Vehicles · Compliance · Alerts</p>
        </div>
        <button onClick={() => refetch()} className="text-xs text-muted-foreground hover:text-foreground">↻ Refresh</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Failed Payments" value={s?.bookings_payment_failed || 0} color="text-red-400" alert={s?.bookings_payment_failed > 0} />
        <MetricCard label="In Recovery Window" value={s?.bookings_payment_due || 0} color="text-yellow-400" />
        <MetricCard label="Suspended" value={s?.bookings_suspended || 0} color="text-red-400" alert={s?.bookings_suspended > 0} />
        <MetricCard label="GPS Offline" value={s?.gps_offline_count || 0} color={s?.gps_offline_count > 0 ? 'text-red-400' : ''} />
      </div>

      <Tabs defaultValue="bookings">
        <TabsList className="flex-wrap h-auto gap-1">
          {[['bookings','Bookings'],['customers','Customers'],['vehicles','Vehicles'],['alerts','Alerts']].map(([v,l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="bookings" className="mt-4">
          <div className="grid grid-cols-4 gap-3 mb-4">
            <MetricCard label="Active" value={s?.bookings_active || 0} color="text-green-400" />
            <MetricCard label="Failed Payment" value={s?.bookings_payment_failed || 0} color="text-red-400" />
            <MetricCard label="Grace Period" value={s?.bookings_grace_period || 0} color="text-orange-400" />
            <MetricCard label="Pending Review" value={s?.bookings_pending_review || 0} color="text-blue-400" />
          </div>
          <div className="space-y-2">
            {[...(data?.bookings?.failed_payment || []), ...(data?.bookings?.suspended || []), ...(data?.bookings?.payment_due || [])].slice(0, 20).map(b => (
              <div key={b.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{b.customer_full_name || b.user_email}</p>
                  <p className="text-muted-foreground text-xs">{b.vehicle_name || '—'} · ${b.weekly_rate || 0}/wk</p>
                  {(b.starter_disabled || b.moovetrax_kill_active) && <Badge className="bg-red-500/20 text-red-400 text-xs">⚡ Vehicle access restricted</Badge>}
                </div>
                <div className="flex flex-col items-end gap-1"><SBadge status={b.booking_status} /><SBadge status={b.payment_status} /></div>
              </div>
            ))}
            {![...(data?.bookings?.failed_payment || []), ...(data?.bookings?.suspended || []), ...(data?.bookings?.payment_due || [])].length && <p className="text-muted-foreground text-sm">No issues found. All bookings are healthy.</p>}
          </div>
        </TabsContent>

        <TabsContent value="customers" className="mt-4">
          <p className="text-sm text-muted-foreground mb-3">{s?.customers_needing_attention || 0} customer(s) needing attention</p>
          <div className="space-y-2">
            {data?.customers?.needing_attention?.map(email => (
              <div key={email} className="flex items-center justify-between rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-sm">
                <p>{email}</p>
                <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Needs Attention</Badge>
              </div>
            ))}
            {!data?.customers?.needing_attention?.length && <p className="text-muted-foreground text-sm">No customers needing attention.</p>}
          </div>
        </TabsContent>

        <TabsContent value="vehicles" className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard label="Suspended" value={s?.vehicles_suspended || 0} color="text-red-400" />
            <MetricCard label="Not Earning" value={s?.vehicles_not_earning || 0} color="text-yellow-400" />
            <MetricCard label="Marketplace Listed" value={s?.marketplace_listed || 0} color="text-green-400" />
            <MetricCard label="Storefront Listed" value={s?.storefront_listed || 0} color="text-blue-400" />
          </div>
          <div className="space-y-2">
            {data?.vehicles?.suspended?.map(v => (
              <div key={v.id} className="flex justify-between rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
                <div><p className="font-medium">{v.year} {v.make} {v.model}</p><p className="text-muted-foreground text-xs">{v.vin || '—'}</p></div>
                <Badge className="bg-red-500/20 text-red-400 text-xs">{v.status}</Badge>
              </div>
            ))}
            {data?.vehicles?.not_earning?.map(v => (
              <div key={v.id} className="flex justify-between rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-sm">
                <div><p className="font-medium">{v.year} {v.make} {v.model}</p><p className="text-muted-foreground text-xs">Available but not rented</p></div>
                <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Not Earning</Badge>
              </div>
            ))}
            {!data?.vehicles?.suspended?.length && !data?.vehicles?.not_earning?.length && <p className="text-muted-foreground text-sm">All vehicles are performing well.</p>}
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4 space-y-2">
          {data?.alerts?.payment_alerts?.map(a => (
            <div key={a.id} className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
              <div className="flex justify-between items-center"><p className="font-medium">{a.title}</p><Badge className="bg-red-500/20 text-red-400 text-xs">{a.severity}</Badge></div>
              <p className="text-muted-foreground text-xs mt-1">{a.message}</p>
            </div>
          ))}
          {!data?.alerts?.payment_alerts?.length && <p className="text-muted-foreground text-sm">No open alerts.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}