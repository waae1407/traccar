import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Gavel, Handshake, Globe } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const ROUTES = [
  { id: 'auction', label: 'Auction Route', icon: Gavel, desc: 'Our agent coordinates auction listing and sale. Best for quick liquidation.' },
  { id: 'uride_direct', label: 'uRide Direct Offer', icon: Handshake, desc: 'Get an instant AI-estimated offer from uRide. Fastest, no auction fees.' },
  { id: 'public_listing', label: 'Dealer360 Public Listing', icon: Globe, desc: 'List publicly on Dealer360 marketplace. Highest potential price.' },
];

export default function SellRequestForm({ hostId, hostEmail, hostName, onSuccess }) {
  const { toast } = useToast();
  const [route, setRoute] = useState('auction');
  const [form, setForm] = useState({
    vin: '', year: '', make: '', model: '', trim: '', mileage: '',
    condition: 'good', condition_notes: '', title_status: 'clean',
    desired_minimum_price: '', location: '', notes_to_agent: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.vin) { toast({ title: 'VIN is required', variant: 'destructive' }); return; }
    setSaving(true);
    await base44.entities.DealerSellRequest.create({
      host_id: hostId, host_email: hostEmail, host_name: hostName,
      sell_route: route,
      vin: form.vin.toUpperCase().trim(),
      year: form.year ? parseInt(form.year) : null,
      make: form.make, model: form.model, trim: form.trim,
      mileage: form.mileage ? parseInt(form.mileage) : null,
      condition: form.condition, condition_notes: form.condition_notes,
      title_status: form.title_status,
      desired_minimum_price: form.desired_minimum_price ? parseFloat(form.desired_minimum_price) : null,
      location: form.location,
      notes_to_agent: form.notes_to_agent,
      status: 'submitted',
    });
    setSaving(false);
    toast({ title: '✅ Sell request submitted. Our team will review and be in touch shortly.' });
    onSuccess?.();
  };

  return (
    <div className="space-y-6">
      {/* Route Selection */}
      <div className="grid grid-cols-3 gap-3">
        {ROUTES.map(r => (
          <button key={r.id} onClick={() => setRoute(r.id)}
            className={`rounded-xl border p-4 text-left transition-all ${route === r.id ? 'border-primary bg-primary/10' : 'border-border bg-secondary/20 hover:border-border/80'}`}>
            <r.icon className={`h-5 w-5 mb-2 ${route === r.id ? 'text-primary' : 'text-muted-foreground'}`} />
            <p className="font-medium text-sm">{r.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
          </button>
        ))}
      </div>

      {/* Vehicle Info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">VIN *</Label>
          <Input value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} placeholder="17-character VIN" className="font-mono tracking-widest" maxLength={17} />
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Year</Label><Input type="number" value={form.year} onChange={e => set('year', e.target.value)} placeholder="2021" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Make</Label><Input value={form.make} onChange={e => set('make', e.target.value)} placeholder="Honda" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Model</Label><Input value={form.model} onChange={e => set('model', e.target.value)} placeholder="Accord" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Trim</Label><Input value={form.trim} onChange={e => set('trim', e.target.value)} placeholder="EX" /></div>
        <div className="space-y-1.5"><Label className="text-xs">Mileage</Label><Input type="number" value={form.mileage} onChange={e => set('mileage', e.target.value)} placeholder="62000" /></div>
        <div className="space-y-1.5">
          <Label className="text-xs">Condition</Label>
          <Select value={form.condition} onValueChange={v => set('condition', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['excellent', 'good', 'fair', 'poor'].map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Title Status</Label>
          <Select value={form.title_status} onValueChange={v => set('title_status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['clean', 'salvage', 'rebuilt', 'flood', 'lemon', 'pending', 'unknown'].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5"><Label className="text-xs">Location (city/zip)</Label><Input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Los Angeles, CA" /></div>
        <div className="col-span-2 space-y-1.5">
          <Label className="text-xs">Desired Minimum Price ($) — optional</Label>
          <Input type="number" value={form.desired_minimum_price} onChange={e => set('desired_minimum_price', e.target.value)} placeholder="12000" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Condition Notes</Label>
        <Textarea value={form.condition_notes} onChange={e => set('condition_notes', e.target.value)} placeholder="Describe any damage, issues, recent repairs..." rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Notes to Agent</Label>
        <Textarea value={form.notes_to_agent} onChange={e => set('notes_to_agent', e.target.value)} placeholder="Anything else our team should know..." rows={2} />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={saving || !form.vin} className="gradient-primary">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Submitting…</> : 'Submit Sell Request'}
        </Button>
      </div>
    </div>
  );
}