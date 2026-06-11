import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ExternalLink, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const AUCTION_SITES = {
  acv: { label: 'ACV Auctions', url: 'https://www.acvauctions.com' },
  manheim: { label: 'Manheim', url: 'https://www.manheim.com' },
  adesa: { label: 'ADESA', url: 'https://www.adesa.com' },
  iaai: { label: 'IAA Insurance Auto Auctions', url: 'https://www.iaai.com' },
  copart: { label: 'Copart', url: 'https://www.copart.com' },
  openlane: { label: 'OpenLane', url: 'https://www.openlane.com' },
  backlot: { label: 'BacklotCars', url: 'https://www.backlotcars.com' },
  other: { label: 'Other', url: null },
};

export default function PurchaseRequestForm({ hostId, hostEmail, hostName, onSuccess, prefill }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    vin: prefill?.vin || '', year: '', make: '', model: '', trim: '', mileage: '',
    condition_notes: '', auction_source: prefill?.auction_source || 'acv',
    auction_link: prefill?.auction_link || '',
    max_bid: '', transport_needed: false, notes_to_agent: '',
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [holdError, setHoldError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selectedSite = AUCTION_SITES[form.auction_source];
  const holdEstimate = form.max_bid ? (parseFloat(form.max_bid) * 1.3).toFixed(2) : null;

  const handleSaveDraft = async () => {
    if (!form.vin || !form.max_bid) {
      toast({ title: 'VIN and Max Bid are required', variant: 'destructive' }); return;
    }
    setSaving(true);
    const record = await base44.entities.DealerPurchaseRequest.create({
      host_id: hostId, host_email: hostEmail, host_name: hostName,
      vin: form.vin.toUpperCase().trim(),
      year: form.year ? parseInt(form.year) : null,
      make: form.make, model: form.model, trim: form.trim,
      mileage: form.mileage ? parseInt(form.mileage) : null,
      condition_notes: form.condition_notes,
      auction_source: form.auction_source,
      auction_link: form.auction_link,
      max_bid: parseFloat(form.max_bid),
      transport_needed: form.transport_needed,
      notes_to_agent: form.notes_to_agent,
      status: 'draft',
    });
    setSavedId(record.id);
    setSaving(false);
    toast({ title: 'Draft saved' });
  };

  const handleSubmitWithHold = async () => {
    let prId = savedId;
    if (!prId) {
      if (!form.vin || !form.max_bid) {
        toast({ title: 'VIN and Max Bid are required', variant: 'destructive' }); return;
      }
      setSaving(true);
      const record = await base44.entities.DealerPurchaseRequest.create({
        host_id: hostId, host_email: hostEmail, host_name: hostName,
        vin: form.vin.toUpperCase().trim(),
        year: form.year ? parseInt(form.year) : null,
        make: form.make, model: form.model, trim: form.trim,
        mileage: form.mileage ? parseInt(form.mileage) : null,
        condition_notes: form.condition_notes,
        auction_source: form.auction_source,
        auction_link: form.auction_link,
        max_bid: parseFloat(form.max_bid),
        transport_needed: form.transport_needed,
        notes_to_agent: form.notes_to_agent,
        status: 'draft',
      });
      prId = record.id;
      setSavedId(prId);
      setSaving(false);
    }

    setHoldError('');
    setSubmitting(true);
    const res = await base44.functions.invoke('dealer360BuyingPowerHold', { purchase_request_id: prId });
    setSubmitting(false);

    if (res.data?.ok) {
      toast({ title: `✅ Buying power hold of $${res.data.hold_amount.toLocaleString()} authorized. Request submitted to bid desk.` });
      onSuccess?.();
    } else {
      const msg = res.data?.error || 'Authorization failed. Please check your payment method.';
      setHoldError(msg);
      toast({ title: msg, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Auction Portal CTA */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-sm">Step 1 — Browse the Auction</p>
          <p className="text-xs text-muted-foreground mt-0.5">Open the auction portal, find your vehicle, copy the VIN, then return here.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(AUCTION_SITES).filter(([k]) => k !== 'other').map(([k, v]) => (
            <a key={k} href={v.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs bg-secondary px-3 py-1.5 rounded-lg hover:bg-secondary/80 transition-colors text-foreground">
              <ExternalLink className="h-3 w-3" /> {v.label}
            </a>
          ))}
        </div>
      </div>

      {/* Auction Source + Link */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Auction Source *</Label>
          <Select value={form.auction_source} onValueChange={v => set('auction_source', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(AUCTION_SITES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Auction Listing Link (optional)</Label>
          <Input value={form.auction_link} onChange={e => set('auction_link', e.target.value)} placeholder="https://..." />
        </div>
      </div>

      {/* Vehicle Info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">VIN *</Label>
          <Input value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} placeholder="17-character VIN" className="font-mono tracking-widest" maxLength={17} />
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Year</Label><Input type="number" value={form.year} onChange={e => set('year', e.target.value)} placeholder="2022" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Make</Label><Input value={form.make} onChange={e => set('make', e.target.value)} placeholder="Toyota" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Model</Label><Input value={form.model} onChange={e => set('model', e.target.value)} placeholder="Camry" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Trim</Label><Input value={form.trim} onChange={e => set('trim', e.target.value)} placeholder="XSE" /></div>
        <div className="col-span-2 space-y-1.5"><Label className="text-xs">Mileage</Label><Input type="number" value={form.mileage} onChange={e => set('mileage', e.target.value)} placeholder="45000" /></div>
      </div>

      {/* Bid + Financial */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Max Bid ($) *</Label>
          <Input type="number" value={form.max_bid} onChange={e => set('max_bid', e.target.value)} placeholder="8000" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Buying Power Hold</Label>
          <div className="h-9 flex items-center px-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm font-semibold">
            {holdEstimate ? `$${parseFloat(holdEstimate).toLocaleString()}` : '—'} <span className="text-xs font-normal text-muted-foreground ml-2">(max bid × 1.3)</span>
          </div>
        </div>
      </div>

      {/* Condition + Transport */}
      <div className="space-y-1.5">
        <Label className="text-xs">Condition Notes</Label>
        <Textarea value={form.condition_notes} onChange={e => set('condition_notes', e.target.value)} placeholder="Any known issues, damage, modifications..." rows={2} />
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={form.transport_needed} onCheckedChange={v => set('transport_needed', v)} />
        <Label className="text-sm">Transport needed from auction to my location</Label>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Notes to Agent</Label>
        <Textarea value={form.notes_to_agent} onChange={e => set('notes_to_agent', e.target.value)} placeholder="Any special instructions for the bidding agent..." rows={2} />
      </div>

      {/* Hold Info Banner */}
      <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-cyan-400" /> How the Buying Power Hold Works</div>
        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside ml-1">
          <li>A temporary authorization hold of <strong className="text-foreground">${holdEstimate || '(max bid × 1.3)'}</strong> is placed on your card.</li>
          <li>This is <strong className="text-foreground">not</strong> a charge — just a reservation.</li>
          <li>If you don't win, the hold is released immediately.</li>
          <li>If you win, only the final invoice amount is captured.</li>
          <li>Covers: bid + auction fees + uRide concierge ($50) + transport if needed.</li>
        </ul>
      </div>

      {holdError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{holdError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={handleSaveDraft} disabled={saving || submitting}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Draft'}
        </Button>
        <Button onClick={handleSubmitWithHold} disabled={saving || submitting || !form.vin || !form.max_bid}
          className="gradient-primary">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Authorizing Hold…</> : `Submit & Authorize $${holdEstimate || '—'} Hold`}
        </Button>
      </div>
    </div>
  );
}