import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { formatPaymentSource, formatPaymentReference, sanitizeInternalText } from '@/lib/displayFormatters';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, DollarSign, TrendingUp, CreditCard, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
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
  const m = { paid: 'bg-green-500/20 text-green-400', active: 'bg-green-500/20 text-green-400', failed: 'bg-red-500/20 text-red-400', held: 'bg-yellow-500/20 text-yellow-400', pending: 'bg-blue-500/20 text-blue-400', trialing: 'bg-blue-500/20 text-blue-400', past_due: 'bg-red-500/20 text-red-400', cancelled: 'bg-muted text-muted-foreground' };
  return <Badge className={m[status] || 'bg-muted text-muted-foreground text-xs'}>{status?.replace(/_/g, ' ')}</Badge>;
}

export default function FinancialCenter() {
  const { data, isLoading } = useQuery({
    queryKey: ['financial_center'],
    queryFn: () => base44.functions.invoke('getFinancialCenterMetrics', {}).then(r => r.data),
    refetchInterval: 300000,
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading Financial Center…</div>;

  const s = data?.summary;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Financial Center</h1>
        <p className="text-muted-foreground text-sm mt-1">Revenue · Payments · Payouts · Subscriptions · Collections · Chargebacks</p>
      </div>

      {data?.warnings?.map((w, i) => (
        <Alert key={i} className="border-yellow-500/30 bg-yellow-500/10 py-2">
          <AlertTriangle className="h-3 w-3 text-yellow-400" />
          <AlertDescription className="text-yellow-300 text-xs">{w}</AlertDescription>
        </Alert>
      ))}

      {/* Top metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="GMV (Collected)" value={`$${(s?.gmv || 0).toLocaleString()}`} sub="Paid payment records only" color="text-green-400" />
        <MetricCard label="Platform Commission" value={`$${(s?.platform_commission || 0).toLocaleString()}`} sub="Platform fees from payouts" color="text-primary" />
        <MetricCard label="Net Host Paid Out" value={`$${(s?.net_host_paid_out || 0).toLocaleString()}`} sub="Net host payout total" />
        <MetricCard label="Active MRR" value={`$${(s?.active_mrr || 0).toFixed(2)}`} sub={s?.trialing_projected_mrr > 0 ? `+$${s.trialing_projected_mrr.toFixed(2)} projected (trialing)` : 'Active subscriptions only'} />
        <MetricCard label="Amount at Risk" value={`$${(s?.amount_at_risk || 0).toFixed(2)}`} sub={`${s?.failed_payment_booking_count || 0} bookings`} color={s?.amount_at_risk > 0 ? 'text-red-400' : ''} warning={s?.amount_at_risk > 0} />
        <MetricCard label="Chargeback Exposure" value={`$${(s?.chargeback_exposure || 0).toFixed(2)}`} color={s?.chargeback_exposure > 0 ? 'text-red-400' : ''} warning={s?.chargeback_exposure > 0} />
        <MetricCard label="Processing Fees" value={`$${(s?.stripe_fees || 0).toFixed(2)}`} sub="From payout records" />
        <MetricCard label="Vehicle Access Restricted" value={s?.starter_disabled_count || 0} sub="Active payment enforcement" color={s?.starter_disabled_count > 0 ? 'text-red-400' : ''} />
      </div>

      {s?.fleetos_direct_revenue > 0 && (
        <Alert className="border-blue-500/30 bg-blue-500/10 py-2">
          <AlertDescription className="text-blue-300 text-xs">ℹ Direct host payment revenue detected (${s.fleetos_direct_revenue.toFixed(2)}) — these payments flow through the host's own payment processor, not uRide platform funds. They are excluded from commission calculations.</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto gap-1">
          {[['overview','Overview'],['revenue','Revenue'],['payments','Payments'],['failed','Failed Payments'],['payouts','Payouts'],['subscriptions','Subscriptions'],['collections','Collections'],['chargebacks','Chargebacks']].map(([v,l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm">Revenue Breakdown</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Marketplace commission (8%)</span><span>${(s?.marketplace_commission || 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Hybrid commission (4%)</span><span>${(s?.hybrid_commission || 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total platform fees</span><span className="text-primary font-semibold">${(s?.platform_commission || 0).toFixed(2)}</span></div>
                <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Active MRR</span><span>${(s?.active_mrr || 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Trialing projected MRR</span><span className="text-yellow-400">${(s?.trialing_projected_mrr || 0).toFixed(2)}</span></div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm">Collections Risk</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Failed payments</span><span className="text-red-400">{data?.collections?.failed_payment_bookings?.filter(b => b.payment_status === 'failed').length || 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Payment due</span><span className="text-yellow-400">{data?.collections?.failed_payment_bookings?.filter(b => b.booking_status === 'payment_due').length || 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Suspended</span><span className="text-red-400">{data?.collections?.failed_payment_bookings?.filter(b => b.booking_status === 'suspended').length || 0}</span></div>
                <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Total amount at risk</span><span className="text-red-400 font-semibold">${(s?.amount_at_risk || 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Open receivables</span><span className="text-red-400">${(s?.open_receivable_amount || 0).toFixed(2)}</span></div>
              </CardContent>
            </Card>
          </div>
          <div className="mt-3 rounded-lg bg-secondary/20 p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">Calculation Notes</p>
            {data?.calculation_notes?.map((n, i) => <p key={i}>• {n}</p>)}
          </div>
        </TabsContent>

        <TabsContent value="revenue" className="mt-4 space-y-2">
          {data?.revenue?.payment_logs?.filter(p => p.status === 'paid').slice(0, 50).map(p => (
            <div key={p.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                <div>
                  <p className="font-medium">${(p.amount || 0).toFixed(2)} · Week {p.week_number} · {p.customer_name || p.customer_email}</p>
                  <p className="text-muted-foreground text-xs">{p.paid_at ? format(new Date(p.paid_at), 'MMM d, yyyy') : '—'} · {formatPaymentSource(p.source_type)}</p>
                  {!p.stripe_payment_intent_id && p.payment_method === 'stripe' && <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">No payment reference on file</Badge>}
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">{p.host_id?.slice(-6)}</div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MetricCard label="Paid" value={data?.revenue?.paid_payment_count || 0} color="text-green-400" />
            <MetricCard label="Failed" value={data?.revenue?.failed_payment_count || 0} color="text-red-400" />
            <MetricCard label="Total GMV" value={`$${(s?.gmv || 0).toLocaleString()}`} color="text-green-400" />
          </div>
          {data?.revenue?.payment_logs?.slice(0, 50).map(p => (
            <div key={p.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm mb-1">
              <div className="flex items-center gap-2">
                {p.status === 'paid' ? <CheckCircle className="h-4 w-4 text-green-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                <div><p className="font-medium">${(p.amount || 0).toFixed(2)} · {p.customer_email}</p><p className="text-muted-foreground text-xs">{p.vehicle_name || '—'} · {p.paid_at ? format(new Date(p.paid_at), 'MMM d') : '—'}</p></div>
              </div>
              <SBadge status={p.status} />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="failed" className="mt-4 space-y-2">
          {data?.collections?.failed_payment_bookings?.map(b => (
            <div key={b.id} className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
              <div className="flex justify-between items-center">
                <div><p className="font-medium">{b.customer_full_name || b.user_email}</p><p className="text-muted-foreground text-xs">{b.vehicle_name || '—'} · ${b.weekly_rate || 0}/wk</p></div>
                <div className="text-right"><SBadge status={b.booking_status} /><p className="text-xs text-muted-foreground mt-0.5">Attempts: {b.payment_failure_attempts || 0}</p></div>
              </div>
              {(b.starter_disabled || b.moovetrax_kill_active) && <Badge className="bg-red-500/20 text-red-400 text-xs mt-1">⚡ Vehicle access restricted</Badge>}
            </div>
          ))}
          {!data?.collections?.failed_payment_bookings?.length && <p className="text-muted-foreground text-sm">No failed payment bookings.</p>}
        </TabsContent>

        <TabsContent value="payouts" className="mt-4 space-y-2">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MetricCard label="Pending" value={data?.payouts?.pending?.length || 0} color="text-yellow-400" />
            <MetricCard label="Held" value={data?.payouts?.held?.length || 0} color="text-red-400" />
            <MetricCard label="Failed" value={data?.payouts?.failed?.length || 0} color="text-red-400" />
          </div>
          {data?.payouts?.all_payouts?.slice(0, 30).map(p => (
            <div key={p.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{p.host_name} — Net: <span className="text-green-400">${(p.net_host_payout || p.net_payout || 0).toFixed(2)}</span></p>
                <p className="text-muted-foreground text-xs">Gross: ${(p.gross_booking_amount || 0).toFixed(2)} · Platform fee: ${(p.uride_platform_fee_amount || 0).toFixed(2)} · Ref: {p.stripe_transfer_id ? formatPaymentReference(p.stripe_transfer_id, 'admin') : '—'}</p>
                {p._synthesized && <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Estimated / Not Created</Badge>}
              </div>
              <SBadge status={p.status} />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-4 space-y-2">
          <div className="grid grid-cols-4 gap-3 mb-4">
            <MetricCard label="Active" value={data?.subscriptions?.active?.length || 0} color="text-green-400" />
            <MetricCard label="Trialing" value={data?.subscriptions?.trialing?.length || 0} color="text-blue-400" sub="No cash" />
            <MetricCard label="Past Due" value={data?.subscriptions?.past_due?.length || 0} color="text-red-400" />
            <MetricCard label="Cancelled" value={data?.subscriptions?.cancelled?.length || 0} />
          </div>
          {[...(data?.subscriptions?.active || []), ...(data?.subscriptions?.trialing || [])].map(s => (
            <div key={s.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div><p className="font-medium">{s.plan_mode?.replace(/_/g,' ')} — {s.host_id?.slice(-8)}</p><p className="text-muted-foreground text-xs">${(s.monthly_amount || 0).toFixed(2)}/mo · Ref: {s.stripe_subscription_id ? formatPaymentReference(s.stripe_subscription_id, 'admin') : '—'}</p></div>
              <SBadge status={s.status} />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="collections" className="mt-4 space-y-2">
          {data?.collections?.alerts?.map(a => (
            <div key={a.id} className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
              <div className="flex justify-between items-center"><p className="font-medium">{a.title}</p><Badge className="bg-red-500/20 text-red-400 text-xs">{a.severity}</Badge></div>
              <p className="text-muted-foreground text-xs mt-1">{a.message}</p>
              {a.financial_impact_amount > 0 && <p className="text-red-400 text-xs mt-1">Impact: ${a.financial_impact_amount.toFixed(2)}</p>}
            </div>
          ))}
          {!data?.collections?.alerts?.length && <p className="text-muted-foreground text-sm">No open collection alerts.</p>}
        </TabsContent>

        <TabsContent value="chargebacks" className="mt-4 space-y-2">
          <MetricCard label="Chargeback Exposure" value={`$${(s?.chargeback_exposure || 0).toFixed(2)}`} color="text-red-400" warning={s?.chargeback_exposure > 0} />
          <div className="mt-3 space-y-2">
            {data?.chargebacks?.open_disputes?.map(d => (
              <div key={d.id} className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
                <div className="flex justify-between"><p className="font-medium">{d.dispute_type?.replace(/_/g,' ')}</p><SBadge status={d.status} /></div>
                {d.stripe_dispute_amount && <p className="text-red-400 text-xs">Dispute: ${d.stripe_dispute_amount.toFixed(2)}</p>}
                {d.due_by && <p className="text-muted-foreground text-xs">Due: {format(new Date(d.due_by), 'MMM d, yyyy')}</p>}
              </div>
            ))}
            {!data?.chargebacks?.open_disputes?.length && <p className="text-muted-foreground text-sm">No open disputes.</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}