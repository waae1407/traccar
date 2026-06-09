import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, CreditCard, Car, User, CheckCircle, XCircle, AlertTriangle, Activity, Zap } from 'lucide-react';
import { format } from 'date-fns';

function SBadge({ status }) {
  const map = { active: 'bg-green-500/20 text-green-400', confirmed: 'bg-green-500/20 text-green-400', approved: 'bg-blue-500/20 text-blue-400', payment_due: 'bg-yellow-500/20 text-yellow-400', suspended: 'bg-red-500/20 text-red-400', paid: 'bg-green-500/20 text-green-400', failed: 'bg-red-500/20 text-red-400', signed: 'bg-green-500/20 text-green-400', completed: 'bg-muted text-muted-foreground', cancelled: 'bg-muted text-muted-foreground' };
  return <Badge className={map[status] || 'bg-muted text-muted-foreground text-xs'}>{status?.replace(/_/g, ' ')}</Badge>;
}

export default function Booking360() {
  const [bookingId, setBookingId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!bookingId.trim()) return;
    setLoading(true); setError(''); setData(null);
    const res = await base44.functions.invoke('getBooking360', { booking_request_id: bookingId.trim() });
    if (res.data?.error) setError(res.data.error);
    else setData(res.data);
    setLoading(false);
  };

  const b = data?.booking;
  const ps = data?.payment_summary;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Booking 360</h1>
        <p className="text-muted-foreground text-sm mt-1">Full booking lifecycle — payments, payouts, telematics, inspections</p>
      </div>
      <div className="flex gap-3">
        <Input value={bookingId} onChange={e => setBookingId(e.target.value)} placeholder="Booking ID..." className="max-w-md" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
        <Button onClick={handleSearch} disabled={loading}><Search className="h-4 w-4 mr-2" />{loading ? 'Loading…' : 'Load Booking'}</Button>
      </div>
      {error && <Alert className="border-red-500/30 bg-red-500/10"><AlertDescription className="text-red-400">{error}</AlertDescription></Alert>}

      {data?.warnings?.map((w, i) => (
        <Alert key={i} className="border-yellow-500/30 bg-yellow-500/10 py-2">
          <AlertTriangle className="h-3 w-3 text-yellow-400" />
          <AlertDescription className="text-yellow-300 text-xs">{w}</AlertDescription>
        </Alert>
      ))}

      {b && (
        <div className="space-y-4">
          {/* Header row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Car className="h-4 w-4 text-primary" />Booking Details</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-muted-foreground text-xs">Booking ID</p><p className="font-mono text-xs">{b.id?.slice(-10)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Type</p><p>{b.booking_type}</p></div>
                  <div><p className="text-muted-foreground text-xs">Status</p><SBadge status={b.booking_status} /></div>
                  <div><p className="text-muted-foreground text-xs">Payment</p><SBadge status={b.payment_status} /></div>
                  <div><p className="text-muted-foreground text-xs">Start</p><p>{b.start_date || '—'}</p></div>
                  <div><p className="text-muted-foreground text-xs">End</p><p>{b.end_date || '—'}</p></div>
                  <div><p className="text-muted-foreground text-xs">Weekly Rate</p><p className="text-green-400">${b.weekly_rate || 0}</p></div>
                  <div><p className="text-muted-foreground text-xs">Week #</p><p>{b.billing_week_number || 1}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" />Financial Summary</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-muted-foreground text-xs">Total Collected</p><p className="text-green-400 font-semibold">${(ps?.total_collected || 0).toFixed(2)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Net Host Paid Out</p><p className="font-semibold">${(ps?.total_paid_out || 0).toFixed(2)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Platform Fees</p><p>${(ps?.total_platform_fees || 0).toFixed(2)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Payments</p><p>{ps?.paid_payment_count || 0} paid / {ps?.failed_payment_count || 0} failed</p></div>
                  <div><p className="text-muted-foreground text-xs">Retries</p><p>{ps?.payment_failure_attempts || 0}</p></div>
                  <div><p className="text-muted-foreground text-xs">Next Billing</p><p>{ps?.next_billing_date || '—'}</p></div>
                </div>
                {ps?.starter_disabled && <div className="flex items-center gap-2 rounded bg-red-500/10 border border-red-500/30 px-2 py-1"><Zap className="h-3 w-3 text-red-400" /><span className="text-red-400 text-xs font-bold">Starter DISABLED</span></div>}
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4 text-primary" />Parties</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <div><p className="text-muted-foreground text-xs">Customer</p><p className="font-medium">{b.customer_full_name || '—'}</p><p className="text-xs text-muted-foreground">{b.user_email}</p></div>
                <div><p className="text-muted-foreground text-xs">Vehicle</p><p>{b.vehicle_name || data.vehicle ? `${data.vehicle?.year} ${data.vehicle?.make} ${data.vehicle?.model}` : '—'}</p></div>
                <div><p className="text-muted-foreground text-xs">Host</p><p>{data.host?.full_name || '—'}</p></div>
                <div><p className="text-muted-foreground text-xs">Contract</p><SBadge status={b.contract_status} /></div>
                <div><p className="text-muted-foreground text-xs">ID Verification</p><SBadge status={b.verification_status} /></div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="payments">
            <TabsList className="flex-wrap h-auto gap-1">
              {[['payments','Payment Logs'],['payouts','Payouts'],['telematics','Telematics'],['inspections','Inspections'],['disputes','Disputes'],['comms','Comms'],['activity','Activity']].map(([v,l]) => (
                <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="payments" className="mt-4 space-y-2">
              {data.payment_logs?.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    {p.status === 'paid' ? <CheckCircle className="h-4 w-4 text-green-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                    <div>
                      <p className="font-medium">${(p.amount || 0).toFixed(2)} · Week {p.week_number} · {p.source_type}</p>
                      <p className="text-muted-foreground text-xs">{p.paid_at ? format(new Date(p.paid_at), 'MMM d, yyyy') : '—'}</p>
                      {p.stripe_payment_intent_id && <p className="text-muted-foreground font-mono text-xs">PI: {p.stripe_payment_intent_id.slice(-12)}</p>}
                    </div>
                  </div>
                  <SBadge status={p.status} />
                </div>
              ))}
              {!data.payment_logs?.length && <p className="text-muted-foreground text-sm">No PaymentLog records found.</p>}
            </TabsContent>

            <TabsContent value="payouts" className="mt-4 space-y-2">
              {data.payouts?.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">Net: ${(p.net_host_payout || p.net_payout || 0).toFixed(2)} · Gross: ${(p.gross_booking_amount || 0).toFixed(2)}</p>
                    <p className="text-muted-foreground text-xs">Stripe Transfer: {p.stripe_transfer_id || '—'}</p>
                    <p className="text-muted-foreground text-xs">Platform fee: ${(p.uride_platform_fee_amount || 0).toFixed(2)} · Stripe fee: ${(p.stripe_fee_amount || 0).toFixed(2)}</p>
                  </div>
                  <SBadge status={p.status} />
                </div>
              ))}
              {!data.payouts?.length && <p className="text-muted-foreground text-sm">No HostPayout records found.</p>}
            </TabsContent>

            <TabsContent value="telematics" className="mt-4 space-y-2">
              {data.telematics_commands?.map(cmd => (
                <div key={cmd.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{cmd.command_type?.replace(/_/g, ' ')} · {cmd.production_command ? <span className="text-green-400 text-xs">LIVE</span> : <span className="text-muted-foreground text-xs">dry-run</span>}</p>
                    <p className="text-muted-foreground text-xs">{cmd.requested_by} · {cmd.created_at ? format(new Date(cmd.created_at), 'MMM d, h:mm a') : '—'}</p>
                  </div>
                  <SBadge status={cmd.queue_status || cmd.status} />
                </div>
              ))}
              {!data.telematics_commands?.length && <p className="text-muted-foreground text-sm">No telematics commands found.</p>}
            </TabsContent>

            <TabsContent value="inspections" className="mt-4 space-y-2">
              {data.inspections?.map(i => (
                <div key={i.id} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div className="flex justify-between items-center">
                    <p className="font-medium">{i.inspection_type?.replace(/_/g,' ')} · Submitted by {i.submitted_by_role}</p>
                    <SBadge status={i.evidence_status} />
                  </div>
                  <p className="text-muted-foreground text-xs mt-1">Confidence: {i.evidence_confidence} · Photos: {i.required_photo_slots_completed}</p>
                  {i.submitted_at && <p className="text-muted-foreground text-xs">{format(new Date(i.submitted_at), 'MMM d, yyyy h:mm a')}</p>}
                </div>
              ))}
              {!data.inspections?.length && <p className="text-muted-foreground text-sm">No inspection evidence found.</p>}
            </TabsContent>

            <TabsContent value="disputes" className="mt-4 space-y-2">
              {data.disputes?.map(d => (
                <div key={d.id} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div className="flex justify-between items-center"><p className="font-medium">{d.dispute_type?.replace(/_/g,' ')}</p><SBadge status={d.status} /></div>
                  {d.stripe_dispute_amount && <p className="text-red-400 text-xs mt-1">${d.stripe_dispute_amount.toFixed(2)} chargeback</p>}
                </div>
              ))}
              {!data.disputes?.length && <p className="text-muted-foreground text-sm">No disputes found.</p>}
            </TabsContent>

            <TabsContent value="comms" className="mt-4 space-y-2">
              {data.communications?.map(t => (
                <div key={t.id} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <p className="font-medium">{t.subject}</p>
                  <p className="text-muted-foreground text-xs">{t.thread_type?.replace(/_/g,' ')} · <SBadge status={t.status} /></p>
                </div>
              ))}
              {!data.communications?.length && <p className="text-muted-foreground text-sm">No communications found.</p>}
            </TabsContent>

            <TabsContent value="activity" className="mt-4 space-y-1">
              {data.activity_events?.map(e => (
                <div key={e.id} className="flex gap-3 text-xs py-1.5 border-b border-border">
                  <Activity className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div><p>{e.summary || e.event_type}</p><p className="text-muted-foreground">{e.created_date ? format(new Date(e.created_date), 'MMM d, h:mm a') : '—'} · {e.actor_email}</p></div>
                </div>
              ))}
              {!data.activity_events?.length && <p className="text-muted-foreground text-sm">No activity found.</p>}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}