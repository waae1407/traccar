import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { formatPaymentSource, formatVehicleAction, formatActivityMessage, sanitizeInternalText } from '@/lib/displayFormatters';
import BookingLifecycleFields from '@/components/shared/BookingLifecycleFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, CreditCard, Car, User, CheckCircle, XCircle, AlertTriangle, Activity, Zap, List } from 'lucide-react';
import { format } from 'date-fns';

function SBadge({ status }) {
  const map = { active: 'bg-green-500/20 text-green-400', confirmed: 'bg-green-500/20 text-green-400', approved: 'bg-blue-500/20 text-blue-400', payment_due: 'bg-yellow-500/20 text-yellow-400', suspended: 'bg-red-500/20 text-red-400', paid: 'bg-green-500/20 text-green-400', failed: 'bg-red-500/20 text-red-400', signed: 'bg-green-500/20 text-green-400', completed: 'bg-muted text-muted-foreground', cancelled: 'bg-muted text-muted-foreground' };
  return <Badge className={map[status] || 'bg-muted text-muted-foreground text-xs'}>{status?.replace(/_/g, ' ')}</Badge>;
}

export default function HostBooking360() {
  const { user } = useAuth();
  const [bookingId, setBookingId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('list'); // 'list' or 'detail'
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch host's bookings for list view
  const { data: hosts = [] } = useQuery({
    queryKey: ['host-booking360-profile', user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: hostBookings = [], isLoading: listLoading } = useQuery({
    queryKey: ['host-booking360-list', host?.id],
    queryFn: () => base44.entities.BookingRequest.filter({ host_id: host.id }, '-updated_date', 200),
    enabled: !!host?.id,
  });

  const filteredBookings = hostBookings.filter(b => {
    if (filterStatus !== 'all') {
      if (filterStatus === 'active' && !['active', 'confirmed', 'approved', 'checked_out', 'return_required', 'post_inspection_required', 'overdue_return', 'return_pending_host_review', 'payment_due', 'grace_period', 'suspended'].includes(b.booking_status)) return false;
      if (filterStatus === 'completed' && b.booking_status !== 'completed') return false;
      if (filterStatus === 'auto_completed' && !(b.booking_status === 'completed' && b.completion_reason === 'host_review_window_expired')) return false;
      if (filterStatus === 'return_pending' && b.booking_status !== 'return_pending_host_review') return false;
      if (filterStatus === 'voided' && !['cancelled', 'superseded_invalid', 'rejected'].includes(b.booking_status)) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (b.customer_full_name || '').toLowerCase().includes(q) ||
             (b.user_email || '').toLowerCase().includes(q) ||
             (b.vehicle_name || '').toLowerCase().includes(q) ||
             b.id.toLowerCase().includes(q);
    }
    return true;
  });

  const handleSearch = async () => {
    if (!bookingId.trim()) return;
    setLoading(true); setError(''); setData(null);
    const res = await base44.functions.invoke('getBooking360', { booking_request_id: bookingId.trim() });
    if (res.data?.error) setError(res.data.error === 'Forbidden' ? 'This booking does not belong to your fleet.' : res.data.error);
    else { setData(res.data); setView('detail'); }
    setLoading(false);
  };

  const openBooking = async (id) => {
    setLoading(true); setError('');
    const res = await base44.functions.invoke('getBooking360', { booking_request_id: id });
    if (res.data?.error) setError(res.data.error);
    else { setData(res.data); setView('detail'); }
    setLoading(false);
  };

  const b = data?.booking;
  const ps = data?.payment_summary;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Booking 360</h1>
          <p className="text-muted-foreground text-sm mt-1">Full booking view — payments, vehicle actions, inspections</p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === 'list' ? 'default' : 'outline'} onClick={() => setView('list')}><List className="h-4 w-4 mr-2" />List</Button>
          <Button variant={view === 'detail' ? 'default' : 'outline'} onClick={() => setView('detail')}><Search className="h-4 w-4 mr-2" />Detail</Button>
        </div>
      </div>

      {view === 'detail' && (
        <>
          <div className="flex gap-3">
            <Input value={bookingId} onChange={e => setBookingId(e.target.value)} placeholder="Booking ID..." className="max-w-md" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            <Button onClick={handleSearch} disabled={loading}><Search className="h-4 w-4 mr-2" />{loading ? 'Loading…' : 'Load Booking'}</Button>
          </div>
          {error && <Alert className="border-red-500/30 bg-red-500/10"><AlertDescription className="text-red-400">{error}</AlertDescription></Alert>}
        </>
      )}

      {view === 'list' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search customer, vehicle, or booking ID..." className="max-w-xs" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-sm">
              <option value="all">All Statuses</option>
              <option value="active">Active / Current</option>
              <option value="completed">Completed</option>
              <option value="auto_completed">Auto-completed</option>
              <option value="return_pending">Return Pending Review</option>
              <option value="voided">Cancelled / Voided</option>
            </select>
          </div>

          {/* List */}
          <div className="space-y-2">
            {listLoading && <p className="text-muted-foreground text-sm">Loading bookings…</p>}
            {!listLoading && filteredBookings.length === 0 && <p className="text-muted-foreground text-sm">No bookings match your filters.</p>}
            {filteredBookings.map(b => (
              <button key={b.id} onClick={() => openBooking(b.id)} className="w-full text-left rounded-lg bg-secondary/30 px-3 py-2 text-sm hover:bg-secondary/50 transition-colors space-y-1">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{b.customer_full_name || b.user_email}</p>
                    <p className="text-muted-foreground text-xs">{b.vehicle_name || '—'} · {b.start_date} → {b.end_date || '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.is_superseded && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">VOIDED</span>}
                    <SBadge status={b.booking_status} />
                    <SBadge status={b.payment_status} />
                  </div>
                </div>
                <BookingLifecycleFields booking={b} compact />
              </button>
            ))}
          </div>
        </>
      )}

      {data?.warnings?.map((w, i) => (
        <Alert key={i} className="border-yellow-500/30 bg-yellow-500/10 py-2">
          <AlertTriangle className="h-3 w-3 text-yellow-400" />
          <AlertDescription className="text-yellow-300 text-xs">{w}</AlertDescription>
        </Alert>
      ))}

      {b && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Car className="h-4 w-4 text-primary" />Booking Details</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-muted-foreground text-xs">Status</p><SBadge status={b.booking_status} /></div>
                  <div><p className="text-muted-foreground text-xs">Payment</p><SBadge status={b.payment_status} /></div>
                  <div><p className="text-muted-foreground text-xs">Start</p><p>{b.start_date || '—'}</p></div>
                  <div><p className="text-muted-foreground text-xs">Weekly Rate</p><p className="text-green-400">${b.weekly_rate || 0}</p></div>
                  <div><p className="text-muted-foreground text-xs">Week #</p><p>{b.billing_week_number || 1}</p></div>
                  <div><p className="text-muted-foreground text-xs">Next Billing</p><p>{ps?.next_billing_date || '—'}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" />Financials</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-muted-foreground text-xs">Total Collected</p><p className="text-green-400 font-semibold">${(ps?.total_collected || 0).toFixed(2)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Your Net Payout</p><p className="font-semibold">${(ps?.total_paid_out || 0).toFixed(2)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Payments</p><p>{ps?.paid_payment_count || 0} paid / {ps?.failed_payment_count || 0} failed</p></div>
                  <div><p className="text-muted-foreground text-xs">Retries</p><p>{ps?.payment_failure_attempts || 0}</p></div>
                </div>
                {ps?.starter_disabled && <div className="flex items-center gap-2 rounded bg-red-500/10 border border-red-500/30 px-2 py-1"><Zap className="h-3 w-3 text-red-400" /><span className="text-red-400 text-xs font-bold">Vehicle access restricted</span></div>}
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4 text-primary" />Customer</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <div><p className="text-muted-foreground text-xs">Name</p><p className="font-medium">{b.customer_full_name || '—'}</p></div>
                <div><p className="text-muted-foreground text-xs">Email</p><p className="text-xs">{b.user_email}</p></div>
                <div><p className="text-muted-foreground text-xs">Vehicle</p><p>{b.vehicle_name || data.vehicle ? `${data.vehicle?.year} ${data.vehicle?.make} ${data.vehicle?.model}` : '—'}</p></div>
                <div><p className="text-muted-foreground text-xs">Contract</p><SBadge status={b.contract_status} /></div>
                <div><p className="text-muted-foreground text-xs">ID Verification</p><SBadge status={b.verification_status} /></div>
              </CardContent>
            </Card>
          </div>

          {/* Lifecycle Section */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-primary" />Rental Lifecycle</CardTitle></CardHeader>
            <CardContent>
              <BookingLifecycleFields booking={b} />
            </CardContent>
          </Card>

          <Tabs defaultValue="payments">
            <TabsList className="flex-wrap h-auto gap-1">
              {[['payments','Payments'],['telematics','Vehicle Actions'],['inspections','Inspections'],['disputes','Disputes'],['comms','Comms'],['activity','Activity']].map(([v,l]) => (
                <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="payments" className="mt-4 space-y-2">
              {data.payment_logs?.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    {p.status === 'paid' ? <CheckCircle className="h-4 w-4 text-green-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                    <div><p className="font-medium">${(p.amount || 0).toFixed(2)} · Week {p.week_number} · {formatPaymentSource(p.source_type)}</p><p className="text-muted-foreground text-xs">{p.paid_at ? format(new Date(p.paid_at), 'MMM d, yyyy') : '—'}</p></div>
                  </div>
                  <SBadge status={p.status} />
                </div>
              ))}
              {!data.payment_logs?.length && <p className="text-muted-foreground text-sm">No payment records found.</p>}
            </TabsContent>

            <TabsContent value="telematics" className="mt-4 space-y-2">
              {data.telematics_commands?.map(cmd => (
                <div key={cmd.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div><p className="font-medium">{formatVehicleAction(cmd.command_type)}</p><p className="text-muted-foreground text-xs">{cmd.created_at ? format(new Date(cmd.created_at), 'MMM d, h:mm a') : '—'}</p></div>
                  <SBadge status={cmd.queue_status || cmd.status} />
                </div>
              ))}
              {!data.telematics_commands?.length && <p className="text-muted-foreground text-sm">No vehicle actions found.</p>}
            </TabsContent>

            <TabsContent value="inspections" className="mt-4 space-y-2">
              {data.inspections?.map(i => (
                <div key={i.id} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <div className="flex justify-between items-center"><p className="font-medium">{i.inspection_type?.replace(/_/g,' ')} · by {i.submitted_by_role}</p><SBadge status={i.evidence_status} /></div>
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
                </div>
              ))}
              {!data.disputes?.length && <p className="text-muted-foreground text-sm">No disputes found.</p>}
            </TabsContent>

            <TabsContent value="comms" className="mt-4 space-y-2">
              {data.communications?.map(t => (
                <div key={t.id} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <p className="font-medium">{t.subject}</p>
                  <p className="text-muted-foreground text-xs">{t.thread_type?.replace(/_/g,' ')}</p>
                </div>
              ))}
              {!data.communications?.length && <p className="text-muted-foreground text-sm">No communications found.</p>}
            </TabsContent>

            <TabsContent value="activity" className="mt-4 space-y-1">
              {data.activity_events?.map(e => (
                <div key={e.id} className="flex gap-3 text-xs py-1.5 border-b border-border">
                  <Activity className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div><p>{sanitizeInternalText(e.summary || formatActivityMessage(e.event_type))}</p><p className="text-muted-foreground">{e.created_date ? format(new Date(e.created_date), 'MMM d, h:mm a') : '—'}</p></div>
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