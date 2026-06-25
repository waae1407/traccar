import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatPaymentSource, formatVehicleAction, formatActivityMessage, sanitizeInternalText } from '@/lib/displayFormatters';
import BookingLifecycleFields from '@/components/shared/BookingLifecycleFields';
import CustomerRentalHistoryMetrics from '@/components/shared/CustomerRentalHistoryMetrics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, User, CreditCard, Car, AlertTriangle, MessageSquare, Activity, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import { format } from 'date-fns';

function StatusBadge({ status }) {
  const map = {
    active: 'bg-green-500/20 text-green-400', confirmed: 'bg-green-500/20 text-green-400',
    approved: 'bg-blue-500/20 text-blue-400', payment_due: 'bg-yellow-500/20 text-yellow-400',
    suspended: 'bg-red-500/20 text-red-400', grace_period: 'bg-orange-500/20 text-orange-400',
    paid: 'bg-green-500/20 text-green-400', failed: 'bg-red-500/20 text-red-400',
    completed: 'bg-muted text-muted-foreground', cancelled: 'bg-muted text-muted-foreground',
  };
  return <Badge className={map[status] || 'bg-muted text-muted-foreground'}>{status?.replace(/_/g, ' ')}</Badge>;
}

export default function HostCustomer360() {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!search.trim()) return;
    setLoading(true); setError(''); setData(null);
    const res = await base44.functions.invoke('getCustomer360', { search: search.trim() });
    if (res.data?.error) { setError(res.data.error === 'Forbidden' ? 'No customer found in your fleet matching that search.' : res.data.error); }
    else { setData(res.data); }
    setLoading(false);
  };

  const c = data?.customer;
  const ps = data?.payment_summary;
  const ab = data?.active_booking;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Customer 360</h1>
        <p className="text-muted-foreground text-sm mt-1">Full view of your renters — payments, bookings, telematics, disputes</p>
      </div>

      <div className="flex gap-3">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Customer name, email, phone, or booking ID..." className="max-w-md" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
        <Button onClick={handleSearch} disabled={loading}><Search className="h-4 w-4 mr-2" />{loading ? 'Searching…' : 'Search'}</Button>
      </div>

      {error && <Alert className="border-red-500/30 bg-red-500/10"><AlertDescription className="text-red-400">{error}</AlertDescription></Alert>}
      {data?.message && <p className="text-muted-foreground">{data.message}</p>}

      {c && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card border-border md:col-span-2">
              <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-primary" />Customer Profile</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-muted-foreground text-xs">Name</p><p className="font-semibold">{c.full_name || '—'}</p></div>
                  <div><p className="text-muted-foreground text-xs">Email</p><p>{c.email}</p></div>
                  <div><p className="text-muted-foreground text-xs">Phone</p><p>{c.phone || '—'}</p></div>
                  <div><p className="text-muted-foreground text-xs">Income Range</p><p>{c.income_range || '—'}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><CreditCard className="h-4 w-4 text-primary" />Payment Status</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-muted-foreground text-xs">Status</p><StatusBadge status={ps?.booking_status} /></div>
                  <div><p className="text-muted-foreground text-xs">Payment</p><StatusBadge status={ps?.payment_status} /></div>
                  <div><p className="text-muted-foreground text-xs">Total Paid</p><p className="font-medium text-green-400">${(data?.payment_logs?.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0) || 0).toFixed(2)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Next Billing</p><p>{ps?.next_billing_date || '—'}</p></div>
                </div>
                {ps?.starter_disabled && <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2"><Zap className="h-4 w-4 text-red-400" /><span className="text-red-400 text-xs font-semibold">Vehicle access restricted</span></div>}
                {ps?.grace_period_ends_at && <div className="flex items-center gap-2 rounded-lg bg-orange-500/10 border border-orange-500/30 px-3 py-2"><Clock className="h-4 w-4 text-orange-400" /><span className="text-orange-400 text-xs">Grace period ends: {format(new Date(ps.grace_period_ends_at), 'MMM d, h:mm a')}</span></div>}
              </CardContent>
            </Card>
          </div>

          {ab && (
            <Card className="bg-card border-border border-l-4 border-l-primary">
              <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Car className="h-4 w-4 text-primary" />Active Booking</CardTitle></CardHeader>
              <CardContent className="text-sm">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><p className="text-muted-foreground text-xs">Status</p><StatusBadge status={ab.booking_status} /></div>
                  <div><p className="text-muted-foreground text-xs">Vehicle</p><p>{ab.vehicle_name || '—'}</p></div>
                  <div><p className="text-muted-foreground text-xs">Weekly Rate</p><p className="text-green-400">${ab.weekly_rate || 0}/wk</p></div>
                  <div><p className="text-muted-foreground text-xs">Next Billing</p><p>{ab.next_billing_date || '—'}</p></div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rental History Metrics */}
          <CustomerRentalHistoryMetrics bookings={data.bookings || []} paymentLogs={data.payment_logs || []} disputes={data.disputes || []} />

          <Tabs defaultValue="payments">
            <TabsList className="flex-wrap h-auto gap-1">
              {[['payments','Payments'],['bookings','Bookings'],['telematics','Vehicle Actions'],['disputes','Disputes'],['comms','Communications'],['activity','Activity']].map(([v, l]) => (
                <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="payments" className="space-y-3 mt-4">
              {data.payment_logs?.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    {p.status === 'paid' ? <CheckCircle className="h-4 w-4 text-green-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                    <div>
                      <p className="font-medium">${(p.amount || 0).toFixed(2)} — Week {p.week_number}</p>
                      <p className="text-muted-foreground text-xs">{p.paid_at ? format(new Date(p.paid_at), 'MMM d, yyyy h:mm a') : '—'} · {formatPaymentSource(p.source_type)}</p>
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
              {!data.payment_logs?.length && <p className="text-muted-foreground text-sm">No payment records found.</p>}
            </TabsContent>

            <TabsContent value="bookings" className="space-y-3 mt-4">
              {data.bookings?.map(b => (
                <div key={b.id} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {b.is_superseded && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">VOIDED</span>}
                      <StatusBadge status={b.booking_status} />
                      <p className="font-mono text-xs text-muted-foreground">{b.id?.slice(-10)}</p>
                    </div>
                    <StatusBadge status={b.payment_status} />
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Vehicle: </span>{b.vehicle_name || '—'}</div>
                    <div><span className="text-muted-foreground">Start: </span>{b.start_date || '—'}</div>
                    <div><span className="text-muted-foreground">End: </span>{b.end_date || '—'}</div>
                  </div>
                  <BookingLifecycleFields booking={b} compact />
                </div>
              ))}
              {!data.bookings?.length && <p className="text-muted-foreground text-sm">No bookings found.</p>}
            </TabsContent>

            <TabsContent value="telematics" className="space-y-3 mt-4">
              {data.telematics_commands?.map(cmd => (
                <div key={cmd.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div><p className="font-medium">{formatVehicleAction(cmd.command_type)}</p><p className="text-muted-foreground text-xs">{cmd.created_at ? format(new Date(cmd.created_at), 'MMM d, h:mm a') : '—'}</p></div>
                  <StatusBadge status={cmd.queue_status || cmd.status} />
                </div>
              ))}
              {!data.telematics_commands?.length && <p className="text-muted-foreground text-sm">No vehicle actions found.</p>}
            </TabsContent>

            <TabsContent value="disputes" className="space-y-3 mt-4">
              {data.disputes?.map(d => (
                <div key={d.id} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div className="flex justify-between"><p className="font-medium">{d.dispute_type?.replace(/_/g,' ')}</p><StatusBadge status={d.status} /></div>
                  <p className="text-muted-foreground text-xs mt-1">{d.description}</p>
                </div>
              ))}
              {!data.disputes?.length && <p className="text-muted-foreground text-sm">No disputes found.</p>}
            </TabsContent>

            <TabsContent value="comms" className="space-y-3 mt-4">
              {data.communications?.map(t => (
                <div key={t.id} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div className="flex justify-between"><p className="font-medium">{t.subject}</p><StatusBadge status={t.status} /></div>
                  <p className="text-muted-foreground text-xs mt-1">{t.thread_type?.replace(/_/g,' ')}</p>
                </div>
              ))}
              {!data.communications?.length && <p className="text-muted-foreground text-sm">No communications found.</p>}
            </TabsContent>

            <TabsContent value="activity" className="space-y-2 mt-4">
              {data.activity_events?.map(e => (
                <div key={e.id} className="flex gap-3 text-xs py-2 border-b border-border">
                  <Activity className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-foreground">{sanitizeInternalText(e.summary || formatActivityMessage(e.event_type))}</p>
                    <p className="text-muted-foreground">{e.created_date ? format(new Date(e.created_date), 'MMM d, h:mm a') : '—'}</p>
                  </div>
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