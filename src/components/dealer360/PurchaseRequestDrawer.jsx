import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import Dealer360StatusBadge from './StatusBadge';
import { Loader2, FileText, AlertTriangle, CheckCircle, RotateCcw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useQueryClient } from '@tanstack/react-query';

const fmt = (n) => n != null ? `$${Number(n).toLocaleString()}` : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—';

// Admin invoice form
function InvoiceForm({ pr, onDone }) {
  const { toast } = useToast();
  const [fields, setFields] = useState({
    bid_amount: pr.bid_amount || pr.max_bid || '',
    auction_fee: pr.auction_fee || '',
    buyer_fee: pr.buyer_fee || '',
    transport_fee: pr.transport_fee || '',
    title_fee: pr.title_fee || '',
    storage_fee: pr.storage_fee || '',
    stripe_fee: pr.stripe_fee || '',
    uride_concierge_fee: pr.uride_concierge_fee || 50,
    other_fee: pr.other_fee || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setFields(f => ({ ...f, [k]: v }));
  const total = Object.values(fields).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  const save = async () => {
    setSaving(true);
    const res = await base44.functions.invoke('dealer360AdminAction', {
      action: 'enter_invoice', purchase_request_id: pr.id,
      ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, parseFloat(v) || 0]))
    });
    setSaving(false);
    if (res.data?.ok) { toast({ title: `Invoice sent. Total: $${total.toFixed(2)}` }); onDone?.(); }
    else toast({ title: res.data?.error || 'Failed', variant: 'destructive' });
  };

  const lineItems = [
    ['bid_amount', 'Bid Amount'], ['auction_fee', 'Auction Fee'], ['buyer_fee', "Buyer's Fee"],
    ['transport_fee', 'Transport Fee'], ['title_fee', 'Title Fee'], ['storage_fee', 'Storage Fee'],
    ['stripe_fee', 'Stripe Fee'], ['uride_concierge_fee', 'uRide Concierge Fee'], ['other_fee', 'Other'],
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Enter Final Purchase Invoice</p>
      {lineItems.map(([k, label]) => (
        <div key={k} className="flex items-center justify-between gap-3">
          <Label className="text-xs w-40 shrink-0">{label}</Label>
          <Input type="number" value={fields[k]} onChange={e => set(k, e.target.value)} className="h-8 text-sm" placeholder="0" />
        </div>
      ))}
      <div className="flex items-center justify-between pt-2 border-t border-border font-bold">
        <span>Total Due</span><span className="text-primary">{fmt(total)}</span>
      </div>
      <Button className="w-full gradient-primary" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Invoice to Host'}
      </Button>
    </div>
  );
}

export default function PurchaseRequestDrawer({ pr, open, onClose, isAdmin, onRefresh }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [actionLoading, setActionLoading] = useState('');
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);

  if (!pr) return null;

  // Hold expiry tracking using hold_expires_at field (authoritative) or funded_at fallback
  const now = Date.now();
  const holdExpiresAt = pr.hold_expires_at ? new Date(pr.hold_expires_at).getTime() : null;
  const holdExpiresInMs = holdExpiresAt ? holdExpiresAt - now : null;
  const holdExpiresInHours = holdExpiresInMs !== null ? holdExpiresInMs / (1000 * 60 * 60) : null;
  const holdExpired = pr.hold_status === 'authorized' && holdExpiresInMs !== null && holdExpiresInMs <= 0;
  const holdExpiring24h = pr.hold_status === 'authorized' && holdExpiresInHours !== null && holdExpiresInHours > 0 && holdExpiresInHours < 24;
  const holdExpiring48h = pr.hold_status === 'authorized' && holdExpiresInHours !== null && holdExpiresInHours >= 24 && holdExpiresInHours < 48;

  const handleRefund = async () => {
    if (!refundReason) { toast({ title: 'Please select a refund reason', variant: 'destructive' }); return; }
    setRefundLoading(true);
    const res = await base44.functions.invoke('dealer360AdminAction', {
      action: 'post_capture_refund',
      purchase_request_id: pr.id,
      refund_reason: refundReason,
    });
    setRefundLoading(false);
    if (res.data?.ok) {
      toast({ title: `Refund of $${res.data.refund_amount?.toFixed(2)} processed` });
      setShowRefundForm(false);
      onRefresh?.();
    } else {
      toast({ title: res.data?.error || 'Refund failed', variant: 'destructive' });
    }
  };

  const adminAction = async (actionData) => {
    setActionLoading(actionData.action || '');
    const res = await base44.functions.invoke('dealer360AdminAction', { ...actionData, purchase_request_id: pr.id });
    setActionLoading('');
    if (res.data?.ok) {
      toast({ title: 'Updated' });
      onRefresh?.();
    } else {
      toast({ title: res.data?.error || 'Action failed', variant: 'destructive' });
    }
  };

  const STATUS_ACTIONS = {
    funded: [{ label: 'Start Review', status: 'under_review' }],
    under_review: [{ label: 'Mark Bid Placed', status: 'bid_placed' }, { label: 'Cancel', status: 'cancelled' }],
    bid_placed: [{ label: 'Mark Won 🎉', status: 'won' }, { label: 'Mark Lost', status: 'lost' }, { label: 'Mark Outbid', status: 'outbid' }],
    outbid: [{ label: 'Mark Won 🎉', status: 'won' }, { label: 'Mark Lost', status: 'lost' }],
  };

  const availableActions = STATUS_ACTIONS[pr.status] || [];

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full max-w-2xl overflow-y-auto space-y-5 bg-card border-border">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            {pr.year} {pr.make} {pr.model}
            <Dealer360StatusBadge status={pr.status} />
          </SheetTitle>
        </SheetHeader>

        {/* Hold expiry warnings */}
        {holdExpired && (
          <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">
              <strong>Buying Power Hold EXPIRED.</strong> This authorization hold has expired. Marking Won is blocked. The host must reauthorize buying power before bidding can continue.
            </p>
          </div>
        )}
        {holdExpiring24h && !holdExpired && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">
              <strong>Hold expires in under 24 hours</strong> ({holdExpiresInHours?.toFixed(1)}h remaining). Act immediately or the hold will expire.
            </p>
          </div>
        )}
        {holdExpiring48h && (
          <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-300">
              <strong>Hold expires in under 48 hours</strong> ({holdExpiresInHours?.toFixed(1)}h remaining). Resolve before expiry or reauthorization will be required.
            </p>
          </div>
        )}

        {/* Vehicle Info */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {[
            ['VIN', <span className="font-mono text-xs">{pr.vin}</span>],
            ['Auction Source', pr.auction_source],
            ['Max Bid', fmt(pr.max_bid)],
            ['Hold Amount', fmt(pr.hold_amount)],
            ['Hold Status', pr.hold_status],
            ['Mileage', pr.mileage ? pr.mileage.toLocaleString() + ' mi' : '—'],
            ['Transport Needed', pr.transport_needed ? 'Yes' : 'No'],
            ['Submitted', fmtDate(pr.submitted_at)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-border/30 pb-1">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-right">{value || '—'}</span>
            </div>
          ))}
        </div>

        {pr.condition_notes && <div className="text-sm"><span className="text-muted-foreground">Condition: </span>{pr.condition_notes}</div>}
        {pr.notes_to_agent && <div className="text-sm"><span className="text-muted-foreground">Agent Notes: </span>{pr.notes_to_agent}</div>}
        {pr.auction_link && <a href={pr.auction_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline flex items-center gap-1">View Auction Listing ↗</a>}

        {/* Invoice (if entered) */}
        {pr.total_due && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 space-y-2">
            <p className="font-semibold text-sm flex items-center gap-2"><FileText className="h-4 w-4" />Final Invoice</p>
            {[['Bid', pr.bid_amount], ['Auction Fee', pr.auction_fee], ["Buyer's Fee", pr.buyer_fee], ['Transport', pr.transport_fee], ['Title Fee', pr.title_fee], ['Storage', pr.storage_fee], ['uRide Concierge', pr.uride_concierge_fee], ['Other', pr.other_fee]].filter(([, v]) => v > 0).map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span>{fmt(value)}</span></div>
            ))}
            <div className="flex justify-between font-bold border-t border-green-500/30 pt-2"><span>Total Due</span><span className="text-primary">{fmt(pr.total_due)}</span></div>
          </div>
        )}

        {/* Admin Actions */}
        {isAdmin && (
          <div className="space-y-3 border-t border-border/50 pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Admin Actions</p>

            {availableActions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {availableActions.map(a => (
                  <Button key={a.status} size="sm" variant="outline"
                    disabled={!!actionLoading}
                    onClick={() => adminAction({ action: 'update_purchase_status', status: a.status })}>
                    {actionLoading === 'update_purchase_status' ? <Loader2 className="h-3 w-3 animate-spin" /> : a.label}
                  </Button>
                ))}
              </div>
            )}

            {pr.status === 'won' && !pr.invoice_sent_at && (
              <InvoiceForm pr={pr} onDone={onRefresh} />
            )}

            {pr.status === 'payment_due' && (
              <Button className="w-full gradient-primary" disabled={!!actionLoading}
                onClick={() => adminAction({ action: 'capture_final_payment' })}>
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Capture Final Payment — ${fmt(pr.total_due)}`}
              </Button>
            )}

            {/* Post-capture refund */}
            {pr.status === 'completed' && pr.hold_captured && !pr.refund_status && isAdmin && (
              <div className="pt-2 border-t border-border/50">
                {!showRefundForm ? (
                  <Button size="sm" variant="outline" className="text-xs text-red-400 border-red-500/30 hover:bg-red-500/10"
                    onClick={() => setShowRefundForm(true)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />Issue Refund
                  </Button>
                ) : (
                  <div className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                    <p className="text-sm font-semibold text-red-300">Post-Capture Refund</p>
                    <p className="text-xs text-muted-foreground">Full amount ({fmt(pr.total_due)}) will be refunded via Stripe.</p>
                    <div className="space-y-1">
                      <Label className="text-xs">Refund Reason</Label>
                      <Select value={refundReason} onValueChange={setRefundReason}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select reason…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auction_cancelled">Auction Cancelled</SelectItem>
                          <SelectItem value="seller_withdrew">Seller Withdrew</SelectItem>
                          <SelectItem value="vehicle_unavailable">Vehicle Unavailable</SelectItem>
                          <SelectItem value="title_issue">Title Issue</SelectItem>
                          <SelectItem value="transport_damage">Transport Damage</SelectItem>
                          <SelectItem value="administrative_error">Administrative Error</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={handleRefund} disabled={refundLoading || !refundReason}>
                        {refundLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Refund'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setShowRefundForm(false); setRefundReason(''); }}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Refunded status display */}
            {pr.refund_status === 'succeeded' && (
              <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3 text-xs text-orange-300 space-y-0.5">
                <p className="font-semibold">Refunded</p>
                <p>Amount: {fmt(pr.refund_amount)} — {pr.refund_reason?.replace(/_/g, ' ')}</p>
                {pr.refunded_at && <p>Processed: {fmtDate(pr.refunded_at)}</p>}
              </div>
            )}

            {['lost', 'cancelled'].includes(pr.status) && pr.hold_status === 'authorized' && (
              <Button variant="outline" disabled={!!actionLoading}
                onClick={() => adminAction({ action: 'release_hold', reason: `Status: ${pr.status}` })}>
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '🔓 Release Buying Power Hold'}
              </Button>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Agent Notes</Label>
              <Textarea defaultValue={pr.agent_notes || ''} rows={2} id={`agent-notes-${pr.id}`} />
              <Button size="sm" variant="outline" onClick={() => {
                const notes = document.getElementById(`agent-notes-${pr.id}`)?.value;
                adminAction({ action: 'update_purchase_status', status: pr.status, agent_notes: notes });
              }}>Save Notes</Button>
            </div>
          </div>
        )}

        {/* Activity Log */}
        {pr.activity_log?.length > 0 && (
          <div className="space-y-2 border-t border-border/50 pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Activity</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {[...pr.activity_log].reverse().map((entry, i) => (
                <div key={i} className="text-xs flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0">{new Date(entry.at).toLocaleDateString()}</span>
                  <span className="font-medium">{entry.action?.replace(/_/g, ' ')}</span>
                  {entry.note && <span className="text-muted-foreground">— {entry.note}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}