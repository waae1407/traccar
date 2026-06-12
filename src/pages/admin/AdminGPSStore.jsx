import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RefreshCw, CheckCircle, Truck, Tag, RotateCcw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";

const statusColor = (s) => {
  if (['active', 'activated', 'paid'].includes(s)) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (s === 'shipped') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (['pending_payment', 'processing'].includes(s)) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  if (['cancelled', 'failed', 'refunded'].includes(s)) return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-muted text-muted-foreground border-border';
};

const REFUND_REASONS = [
  'customer_request',
  'device_defective',
  'shipping_damage',
  'wrong_item',
  'duplicate_order',
  'other',
];

export default function AdminGPSStore() {
  const { toast } = useToast();
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Ship dialog
  const [shipOrder, setShipOrder] = useState(null);
  const [shipForm, setShipForm] = useState({ tracking_number: '', carrier: '' });

  // Refund dialog
  const [refundOrder, setRefundOrder] = useState(null);
  const [refundForm, setRefundForm] = useState({ amount: '', reason: '' });
  const [refunding, setRefunding] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [ords, prods, subs] = await Promise.all([
      base44.entities.GPSOrder.list('-created_date', 100),
      base44.entities.GPSProduct.list('-created_date', 50),
      base44.entities.GPSSubscription.list('-created_date', 100),
    ]);
    setOrders(ords);
    setProducts(prods);
    setSubscriptions(subs);
    setLoading(false);
  };

  const updateOrderStatus = async (orderId, status) => {
    setSaving(true);
    await base44.entities.GPSOrder.update(orderId, { order_status: status });
    toast({ title: 'Order updated' });
    await loadData();
    setSaving(false);
  };

  const markShipped = async () => {
    if (!shipOrder) return;
    setSaving(true);
    await base44.entities.GPSOrder.update(shipOrder.id, {
      order_status: 'shipped',
      tracking_number: shipForm.tracking_number,
      carrier: shipForm.carrier,
      shipped_at: new Date().toISOString(),
    });
    toast({ title: 'Marked as shipped' });
    setShipOrder(null);
    setShipForm({ tracking_number: '', carrier: '' });
    await loadData();
    setSaving(false);
  };

  const openRefundDialog = (order) => {
    const maxRefund = (order.total_amount || 0) - (order.refund_amount || 0);
    setRefundOrder(order);
    setRefundForm({ amount: maxRefund.toFixed(2), reason: '' });
  };

  const submitRefund = async () => {
    if (!refundOrder || !refundForm.amount || !refundForm.reason) return;
    setRefunding(true);
    const res = await base44.functions.invoke('refundGPSOrder', {
      order_id: refundOrder.id,
      refund_amount: Number(refundForm.amount),
      refund_reason: refundForm.reason,
    });
    setRefunding(false);
    if (res.data?.error) {
      toast({ title: 'Refund failed', description: res.data.error, variant: 'destructive' });
      return;
    }
    toast({ title: `Refund of $${refundForm.amount} processed`, description: `Stripe Refund ID: ${res.data.stripe_refund_id}` });
    setRefundOrder(null);
    await loadData();
  };

  // Reporting calculations
  const paidOrders = orders.filter(o => o.payment_status === 'paid' || o.payment_status === 'refunded' || (o.refund_amount > 0));
  const grossMsrp = paidOrders.reduce((s, o) => s + ((o.msrp_unit_price || o.unit_price || 0) * (o.quantity || 1)), 0);
  const totalDiscounts = paidOrders.reduce((s, o) => s + (o.total_discount_amount || 0), 0);
  const netHardwareRevenue = paidOrders.filter(o => o.payment_status === 'paid').reduce((s, o) => s + (o.total_amount || 0), 0);
  const totalRefunded = orders.reduce((s, o) => s + (o.refund_amount || 0), 0);
  const pendingCount = orders.filter(o => o.order_status === 'paid' || o.order_status === 'processing').length;
  const activeSubscriptions = subscriptions.filter(s => s.subscription_status === 'active').length;
  const subMRR = subscriptions.filter(s => s.subscription_status === 'active').reduce((s, sub) => s + (sub.monthly_price || 0), 0);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src={LOGO} alt="Contactless360" className="h-10 object-contain" />
          <div>
            <h1 className="text-2xl font-syne font-bold text-white">GPS Store Admin</h1>
            <p className="text-sm text-muted-foreground">Manage GPS orders, products, activations, and subscriptions</p>
          </div>
        </div>
        <Button onClick={loadData} variant="outline" size="sm"><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Gross MSRP Value", value: `$${grossMsrp.toFixed(0)}`, color: "text-white", sub: "Full retail of paid orders" },
          { label: "Discounts Given", value: `$${totalDiscounts.toFixed(0)}`, color: "text-yellow-400", sub: "Fleet Partner savings" },
          { label: "Net Hardware Revenue", value: `$${netHardwareRevenue.toFixed(0)}`, color: "text-green-400", sub: "After discounts applied" },
          { label: "Refunded", value: `$${totalRefunded.toFixed(0)}`, color: totalRefunded > 0 ? "text-red-400" : "text-muted-foreground", sub: `${orders.filter(o => o.refund_status && o.refund_status !== 'none').length} orders` },
        ].map(k => (
          <div key={k.label} className="glass rounded-xl p-4 text-center">
            <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
            {k.sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{k.sub}</p>}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Total Orders", value: orders.length, color: "text-white" },
          { label: "Pending Fulfillment", value: pendingCount, color: "text-yellow-400" },
          { label: "Subscription MRR", value: `$${subMRR.toFixed(2)}/mo`, color: "text-primary", sub: `${activeSubscriptions} active` },
        ].map(k => (
          <div key={k.label} className="glass rounded-xl p-4 text-center">
            <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
            {k.sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{k.sub}</p>}
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions ({subscriptions.length})</TabsTrigger>
          <TabsTrigger value="products">Products ({products.length})</TabsTrigger>
        </TabsList>

        {/* ORDERS TAB */}
        <TabsContent value="orders" className="mt-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground"><RefreshCw className="w-5 h-5 animate-spin" /></div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No orders yet.</div>
          ) : (
            orders.map(order => {
              const maxRefundable = (order.total_amount || 0) - (order.refund_amount || 0);
              const canRefund = order.payment_status === 'paid' && maxRefundable > 0;
              return (
                <div key={order.id} className="glass rounded-xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-white font-bold">{order.order_number}</span>
                        <Badge className={statusColor(order.order_status)}>{order.order_status?.replace(/_/g, ' ')}</Badge>
                        <Badge className={statusColor(order.activation_status)} variant="outline">{order.activation_status?.replace(/_/g, ' ')}</Badge>
                        {order.fleet_partner_discount_applied && (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                            <Tag className="w-3 h-3 mr-1" />Fleet Partner
                          </Badge>
                        )}
                        {order.refund_status && order.refund_status !== 'none' && (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs capitalize">{order.refund_status} refund</Badge>
                        )}
                      </div>
                      <p className="text-sm text-white">{order.customer_name} · {order.customer_email}</p>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p className="capitalize">{order.package_type?.replace(/_/g, ' ')} · Qty {order.quantity}</p>
                        {order.fleet_partner_discount_applied ? (
                          <p>
                            Charged: <span className="text-white font-semibold">${order.total_amount?.toFixed(2)}</span>
                            <span className="ml-2 line-through">${((order.msrp_unit_price || 0) * (order.quantity || 1)).toFixed(2)} MSRP</span>
                            <span className="text-green-400 ml-2">−${order.total_discount_amount?.toFixed(2)} discount</span>
                          </p>
                        ) : (
                          <p>Total: <span className="text-white font-semibold">${order.total_amount?.toFixed(2)}</span></p>
                        )}
                        {order.refund_amount > 0 && (
                          <p className="text-red-400">Refunded: ${order.refund_amount?.toFixed(2)} · {order.refund_reason}</p>
                        )}
                      </div>
                      {order.tracking_number && <p className="text-xs text-blue-400">{order.carrier}: {order.tracking_number}</p>}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {(order.order_status === 'paid' || order.order_status === 'processing') && (
                        <Button size="sm" onClick={() => { setShipOrder(order); setShipForm({ tracking_number: '', carrier: '' }); }}>
                          <Truck className="w-3.5 h-3.5" /> Ship
                        </Button>
                      )}
                      {order.order_status === 'shipped' && (
                        <Button size="sm" variant="outline" onClick={() => updateOrderStatus(order.id, 'delivered')}>
                          <CheckCircle className="w-3.5 h-3.5" /> Delivered
                        </Button>
                      )}
                      {order.order_status === 'pending_payment' && (
                        <Button size="sm" variant="outline" onClick={() => updateOrderStatus(order.id, 'paid')}>
                          Mark Paid
                        </Button>
                      )}
                      {canRefund && (
                        <Button size="sm" variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={() => openRefundDialog(order)}>
                          <RotateCcw className="w-3.5 h-3.5" /> Refund
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>

        {/* SUBSCRIPTIONS TAB */}
        <TabsContent value="subscriptions" className="mt-4 space-y-3">
          {subscriptions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No subscriptions yet.</div>
          ) : (
            subscriptions.map(sub => (
              <div key={sub.id} className="glass rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-white font-semibold">{sub.customer_name || sub.customer_email}</p>
                  <p className="text-sm text-muted-foreground">{sub.plan_name} · ${sub.monthly_price}/mo</p>
                </div>
                <Badge className={statusColor(sub.subscription_status)}>{sub.subscription_status}</Badge>
              </div>
            ))
          )}
        </TabsContent>

        {/* PRODUCTS TAB */}
        <TabsContent value="products" className="mt-4 space-y-3">
          {products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No products configured yet.</p>
            </div>
          ) : (
            products.map(p => (
              <div key={p.id} className="glass rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-white font-semibold">{p.name}</p>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="capitalize">{p.package_type?.replace(/_/g, ' ')}</span>
                    {p.is_discount_active && p.sale_price > 0 ? (
                      <span>
                        <span className="text-white font-semibold">${p.sale_price}</span>
                        <span className="line-through ml-1">${p.msrp_price}</span>
                        <span className="text-green-400 ml-1">−${p.discount_amount}</span>
                      </span>
                    ) : (
                      <span className="text-white">${p.device_price}</span>
                    )}
                    {p.monthly_subscription_price > 0 && <span>+ ${p.monthly_subscription_price}/mo</span>}
                  </div>
                  {p.discount_label && p.is_discount_active && (
                    <p className="text-xs text-yellow-400 flex items-center gap-1"><Tag className="w-3 h-3" />{p.discount_label}</p>
                  )}
                  {p.requires_approved_host && (
                    <p className="text-xs text-yellow-400/70">Approved hosts only</p>
                  )}
                </div>
                <Badge className={p.is_active ? statusColor('active') : statusColor('cancelled')}>
                  {p.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Ship Dialog */}
      <Dialog open={!!shipOrder} onOpenChange={() => setShipOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Shipped — {shipOrder?.order_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Carrier</Label>
              <Input value={shipForm.carrier} onChange={e => setShipForm(p => ({ ...p, carrier: e.target.value }))} placeholder="UPS, FedEx, USPS…" />
            </div>
            <div className="space-y-1">
              <Label>Tracking Number</Label>
              <Input value={shipForm.tracking_number} onChange={e => setShipForm(p => ({ ...p, tracking_number: e.target.value }))} placeholder="Tracking number" />
            </div>
            <div className="flex gap-3">
              <Button onClick={markShipped} className="flex-1 gradient-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Mark Shipped'}
              </Button>
              <Button variant="outline" onClick={() => setShipOrder(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={!!refundOrder} onOpenChange={() => setRefundOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund Order — {refundOrder?.order_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {refundOrder?.fleet_partner_discount_applied && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400 space-y-1">
                <p className="font-semibold flex items-center gap-1"><Tag className="w-3 h-3" /> Fleet Partner Discount Order</p>
                <p>MSRP: ${((refundOrder.msrp_unit_price || 0) * (refundOrder.quantity || 1)).toFixed(2)} · Discount: −${refundOrder.total_discount_amount?.toFixed(2)}</p>
                <p className="font-semibold">Max refundable (paid amount): ${((refundOrder.total_amount || 0) - (refundOrder.refund_amount || 0)).toFixed(2)}</p>
              </div>
            )}
            <div className="p-3 rounded-lg bg-card/60 border border-border text-sm space-y-1">
              <p className="text-muted-foreground">Paid total: <span className="text-white">${refundOrder?.total_amount?.toFixed(2)}</span></p>
              {refundOrder?.refund_amount > 0 && (
                <p className="text-muted-foreground">Already refunded: <span className="text-red-400">${refundOrder.refund_amount?.toFixed(2)}</span></p>
              )}
              <p className="text-muted-foreground">Max refund: <span className="text-white font-semibold">${((refundOrder?.total_amount || 0) - (refundOrder?.refund_amount || 0)).toFixed(2)}</span></p>
            </div>
            <div className="space-y-1">
              <Label>Refund Amount ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={(refundOrder?.total_amount || 0) - (refundOrder?.refund_amount || 0)}
                value={refundForm.amount}
                onChange={e => setRefundForm(p => ({ ...p, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Select value={refundForm.reason} onValueChange={v => setRefundForm(p => ({ ...p, reason: v }))}>
                <SelectTrigger><SelectValue placeholder="Select reason…" /></SelectTrigger>
                <SelectContent>
                  {REFUND_REASONS.map(r => (
                    <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={submitRefund}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                disabled={refunding || !refundForm.amount || !refundForm.reason}
              >
                {refunding ? 'Processing…' : `Refund $${refundForm.amount}`}
              </Button>
              <Button variant="outline" onClick={() => setRefundOrder(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}