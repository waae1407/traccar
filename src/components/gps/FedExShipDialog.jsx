import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Truck, Loader2, FileText, ExternalLink } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

function parseAddress(raw) {
  if (!raw) return { street: '', city: '', state: '', zip: '' };
  // "street, city, state zip" or "street, city, state, zip"
  const m1 = raw.match(/^(.+),\s*([^,]+),\s*([A-Za-z]{2})\s*(\d{5}(-\d{4})?)\s*$/);
  if (m1) return { street: m1[1].trim(), city: m1[2].trim(), state: m1[3].toUpperCase(), zip: m1[4] };
  const m2 = raw.match(/^(.+),\s*([^,]+),\s*([A-Za-z]{2}),\s*(\d{5}(-\d{4})?)\s*$/);
  if (m2) return { street: m2[1].trim(), city: m2[2].trim(), state: m2[3].toUpperCase(), zip: m2[4] };
  return { street: '', city: '', state: '', zip: '' };
}

export default function FedExShipDialog({ order, onClose, onShipped }) {
  const { toast } = useToast();
  const parsed = useMemo(() => parseAddress(order?.shipping_address), [order]);
  const [addr, setAddr] = useState(parsed);
  const [serviceType, setServiceType] = useState('FEDEX_GROUND');
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [labelResult, setLabelResult] = useState(null);
  const [markingShipped, setMarkingShipped] = useState(false);
  const [manualTracking, setManualTracking] = useState('');

  const handleCreateLabel = async () => {
    if (!addr.street || !addr.city || !addr.state || !addr.zip) {
      toast({ title: 'Complete address required to create a label', variant: 'destructive' });
      return;
    }
    setCreatingLabel(true);
    setLabelResult(null);
    try {
      const res = await base44.functions.invoke('createFedExShipment', {
        order_id: order.id,
        recipient_name: order.customer_name,
        recipient_phone: order.customer_phone || '',
        street_lines: addr.street,
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        service_type: serviceType,
      });
      if (res.data?.error) {
        toast({ title: res.data.error, variant: 'destructive' });
      } else {
        setLabelResult(res.data);
        toast({ title: `FedEx label created — ${res.data.tracking_number}` });
      }
    } catch (e) {
      toast({ title: e.message || 'Failed to create FedEx label', variant: 'destructive' });
    }
    setCreatingLabel(false);
  };

  const handleMarkShipped = async () => {
    const trackingNumber = labelResult?.tracking_number || manualTracking.trim();
    if (!trackingNumber) {
      toast({ title: 'Create a FedEx label or enter a tracking number first', variant: 'destructive' });
      return;
    }
    setMarkingShipped(true);
    try {
      const res = await base44.functions.invoke('markGPSOrderShipped', {
        order_id: order.id,
        tracking_number: trackingNumber,
        carrier: labelResult?.carrier || 'FedEx',
      });
      if (res.data?.error) {
        toast({ title: res.data.error, variant: 'destructive' });
      } else {
        toast({ title: 'Marked as shipped — customer emailed' });
        onShipped();
      }
    } catch (e) {
      toast({ title: e.message || 'Failed to mark shipped', variant: 'destructive' });
    }
    setMarkingShipped(false);
  };

  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="w-4 h-4" /> Ship Order — {order?.order_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {/* Customer info */}
          <div className="glass rounded-xl p-3 space-y-1">
            <p className="text-sm font-bold text-white">{order?.customer_name}</p>
            <p className="text-xs text-muted-foreground">{order?.customer_email}</p>
            {order?.customer_phone && <p className="text-xs text-muted-foreground">📞 {order.customer_phone}</p>}
          </div>

          {/* Shipping address (editable for label accuracy) */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wide">Shipping Address</Label>
            <Input value={addr.street} onChange={e => setAddr(p => ({ ...p, street: e.target.value }))} placeholder="Street address" />
            <div className="grid grid-cols-2 gap-2">
              <Input value={addr.city} onChange={e => setAddr(p => ({ ...p, city: e.target.value }))} placeholder="City" />
              <Input value={addr.state} onChange={e => setAddr(p => ({ ...p, state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="State" maxLength={2} />
            </div>
            <Input value={addr.zip} onChange={e => setAddr(p => ({ ...p, zip: e.target.value.replace(/\D/g, '').slice(0, 5) }))} placeholder="ZIP code" />
            <p className="text-[10px] text-muted-foreground">Verify the parsed address before creating a FedEx label.</p>
          </div>

          {/* Service type */}
          <div className="space-y-1">
            <Label className="text-xs font-bold uppercase tracking-wide">FedEx Service</Label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FEDEX_GROUND">FedEx Ground (1-5 business days)</SelectItem>
                <SelectItem value="FEDEX_2_DAY">FedEx 2 Day</SelectItem>
                <SelectItem value="FEDEX_EXPRESS_SAVER">FedEx Express Saver (3 days)</SelectItem>
                <SelectItem value="PRIORITY_OVERNIGHT">Priority Overnight</SelectItem>
                <SelectItem value="STANDARD_OVERNIGHT">Standard Overnight</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Create label button */}
          <Button onClick={handleCreateLabel} className="w-full gradient-primary" disabled={creatingLabel || markingShipped}>
            {creatingLabel ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Label…</> : <><Truck className="w-4 h-4" /> Create FedEx Label</>}
          </Button>

          {/* Label result */}
          {labelResult && (
            <div className="glass rounded-xl p-3 space-y-2 border-green-500/30">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-400" />
                <p className="text-sm font-bold text-white">Label Created</p>
              </div>
              <p className="text-xs text-muted-foreground">Tracking: <span className="font-mono text-white">{labelResult.tracking_number}</span></p>
              {labelResult.label_url && (
                <a href={labelResult.label_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
                  <ExternalLink className="w-3 h-3" /> Download Shipping Label (PDF)
                </a>
              )}
            </div>
          )}

          {/* Manual tracking fallback */}
          {!labelResult && (
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase tracking-wide">Or Enter Tracking Manually</Label>
              <Input value={manualTracking} onChange={e => setManualTracking(e.target.value)} placeholder="Tracking number (if not using FedEx)" />
            </div>
          )}

          {/* Mark shipped */}
          <div className="flex gap-3 pt-1">
            <Button onClick={handleMarkShipped} className="flex-1 gradient-primary" disabled={markingShipped || creatingLabel || (!labelResult && !manualTracking.trim())}>
              {markingShipped ? <><Loader2 className="w-4 h-4 animate-spin" /> Marking…</> : 'Mark Shipped'}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}