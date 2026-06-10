import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const RISK_CONFIG = {
  low: { color: 'text-green-400 bg-green-500/20', icon: CheckCircle },
  medium: { color: 'text-yellow-400 bg-yellow-500/20', icon: AlertTriangle },
  high: { color: 'text-red-400 bg-red-500/20', icon: AlertTriangle },
};

const fmt = (n) => n ? `$${Number(n).toLocaleString()}` : '—';

export default function AIValuationTool({ prefillVin, prefillYear, prefillMake, prefillModel, prefillMileage, prefillCondition, prefillTitleStatus }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    vin: prefillVin || '', year: prefillYear || '', make: prefillMake || '', model: prefillModel || '',
    trim: '', mileage: prefillMileage || '', condition: prefillCondition || 'good',
    title_status: prefillTitleStatus || 'clean', location: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const runValuation = async () => {
    if (!form.make || !form.model) { toast({ title: 'Make and model are required', variant: 'destructive' }); return; }
    setLoading(true);
    setResult(null);
    const res = await base44.functions.invoke('dealer360AIValuation', {
      vin: form.vin, year: form.year ? parseInt(form.year) : null,
      make: form.make, model: form.model, trim: form.trim,
      mileage: form.mileage ? parseInt(form.mileage) : null,
      condition: form.condition, title_status: form.title_status, location: form.location,
    });
    setLoading(false);
    if (res.data?.ok) {
      setResult(res.data.valuation);
    } else {
      toast({ title: res.data?.error || 'Valuation failed', variant: 'destructive' });
    }
  };

  const RiskIcon = result ? (RISK_CONFIG[result.risk_score]?.icon || CheckCircle) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles className="h-4 w-4" /> AI Wholesale Valuation Tool
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1"><Label className="text-xs">VIN</Label><Input value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} placeholder="Optional — helps accuracy" className="font-mono" /></div>
        <div className="space-y-1"><Label className="text-xs">Year</Label><Input type="number" value={form.year} onChange={e => set('year', e.target.value)} placeholder="2020" /></div>
        <div className="space-y-1"><Label className="text-xs">Make *</Label><Input value={form.make} onChange={e => set('make', e.target.value)} placeholder="Ford" /></div>
        <div className="space-y-1"><Label className="text-xs">Model *</Label><Input value={form.model} onChange={e => set('model', e.target.value)} placeholder="F-150" /></div>
        <div className="space-y-1"><Label className="text-xs">Trim</Label><Input value={form.trim} onChange={e => set('trim', e.target.value)} placeholder="XLT" /></div>
        <div className="space-y-1"><Label className="text-xs">Mileage</Label><Input type="number" value={form.mileage} onChange={e => set('mileage', e.target.value)} placeholder="55000" /></div>
        <div className="space-y-1">
          <Label className="text-xs">Condition</Label>
          <Select value={form.condition} onValueChange={v => set('condition', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['excellent','good','fair','poor'].map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Title Status</Label>
          <Select value={form.title_status} onValueChange={v => set('title_status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{['clean','salvage','rebuilt','flood','lemon','pending','unknown'].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1"><Label className="text-xs">Location</Label><Input value={form.location} onChange={e => set('location', e.target.value)} placeholder="Phoenix, AZ" /></div>
      </div>

      <Button onClick={runValuation} disabled={loading || !form.make || !form.model} className="w-full gradient-primary">
        {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyzing market data…</> : <><Sparkles className="h-4 w-4 mr-2" />Run AI Valuation</>}
      </Button>

      {result && (
        <div className="rounded-xl border border-border/60 bg-secondary/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <span className="font-semibold text-sm">Valuation Report</span>
            <span className={`text-xs flex items-center gap-1.5 px-2 py-1 rounded-md font-medium ${RISK_CONFIG[result.risk_score]?.color}`}>
              {RiskIcon && <RiskIcon className="h-3 w-3" />} {result.risk_score?.toUpperCase()} RISK
            </span>
          </div>

          <div className="p-4 grid grid-cols-2 gap-3">
            <div className="col-span-2 rounded-lg bg-primary/10 border border-primary/20 p-3 text-center">
              <p className="text-xs text-muted-foreground">Estimated Wholesale Value</p>
              <p className="text-2xl font-bold text-primary mt-0.5">{fmt(result.wholesale_value)}</p>
              {result.confidence && <p className="text-xs text-muted-foreground mt-0.5">Confidence: {result.confidence}</p>}
            </div>

            {[
              { label: 'Recommended Buy Price', value: result.recommended_buy_price, icon: TrendingDown, color: 'text-cyan-400' },
              { label: 'Auction Minimum', value: result.recommended_auction_min, icon: TrendingUp, color: 'text-yellow-400' },
              { label: 'Public Listing Price', value: result.recommended_public_price, icon: TrendingUp, color: 'text-green-400' },
              { label: 'uRide Direct Offer', value: result.uride_offer_suggested, icon: TrendingDown, color: 'text-purple-400' },
            ].map(item => (
              <div key={item.label} className="rounded-lg border border-border/40 bg-card/40 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <item.icon className={`h-3 w-3 ${item.color}`} />
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
                <p className={`text-base font-bold ${item.color}`}>{fmt(item.value)}</p>
              </div>
            ))}
          </div>

          {result.valuation_notes && (
            <div className="px-4 pb-4">
              <p className="text-xs text-muted-foreground leading-relaxed">{result.valuation_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}