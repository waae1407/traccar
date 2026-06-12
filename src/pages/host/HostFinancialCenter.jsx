import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { formatPaymentSource } from '@/lib/displayFormatters';
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
  const m = { paid: 'bg-green-500/20 text-green-400', active: 'bg-green-500/20 text-green-400', failed: 'bg-red-500/20 text-red-400', held: 'bg-yellow-500/20 text-yellow-400', pending: 'bg-blue-500/20 text-blue-400' };
  return <Badge className={m[status] || 'bg-muted text-muted-foreground text-xs'}>{status?.replace(/_/g, ' ')}</Badge>;
}

export default function HostFinancialCenter() {
  const { data, isLoading } = useQuery({
    queryKey: ['host_financial_center'],
    queryFn: () => base44.functions.invoke('getFinancialCenterMetrics', {}).then(r => r.data),
    refetchInterval: 300000,
  });

  if (isLoading) return <div className="p-8 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading your financials…</div>;

  const s = data?.summary;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Financial Center</h1>
        <p className="text-muted-foreground text-sm mt-1">Your revenue · Payments · Payouts · Collections</p>
      </div>

      {data?.warnings?.filter(w => !w.includes('FleetOS') && !w.includes('MRR') && !w.includes('trialing')).map((w, i) => (
        <Alert key={i} className="border-yellow-500/30 bg-yellow-500/10 py-2">
          <AlertTriangle className="h-3 w-3 text-yellow-400" />
          <AlertDescription className="text-yellow-300 text-xs">{w}</AlertDescription>
        </Alert>
      ))}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Revenue" value={`$${(s?.gmv || 0).toLocaleString()}`} sub="Collected payments" color="text-green-400" />
        <MetricCard label="Platform Fees" value={`$${(s?.platform_commission || 0).toLocaleString()}`} sub="uRide commission" color="text-primary" />
        <MetricCard label="Net Paid Out" value={`$${(s?.net_host_paid_out || 0).toLocaleString()}`} sub="Transferred to you" />
        <MetricCard label="Amount at Risk" value={`$${(s?.amount_at_risk || 0).toFixed(2)}`} sub={`${s?.failed_payment_booking_count || 0} bookings`} color={s?.amount_at_risk > 0 ? 'text-red-400' : ''} warning={s?.amount_at_risk > 0} />
      </div>

      {(s?.manual_payments_collected > 0 || s?.manual_fees_due > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Manual Payments" value={`$${(s?.manual_payments_collected || 0).toLocaleString()}`} sub="Zelle / Cash / etc." color="text-blue-400" />
          <MetricCard label="Platform Fees Due" value={`$${(s?.manual_fees_due || 0).toFixed(2)}`} sub="Owed to uRide" color={s?.manual_fees_due > 0 ? 'text-yellow-400' : ''} warning={s?.manual_fees_due > 0} />
          <MetricCard label="Fees Paid" value={`$${(s?.manual_fees_paid || 0).toFixed(2)}`} color="text-green-400" />
          <MetricCard label="Your Net" value={`$${(s?.manual_net_host_amount || 0).toFixed(2)}`} sub="After fee deduction" />
        </div>
      )}

      <Tabs defaultValue="payments">
        <TabsList className="flex-wrap h-auto gap-1">
          {[['payments','Payments'],['failed','Failed Payments'],['payouts','Payouts'],['collections','Alerts']].map(([v,l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="payments" className="mt-4 space-y-2">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MetricCard label="Paid" value={data?.revenue?.paid_payment_count || 0} color="text-green-400" />
            <MetricCard label="Failed" value={data?.revenue?.failed_payment_count || 0} color="text-red-400" />
            <MetricCard label="Total Revenue" value={`$${(s?.gmv || 0).toLocaleString()}`} color="text-green-400" />
          </div>
          {data?.revenue?.payment_logs?.filter(p => p.status === 'paid').slice(0, 50).map(p => (
            <div key={p.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                <div>
                  <p className="font-medium">${(p.amount || 0).toFixed(2)} · Week {p.week_number} · {p.customer_name || p.customer_email}</p>
                  <p className="text-muted-foreground text-xs">{p.paid_at ? format(new Date(p.paid_at), 'MMM d, yyyy') : '—'} · {formatPaymentSource(p.source_type)}</p>
                </div>
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
                <p className="font-medium">Net: <span className="text-green-400">${(p.net_host_payout || p.net_payout || 0).toFixed(2)}</span> · Gross: ${(p.gross_booking_amount || 0).toFixed(2)}</p>
                <p className="text-muted-foreground text-xs">{p.payout_date || '—'}</p>
              </div>
              <SBadge status={p.status} />
            </div>
          ))}
          {!data?.payouts?.all_payouts?.length && <p className="text-muted-foreground text-sm">No payout records found.</p>}
        </TabsContent>

        <TabsContent value="collections" className="mt-4 space-y-2">
          {data?.collections?.alerts?.map(a => (
            <div key={a.id} className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
              <div className="flex justify-between items-center"><p className="font-medium">{a.title}</p><Badge className="bg-red-500/20 text-red-400 text-xs">{a.severity}</Badge></div>
              <p className="text-muted-foreground text-xs mt-1">{a.message}</p>
            </div>
          ))}
          {!data?.collections?.alerts?.length && <p className="text-muted-foreground text-sm">No collection alerts.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}