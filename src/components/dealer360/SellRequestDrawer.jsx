import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import Dealer360StatusBadge from './StatusBadge';
import AIValuationTool from './AIValuationTool';
import { Loader2, Sparkles, TrendingUp } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const fmt = (n) => n != null ? `$${Number(n).toLocaleString()}` : '—';

const ROUTE_LABELS = { auction: 'Auction Route', uride_direct: 'uRide Direct Offer', public_listing: 'Dealer360 Public Listing' };

export default function SellRequestDrawer({ sr, open, onClose, isAdmin, onRefresh }) {
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = useState('');
  const [showValuation, setShowValuation] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [saleFields, setSaleFields] = useState({ sale_price: '', auction_fees: '', transport_fee: '', storage_fee: '', uride_concierge_fee: 50 });

  if (!sr) return null;

  const adminAction = async (data) => {
    setActionLoading(data.action);
    const res = await base44.functions.invoke('dealer360AdminAction', { ...data, sell_request_id: sr.id });
    setActionLoading('');
    if (res.data?.ok) { toast({ title: 'Updated' }); onRefresh?.(); }
    else toast({ title: res.data?.error || 'Failed', variant: 'destructive' });
  };

  const hostAction = async (data) => {
    setActionLoading(data.action);
    const res = await base44.functions.invoke('dealer360HostAction', { ...data, sell_request_id: sr.id });
    setActionLoading('');
    if (res.data?.ok) { toast({ title: 'Updated' }); onRefresh?.(); }
    else toast({ title: res.data?.error || 'Failed', variant: 'destructive' });
  };

  const netProceeds = saleFields.sale_price
    ? (parseFloat(saleFields.sale_price) - (parseFloat(saleFields.auction_fees) || 0) - (parseFloat(saleFields.transport_fee) || 0) - (parseFloat(saleFields.storage_fee) || 0) - (parseFloat(saleFields.uride_concierge_fee) || 50))
    : null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full max-w-2xl overflow-y-auto space-y-5 bg-card border-border">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            {sr.year} {sr.make} {sr.model}
            <Dealer360StatusBadge status={sr.status} type="sell" />
          </SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {[
            ['VIN', <span className="font-mono text-xs">{sr.vin}</span>],
            ['Route', ROUTE_LABELS[sr.sell_route]],
            ['Condition', sr.condition],
            ['Title', sr.title_status],
            ['Mileage', sr.mileage ? sr.mileage.toLocaleString() + ' mi' : '—'],
            ['Min Price', fmt(sr.desired_minimum_price)],
            ['Location', sr.location],
            ['Host', sr.host_email],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-border/30 pb-1">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-right">{value || '—'}</span>
            </div>
          ))}
        </div>

        {/* AI Valuation Summary */}
        {sr.ai_wholesale_value && (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 grid grid-cols-2 gap-2 text-sm">
            <p className="col-span-2 font-semibold flex items-center gap-2 text-cyan-400"><Sparkles className="h-4 w-4" />AI Valuation</p>
            {[['Wholesale', sr.ai_wholesale_value], ['Buy Price', sr.ai_recommended_buy_price], ['Auction Min', sr.ai_recommended_auction_min], ['Public Price', sr.ai_recommended_public_price]].map(([l, v]) => (
              <div key={l}><span className="text-muted-foreground text-xs">{l} </span><span className="font-bold">{fmt(v)}</span></div>
            ))}
            {sr.ai_valuation_notes && <p className="col-span-2 text-xs text-muted-foreground mt-1">{sr.ai_valuation_notes}</p>}
          </div>
        )}

        {/* uRide Direct Offer (host view) */}
        {sr.uride_offer_amount && sr.uride_offer_status === 'pending' && !isAdmin && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 space-y-3">
            <p className="font-semibold text-sm">uRide Direct Offer</p>
            <p className="text-2xl font-bold text-primary">{fmt(sr.uride_offer_amount)}</p>
            <p className="text-xs text-muted-foreground">This offer is {sr.ai_wholesale_value ? `${(((sr.ai_wholesale_value - sr.uride_offer_amount) / sr.ai_wholesale_value) * 100).toFixed(0)}% below estimated wholesale value of ${fmt(sr.ai_wholesale_value)}.` : 'based on current market conditions.'}</p>
            <div className="flex gap-2">
              <Button className="gradient-primary flex-1" disabled={!!actionLoading} onClick={() => hostAction({ action: 'accept_uride_offer' })}>
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '✅ Accept Offer'}
              </Button>
              <Button variant="outline" className="flex-1" disabled={!!actionLoading} onClick={() => hostAction({ action: 'reject_uride_offer' })}>Decline</Button>
            </div>
          </div>
        )}

        {/* Sale Statement (if sold) */}
        {sr.status === 'sold' && sr.sale_price && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 space-y-2 text-sm">
            <p className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-400" />Sale Statement</p>
            {[['Sale Price', sr.sale_price], ['Auction Fees', sr.auction_fees], ['Transport', sr.transport_fee], ['Storage', sr.storage_fee], ['uRide Concierge', sr.uride_concierge_fee]].filter(([, v]) => v > 0).map(([l, v]) => (
              <div key={l} className="flex justify-between"><span className="text-muted-foreground">{l}</span><span>{fmt(v)}</span></div>
            ))}
            <div className="flex justify-between font-bold border-t border-green-500/30 pt-2"><span>Net Proceeds to You</span><span className="text-green-400">{fmt(sr.net_proceeds)}</span></div>
          </div>
        )}

        {/* Admin Actions */}
        {isAdmin && (
          <div className="space-y-4 border-t border-border/50 pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Admin Actions</p>

            {/* Run AI Valuation */}
            {!sr.ai_wholesale_value && (
              <Button size="sm" variant="outline" disabled={!!actionLoading}
                onClick={() => adminAction({ action: 'run_ai_valuation' })}>
                <Sparkles className="h-3 w-3 mr-1.5" />
                {actionLoading === 'run_ai_valuation' ? 'Running…' : 'Run AI Valuation'}
              </Button>
            )}

            {/* Status updates */}
            <div className="flex flex-wrap gap-2">
              {[['under_review', 'Start Review'], ['listed', 'Mark Listed'], ['inspection_scheduled', 'Schedule Inspection'], ['sold', null], ['cancelled', 'Cancel']].filter(([, l]) => l).map(([s, l]) => (
                <Button key={s} size="sm" variant="outline" disabled={!!actionLoading}
                  onClick={() => adminAction({ action: 'update_sell_status', status: s })}>
                  {l}
                </Button>
              ))}
            </div>

            {/* uRide Direct Offer */}
            {sr.sell_route === 'uride_direct' && sr.ai_wholesale_value && !sr.uride_offer_amount && (
              <div className="space-y-2">
                <Label className="text-xs">Send uRide Direct Offer</Label>
                <div className="flex gap-2">
                  <Input type="number" value={offerAmount} onChange={e => setOfferAmount(e.target.value)}
                    placeholder={`Suggested: ${fmt(sr.ai_recommended_buy_price)}`} className="h-8" />
                  <Button size="sm" className="gradient-primary" disabled={!offerAmount || !!actionLoading}
                    onClick={() => adminAction({ action: 'send_uride_offer', offer_amount: parseFloat(offerAmount) })}>
                    Send Offer
                  </Button>
                </div>
              </div>
            )}

            {/* Auction Sale Statement */}
            {sr.sell_route === 'auction' && sr.status !== 'sold' && (
              <div className="space-y-3 border border-border/40 rounded-xl p-3">
                <p className="text-sm font-medium">Enter Sale Statement</p>
                {[['sale_price', 'Sale Price'], ['auction_fees', 'Auction Fees'], ['transport_fee', 'Transport'], ['storage_fee', 'Storage'], ['uride_concierge_fee', 'uRide Concierge']].map(([k, l]) => (
                  <div key={k} className="flex items-center gap-2">
                    <Label className="text-xs w-32 shrink-0">{l}</Label>
                    <Input type="number" value={saleFields[k]} onChange={e => setSaleFields(f => ({ ...f, [k]: e.target.value }))} className="h-8 text-sm" />
                  </div>
                ))}
                {netProceeds !== null && <div className="flex justify-between text-sm font-bold border-t border-border/40 pt-2"><span>Net to Host</span><span className="text-green-400">{fmt(netProceeds)}</span></div>}
                <Button size="sm" className="w-full gradient-primary" disabled={!saleFields.sale_price || !!actionLoading}
                  onClick={() => adminAction({ action: 'enter_sale_statement', ...Object.fromEntries(Object.entries(saleFields).map(([k, v]) => [k, parseFloat(v) || 0])), net_proceeds: netProceeds })}>
                  Submit Sale Statement
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Activity Log */}
        {sr.activity_log?.length > 0 && (
          <div className="space-y-2 border-t border-border/50 pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Activity</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {[...sr.activity_log].reverse().map((entry, i) => (
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