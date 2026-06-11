import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import Dealer360StatusBadge from './StatusBadge';
import { Loader2, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
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

  if (!pr) return null;

  // Hold expiry warning: Stripe auth holds expire at 7 days; warn after 6 days
  const holdAgeDays = pr.funded_at ? (Date.now() - new Date(pr.funded_at).getTime()) / (1000 * 60 * 60 * 24) : null;
  const holdExpiringSoon = holdAgeDays !== null && holdAgeDays >= 6 && pr.hold_status === 'authorized';

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

        {/* Hold expiry warning */}
        {holdExpiringSoon && (
          <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-300">
              <strong>Buying Power Hold expires soon.</strong> Stripe authorization holds expire after 7 days. This hold is {Math.floor(holdAgeDays)} days old — verify in Stripe before marking won.
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