import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Shield, Zap, Package, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";

export default function CustomerGPS() {
  const [orders, setOrders] = useState([]);
  const [devices, setDevices] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const u = await base44.auth.me();
      setUser(u);
      const [ords, subs] = await Promise.all([
        base44.entities.GPSOrder.filter({ customer_email: u.email }, '-created_date', 20),
        base44.entities.GPSSubscription.filter({ customer_user_id: u.id }, '-created_date', 20),
      ]);
      setOrders(ords);
      setSubscriptions(subs);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const statusColor = (s) => {
    if (s === 'active' || s === 'activated') return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (s === 'shipped') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (s === 'pending_payment' || s === 'processing') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-muted text-muted-foreground border-border';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" /> Loading GPS portal…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={LOGO} alt="Contactless360" className="h-8 object-contain" />
            <div>
              <h1 className="text-xl font-syne font-bold text-white">My GPS Devices</h1>
              <p className="text-sm text-muted-foreground">Manage your Contactless360 protection</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/gps/activate"><Button variant="outline" size="sm"><Zap className="w-4 h-4" /> Activate</Button></Link>
            <Link to="/gps/checkout"><Button size="sm" className="gradient-primary"><Package className="w-4 h-4" /> Buy Device</Button></Link>
          </div>
        </div>

        {/* ORDERS */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Your Orders</h2>
          {orders.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center space-y-4">
              <Shield className="w-12 h-12 text-yellow-400 mx-auto" />
              <p className="text-muted-foreground">No GPS orders yet.</p>
              <Link to="/gps/checkout">
                <Button className="gradient-primary">Order a Device</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map(order => (
                <div key={order.id} className="glass rounded-xl p-5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-white text-sm font-bold">{order.order_number}</span>
                      <Badge className={statusColor(order.order_status)}>{order.order_status?.replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground capitalize">{order.package_type?.replace(/_/g, ' ')} — {order.quantity}x device</p>
                    {order.tracking_number && (
                      <p className="text-xs text-blue-400">{order.carrier}: {order.tracking_number}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-white font-semibold">${order.total_amount?.toFixed(2)}</p>
                    <Badge className={statusColor(order.activation_status)}>
                      {order.activation_status === 'activated' ? (
                        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Activated</span>
                      ) : 'Not Activated'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SUBSCRIPTIONS */}
        {subscriptions.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Active Subscriptions</h2>
            <div className="space-y-3">
              {subscriptions.map(sub => (
                <div key={sub.id} className="glass rounded-xl p-5 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">{sub.plan_name}</p>
                    <p className="text-sm text-muted-foreground">${sub.monthly_price}/month</p>
                  </div>
                  <Badge className={statusColor(sub.subscription_status)}>{sub.subscription_status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA if no orders */}
        {orders.length === 0 && (
          <div className="glass rounded-2xl p-8 border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-yellow-600/3 text-center space-y-4">
            <Shield className="w-10 h-10 text-yellow-400 mx-auto" />
            <h3 className="font-syne font-bold text-white">Protect Your Vehicle with Contactless360</h3>
            <p className="text-muted-foreground text-sm">Live GPS tracking, geofence alerts, and theft recovery starting at $149.</p>
            <Link to="/gps">
              <Button className="gradient-primary">Explore GPS Plans</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}