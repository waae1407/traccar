import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, User, Car, CreditCard, Wifi, MessageSquare, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

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
  const m = { active: 'bg-green-500/20 text-green-400', payment_due: 'bg-yellow-500/20 text-yellow-400', suspended: 'bg-red-500/20 text-red-400', failed: 'bg-red-500/20 text-red-400', Available: 'bg-green-500/20 text-green-400', pending_review: 'bg-blue-500/20 text-blue-400', grace_period: 'bg-orange-500/20 text-orange-400' };
  return <Badge className={m[status] || 'bg-muted text-muted-foreground text-xs'}>{status?.replace(/_/g,' ')}</Badge>;
}

export default function OperationsCenter() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ops_center'],
    queryFn: () => base44.functions.invoke('getOperationsCenterMetrics', {}).then(r => r.data),
    refetchInterval: 120000,
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading Operations Center…</div>;

  const s = data?.summary;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Operations Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Customers · Bookings · Hosts · Vehicles · Alerts · Communications</p>
        </div>
        <button onClick={() => refetch()} className="text-xs text-muted-foreground hover:text-foreground">↻ Refresh</button>
      </div>

      {/* Critical metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Failed Payments" value={s?.bookings_payment_failed || 0} color="text-red-400" alert={s?.bookings_payment_failed > 0} />
        <MetricCard label="In 24h Recovery Window" value={s?.bookings_payment_due || 0} color="text-yellow-400" sub="payment_due — grace active" />
        <MetricCard label="Suspended After Grace" value={s?.bookings_suspended || 0} color="text-red-400" alert={s?.bookings_suspended > 0} sub="grace expired" />
        <MetricCard label="Starter Disabled" value={s?.starter_disabled_count || 0} color="text-red-400" alert={s?.starter_disabled_count > 0} />
        <MetricCard label="Starter Disable Pending" value={data?.bookings?.payment_due?.filter(b => b.starter_disable_pending)?.length || 0} color="text-orange-400" alert={(data?.bookings?.payment_due?.filter(b => b.starter_disable_pending)?.length || 0) > 0} sub="vehicle may be running" />
        <MetricCard label="GPS Offline" value={s?.gps_offline_count || 0} color={s?.gps_offline_count > 0 ? 'text-red-400' : ''} />
        <MetricCard label="Open Payment Alerts" value={s?.open_payment_alerts || 0} color={s?.open_payment_alerts > 0 ? 'text-red-400' : ''} />
        <MetricCard label="Unread Messages" value={s?.unread_comms || 0} color={s?.unread_comms > 0 ? 'text-primary' : ''} />
      </div>

      <Tabs defaultValue="bookings">
        <TabsList className="flex-wrap h-auto gap-1">
          {[['bookings','Bookings'],['customers','Customers'],['hosts','Hosts'],['vehicles','Vehicles'],['alerts','Alerts'],['communications','Comms']].map(([v,l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="bookings" className="mt-4">
          <div className="grid grid-cols-5 gap-3 mb-4">
            <MetricCard label="Active" value={s?.bookings_active || 0} color="text-green-400" />
            <MetricCard label="Failed Payment" value={s?.bookings_payment_failed || 0} color="text-red-400" />
            <MetricCard label="Payment Due" value={s?.bookings_payment_due || 0} color="text-yellow-400" />
            <MetricCard label="Grace Period" value={s?.bookings_grace_period || 0} color="text-orange-400" />
            <MetricCard label="Pending Review" value={s?.bookings_pending_review || 0} color="text-blue-400" />
          </div>
          <div className="space-y-2">
            {[...(data?.bookings?.failed_payment || []), ...(data?.bookings?.suspended || []), ...(data?.bookings?.payment_due || [])].slice(0, 20).map(b => {
              const deadline = b.starter_disable_scheduled_at ? new Date(b.starter_disable_scheduled_at) : null;
              const hoursLeft = deadline ? Math.max(0, (deadline.getTime() - Date.now()) / (1000 * 60 * 60)) : null;
              const isUrgent = hoursLeft !== null && hoursLeft <= 4;
              const isCritical = hoursLeft !== null && hoursLeft <= 8;
              return (
                <div key={b.id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isUrgent ? 'bg-red-500/15 border border-red-500/30' : isCritical ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-secondary/30'}`}>
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="font-medium truncate">{b.customer_full_name || b.user_email}</p>
                    <p className="text-muted-foreground text-xs">{b.vehicle_name || '—'} · ${b.weekly_rate || 0}/wk · Attempts: {b.payment_failure_attempts || 0}</p>
                    {deadline && hoursLeft !== null && b.booking_status === 'payment_due' && (
                      <p className={`text-xs font-semibold mt-0.5 ${isUrgent ? 'text-red-400' : isCritical ? 'text-orange-400' : 'text-yellow-400'}`}>
                        {hoursLeft < 1 ? '⚡ Expires in <1h' : `⏱ Grace expires in ~${Math.round(hoursLeft)}h`}
                      </p>
                    )}
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {(b.starter_disabled || b.moovetrax_kill_active) && <Badge className="bg-red-500/20 text-red-400 text-xs">⚡ Starter Off</Badge>}
                      {b.starter_disable_pending && <Badge className="bg-orange-500/20 text-orange-400 text-xs">⏳ Disable Pending</Badge>}
                      {b.final_reminder_sent && <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Final Reminder Sent</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <SBadge status={b.booking_status} />
                    <SBadge status={b.payment_status} />
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="customers" className="mt-4">
          <div className="mb-3">
            <p className="text-sm text-muted-foreground">{s?.customers_needing_attention || 0} customer(s) needing attention</p>
          </div>
          <div className="space-y-2">
            {data?.customers?.needing_attention?.map(email => (
              <div key={email} className="flex items-center justify-between rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-sm">
                <p>{email}</p>
                <div className="flex gap-2">
                  <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Needs Attention</Badge>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <p className="text-sm font-semibold mb-2">Starter Disabled</p>
            {data?.customers?.starter_disabled?.map(c => (
              <div key={c.booking_id} className="flex justify-between rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm mb-1">
                <div><p>{c.email}</p><p className="text-xs text-muted-foreground">Booking: {c.booking_id?.slice(-8)}</p></div>
                <Badge className="bg-red-500/20 text-red-400 text-xs">⚡ Starter Off</Badge>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="hosts" className="mt-4 space-y-2">
          {data?.hosts?.with_blockers?.map(h => (
            <div key={h.id} className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-sm">
              <div className="flex justify-between items-center">
                <div><p className="font-medium">{h.full_name}</p><p className="text-muted-foreground text-xs">{h.email}</p></div>
                <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Setup Blocked</Badge>
              </div>
              <div className="flex gap-2 mt-1 flex-wrap">
                {!h.stripe_onboarding_complete && <Badge className="bg-red-500/20 text-red-400 text-xs">No Stripe</Badge>}
                {h.verification_status !== 'verified' && <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">ID Unverified</Badge>}
                {h.status !== 'approved' && <Badge className="bg-red-500/20 text-red-400 text-xs">Not Approved</Badge>}
              </div>
            </div>
          ))}
          {!data?.hosts?.with_blockers?.length && <p className="text-muted-foreground text-sm">No host setup blockers.</p>}
        </TabsContent>

        <TabsContent value="vehicles" className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard label="Suspended/Offline" value={s?.vehicles_suspended || 0} color="text-red-400" />
            <MetricCard label="Not Earning" value={s?.vehicles_not_earning || 0} color="text-yellow-400" />
            <MetricCard label="Marketplace Listed" value={s?.marketplace_listed || 0} color="text-green-400" />
            <MetricCard label="Storefront Listed" value={s?.storefront_listed || 0} color="text-blue-400" />
            <MetricCard label="Marketplace Hidden" value={s?.marketplace_hidden || 0} color={s?.marketplace_hidden > 0 ? 'text-yellow-400' : ''} />
            <MetricCard label="Storefront Hidden" value={s?.storefront_hidden || 0} />
            <MetricCard label="Pending Mkt Approval" value={s?.pending_marketplace_approval || 0} color={s?.pending_marketplace_approval > 0 ? 'text-orange-400' : ''} alert={s?.pending_marketplace_approval > 0} />
            <MetricCard label="Blocked by Plan (FleetOS)" value={s?.marketplace_blocked_by_plan || 0} color="text-muted-foreground" />
            <MetricCard label="Not Listed Anywhere" value={s?.not_listed_anywhere || 0} color={s?.not_listed_anywhere > 0 ? 'text-red-400' : ''} />
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
                <div><p className="font-medium">{v.year} {v.make} {v.model}</p><p className="text-muted-foreground text-xs">${v.weekly_rate || 0}/wk listed</p></div>
                <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Not Earning</Badge>
              </div>
            ))}
            {data?.vehicles?.pending_marketplace_approval?.map(v => (
              <div key={v.id} className="flex justify-between rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2 text-sm">
                <div><p className="font-medium">{v.year} {v.make} {v.model}</p><p className="text-muted-foreground text-xs">Host: {v.host_id?.slice(-8)} · Awaiting marketplace approval</p></div>
                <Badge className="bg-orange-500/20 text-orange-400 text-xs">Mkt Pending</Badge>
              </div>
            ))}
            {data?.vehicles?.not_listed_anywhere?.map(v => (
              <div key={v.id} className="flex justify-between rounded-lg bg-muted/30 border border-border px-3 py-2 text-sm">
                <div><p className="font-medium">{v.year} {v.make} {v.model}</p><p className="text-muted-foreground text-xs">Hidden from storefront and marketplace</p></div>
                <Badge className="bg-muted text-muted-foreground text-xs">Not Listed</Badge>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4 space-y-2">
          {data?.alerts?.payment_alerts?.map(a => (
            <div key={a.id} className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
              <div className="flex justify-between items-center"><p className="font-medium">{a.title}</p><Badge className="bg-red-500/20 text-red-400 text-xs">{a.severity}</Badge></div>
              <p className="text-muted-foreground text-xs mt-1">{a.message}</p>
            </div>
          ))}
          {data?.alerts?.operational_alerts?.map(a => (
            <div key={a.id} className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-sm">
              <div className="flex justify-between items-center"><p className="font-medium">{a.title}</p><Badge className="bg-yellow-500/20 text-yellow-400 text-xs">{a.domain}</Badge></div>
              <p className="text-muted-foreground text-xs mt-1">{a.message}</p>
            </div>
          ))}
          {!data?.alerts?.payment_alerts?.length && !data?.alerts?.operational_alerts?.length && <p className="text-muted-foreground text-sm">No open alerts.</p>}
        </TabsContent>

        <TabsContent value="communications" className="mt-4 space-y-2">
          {data?.communications?.unread?.map(t => (
            <div key={t.id} className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-sm">
              <div className="flex justify-between items-center">
                <p className="font-medium">{t.subject}</p>
                <div className="flex gap-1">
                  {t.unread_count_admin > 0 && <Badge className="bg-primary/20 text-primary text-xs">{t.unread_count_admin} unread</Badge>}
                  {t.escalation_flag && <Badge className="bg-red-500/20 text-red-400 text-xs">Escalated</Badge>}
                </div>
              </div>
              <p className="text-muted-foreground text-xs">{t.thread_type?.replace(/_/g,' ')}</p>
            </div>
          ))}
          {!data?.communications?.unread?.length && <p className="text-muted-foreground text-sm">No unread communications.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}