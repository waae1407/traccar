import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Package, Shield, Zap, RefreshCw, CheckCircle, AlertCircle, Edit, Truck, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";

const statusColor = (s) => {
  if (['active', 'activated', 'paid'].includes(s)) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (s === 'shipped') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (['pending_payment', 'processing'].includes(s)) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  if (['cancelled', 'failed', 'refunded'].includes(s)) return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-muted text-muted-foreground border-border';
};

export default function AdminGPSStore() {
  const { toast } = useToast();
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [shipForm, setShipForm] = useState({ tracking_number: '', carrier: '' });
  const [saving, setSaving] = useState(false);

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
    if (!selectedOrder) return;
    if (!shipForm.tracking_number.trim()) {
      toast({ title: 'Tracking number required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke('markGPSOrderShipped', {
        order_id: selectedOrder.id,
        tracking_number: shipForm.tracking_number.trim(),
        carrier: shipForm.carrier.trim(),
      });
      if (res.data?.error) {
        toast({ title: res.data.error, variant: 'destructive' });
      } else {
        toast({ title: 'Marked as shipped — customer emailed' });
        setSelectedOrder(null);
        setShipForm({ tracking_number: '', carrier: '' });
        await loadData();
      }
    } catch (e) {
      toast({ title: e.message || 'Failed to mark shipped', variant: 'destructive' });
    }
    setSaving(false);
  };

  const totalRevenue = orders.filter(o => o.payment_status === 'paid').reduce((s, o) => s + (o.total_amount || 0), 0);
  const pendingCount = orders.filter(o => o.order_status === 'paid' || o.order_status === 'processing').length;
  const backorderedCount = orders.filter(o => o.is_backordered && o.order_status !== 'cancelled' && o.order_status !== 'shipped').length;
  const activeSubscriptions = subscriptions.filter(s => s.subscription_status === 'active').length;

  const [stockEdit, setStockEdit] = useState(null);
  const [stockValue, setStockValue] = useState('');
  const [stockSaving, setStockSaving] = useState(false);

  const updateStock = async (productId, newCount) => {
    const count = parseInt(newCount, 10);
    if (isNaN(count) || count < 0) {
      toast({ title: 'Enter a valid stock number', variant: 'destructive' });
      return;
    }
    setStockSaving(true);
    try {
      const product = products.find(p => p.id === productId);
      const wasOutOfStock = (product?.inventory_count ?? 0) <= 0;
      await base44.entities.GPSProduct.update(productId, { inventory_count: count });
      await loadData();
      if (wasOutOfStock && count > 0) {
        const readyToShip = orders.filter(o => o.is_backordered && o.order_status !== 'cancelled' && o.order_status !== 'shipped');
        if (readyToShip.length > 0) {
          toast({
            title: `Stock restocked — ${readyToShip.length} backordered order${readyToShip.length > 1 ? 's' : ''} ready to ship`,
            description: readyToShip.map(o => o.order_number).join(', '),
            duration: 8000,
          });
        } else {
          toast({ title: 'Stock updated' });
        }
      } else {
        toast({ title: 'Stock updated' });
      }
      setStockEdit(null);
    } catch (e) {
      toast({ title: e.message || 'Failed to update stock', variant: 'destructive' });
    }
    setStockSaving(false);
  };

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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Orders", value: orders.length, color: "text-white" },
          { label: "Revenue (Paid)", value: `$${totalRevenue.toFixed(0)}`, color: "text-green-400" },
          { label: "Pending Fulfillment", value: pendingCount, color: "text-yellow-400" },
          { label: "Backordered", value: backorderedCount, color: "text-orange-400" },
          { label: "Active Subscriptions", value: activeSubscriptions, color: "text-primary" },
        ].map(k => (
          <div key={k.label} className="glass rounded-xl p-4 text-center">
            <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
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
            [...orders].sort((a, b) => {
              const aBackordered = a.is_backordered && a.order_status !== 'cancelled' && a.order_status !== 'shipped' ? 0 : 1;
              const bBackordered = b.is_backordered && b.order_status !== 'cancelled' && b.order_status !== 'shipped' ? 0 : 1;
              if (aBackordered !== bBackordered) return aBackordered - bBackordered;
              const aUnshipped = (a.order_status === 'paid' || a.order_status === 'processing') ? 0 : 1;
              const bUnshipped = (b.order_status === 'paid' || b.order_status === 'processing') ? 0 : 1;
              return aUnshipped - bUnshipped;
            }).map(order => (
              <div key={order.id} className={`glass rounded-xl p-5 space-y-3 ${order.is_backordered && order.order_status !== 'cancelled' && order.order_status !== 'shipped' ? 'border-orange-500/40' : ''}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-white font-bold">{order.order_number}</span>
                      <Badge className={statusColor(order.order_status)}>{order.order_status?.replace(/_/g, ' ')}</Badge>
                      <Badge className={statusColor(order.activation_status)} variant="outline">{order.activation_status?.replace(/_/g, ' ')}</Badge>
                      {order.is_backordered && order.order_status !== 'cancelled' && order.order_status !== 'shipped' && (
                        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                          <AlertTriangle className="w-3 h-3 mr-1" /> BACKORDERED
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-white">{order.customer_name} · {order.customer_email}</p>
                    <p className="text-xs text-muted-foreground capitalize">{order.package_type?.replace(/_/g, ' ')} · Qty {order.quantity} · ${order.total_amount?.toFixed(2)}</p>
                    {order.tracking_number && <p className="text-xs text-blue-400">{order.carrier}: {order.tracking_number}</p>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {(order.order_status === 'paid' || order.order_status === 'processing') && (
                      <Button size="sm" onClick={() => { setSelectedOrder(order); setShipForm({ tracking_number: '', carrier: '' }); }}>
                        <Truck className="w-3.5 h-3.5" /> Mark Shipped
                      </Button>
                    )}
                    {order.order_status === 'shipped' && (
                      <Button size="sm" variant="outline" onClick={() => updateOrderStatus(order.id, 'delivered')}>
                        <CheckCircle className="w-3.5 h-3.5" /> Mark Delivered
                      </Button>
                    )}
                    {order.order_status === 'pending_payment' && (
                      <Button size="sm" variant="outline" onClick={() => updateOrderStatus(order.id, 'paid')}>
                        Mark Paid
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
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
              <p className="text-xs mt-2">Products define the GPS packages available for purchase.</p>
            </div>
          ) : (
            products.map(p => (
              <div key={p.id} className="glass rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-white font-semibold">{p.name}</p>
                  <p className="text-sm text-muted-foreground capitalize">{p.package_type?.replace(/_/g, ' ')} · ${p.device_price}</p>
                  <p className="text-xs mt-1">
                    <span className={typeof p.inventory_count === 'number' && p.inventory_count <= 5 ? 'text-yellow-400 font-semibold' : 'text-muted-foreground'}>
                      {typeof p.inventory_count === 'number' ? `${p.inventory_count} in stock` : 'Stock not tracked'}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {stockEdit === p.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={stockValue}
                        onChange={e => setStockValue(e.target.value)}
                        className="w-20 h-8 text-center"
                        placeholder={String(p.inventory_count ?? 0)}
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') updateStock(p.id, stockValue);
                          if (e.key === 'Escape') setStockEdit(null);
                        }}
                      />
                      <Button size="sm" className="h-8" onClick={() => updateStock(p.id, stockValue)} disabled={stockSaving}>
                        {stockSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setStockEdit(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setStockEdit(p.id); setStockValue(String(p.inventory_count ?? 0)); }}
                    >
                      <Edit className="w-3 h-3" /> Edit Stock
                    </Button>
                  )}
                  <Badge className={p.is_active ? statusColor('active') : statusColor('cancelled')}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Ship Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Shipped — {selectedOrder?.order_number}</DialogTitle>
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
              <Button variant="outline" onClick={() => setSelectedOrder(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}