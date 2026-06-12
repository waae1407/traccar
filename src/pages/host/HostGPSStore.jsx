import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, MapPin, CheckCircle, Package, Zap, AlertCircle, ArrowRight } from 'lucide-react';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";
const PRODUCT_IMG = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/4f05d3221_29FB89C9-50E3-48A5-A76D-C33D086036D1.png";

export default function HostGPSStore() {
  const [vehicles, setVehicles] = useState([]);
  const [devices, setDevices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [myHost, setMyHost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const u = await base44.auth.me();
      const hosts = await base44.entities.Host.filter({ email: u.email });
      const hostByUser = await base44.entities.Host.filter({ user_id: u.id });
      const host = hosts[0] || hostByUser[0];
      if (!host) { setLoading(false); return; }
      setMyHost(host);
      const [vehs, devs, ords] = await Promise.all([
        base44.entities.Vehicle.filter({ host_id: host.id }),
        base44.entities.TelematicsDevice.filter({ host_id: host.id }),
        base44.entities.GPSOrder.filter({ host_id: host.id }, '-created_date', 20),
      ]);
      setVehicles(vehs);
      setDevices(devs);
      setOrders(ords);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const protectedCount = vehicles.filter(v => v.telematics_device_id || v.moovetrax_device_id || devices.some(d => d.vehicle_id === v.id)).length;
  const unprotectedCount = vehicles.length - protectedCount;
  const contactlessReady = vehicles.filter(v => v.contactless_pickup).length;

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading GPS Store…</div>;

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src={LOGO} alt="Contactless360" className="h-10 object-contain" />
          <div>
            <h1 className="text-2xl font-syne font-bold text-white">GPS Store</h1>
            <p className="text-sm text-muted-foreground">Order, activate, and manage Contactless360 GPS devices for your fleet</p>
          </div>
        </div>
      </div>

      {/* Fleet Protection Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Vehicles", value: vehicles.length, color: "text-white" },
          { label: "GPS Protected", value: protectedCount, color: "text-green-400" },
          { label: "Unprotected", value: unprotectedCount, color: "text-red-400" },
          { label: "Contactless Ready", value: contactlessReady, color: "text-yellow-400" },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-4 text-center">
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Unprotected Vehicles Alert */}
      {unprotectedCount > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-300 font-semibold text-sm">{unprotectedCount} vehicle{unprotectedCount > 1 ? 's' : ''} without GPS protection</p>
            <p className="text-red-400/70 text-xs mt-1">These vehicles cannot enable contactless rentals and have no theft recovery.</p>
          </div>
          <Link to="/gps/checkout?pkg=host_contactless_kit">
            <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white">Order Kits</Button>
          </Link>
        </div>
      )}

      {/* Packages */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Order GPS Devices</h2>
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Host Contactless Kit */}
          <div className="rounded-2xl border border-yellow-500/40 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 p-6 space-y-4 relative">
            <Badge className="bg-yellow-500 text-black font-bold text-xs">Recommended for Hosts</Badge>
            <div className="flex items-start gap-4">
              <img src={PRODUCT_IMG} alt="GPS Device" className="w-24 h-20 object-cover rounded-lg" />
              <div>
                <h3 className="font-syne font-bold text-white">Host Contactless Kit</h3>
                <p className="text-yellow-400 font-bold">$179 <span className="text-muted-foreground text-sm font-normal">+ $14.99/mo</span></p>
                <p className="text-sm text-muted-foreground mt-1">GPS + activation + contactless setup + rental readiness validation</p>
              </div>
            </div>
            <ul className="space-y-1.5">
              {["GPS Device Included", "Activation Included", "Vehicle Assignment", "Contactless Setup Checklist", "Command Test", "Rental Readiness Validation"].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-yellow-400" /> {f}
                </li>
              ))}
            </ul>
            <Link to="/gps/checkout?pkg=host_contactless_kit">
              <Button className="w-full gradient-primary glow-sm">Order Host Kit <ArrowRight className="w-4 h-4" /></Button>
            </Link>
          </div>

          {/* Device + Subscription */}
          <div className="rounded-2xl border border-border bg-card/60 p-6 space-y-4">
            <h3 className="font-syne font-bold text-white">Device + Subscription</h3>
            <div className="flex items-start gap-4">
              <img src={PRODUCT_IMG} alt="GPS Device" className="w-24 h-20 object-cover rounded-lg" />
              <div>
                <p className="text-white font-bold">$149 <span className="text-muted-foreground text-sm font-normal">+ $14.99/mo</span></p>
                <p className="text-sm text-muted-foreground mt-1">Full GPS tracking service. Buy multiple for your fleet.</p>
              </div>
            </div>
            <ul className="space-y-1.5">
              {["GPS Hardware Device", "Live Tracking Dashboard", "Geofence & Alerts", "Trip History", "Mobile App Access"].map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-primary" /> {f}
                </li>
              ))}
            </ul>
            <Link to="/gps/checkout?pkg=device_subscription">
              <Button className="w-full" variant="outline">Order Device <ArrowRight className="w-4 h-4" /></Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Unprotected Vehicle List */}
      {unprotectedCount > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Unprotected Vehicles</h2>
          <div className="space-y-2">
            {vehicles
              .filter(v => !v.telematics_device_id && !v.moovetrax_device_id && !devices.some(d => d.vehicle_id === v.id))
              .map(v => (
                <div key={v.id} className="glass rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white font-semibold">{v.year} {v.make} {v.model}</p>
                    <p className="text-xs text-muted-foreground">{v.plate || v.vin || 'No plate'} · {v.status}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/gps/checkout?pkg=host_contactless_kit&vehicle=${v.id}`}>
                      <Button size="sm" variant="outline"><Package className="w-3.5 h-3.5" /> Order Kit</Button>
                    </Link>
                    <Link to={`/gps/activate`}>
                      <Button size="sm" variant="ghost"><Zap className="w-3.5 h-3.5" /> Activate</Button>
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Existing Orders */}
      {orders.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Your GPS Orders</h2>
          <div className="space-y-2">
            {orders.map(o => (
              <div key={o.id} className="glass rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="font-mono text-white text-sm font-bold">{o.order_number}</span>
                  <p className="text-xs text-muted-foreground capitalize mt-0.5">{o.package_type?.replace(/_/g, ' ')} · {o.quantity}x</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-white font-semibold">${o.total_amount?.toFixed(2)}</span>
                  <Badge className="capitalize">{o.order_status?.replace(/_/g, ' ')}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Installer CTA */}
      <div className="glass rounded-2xl p-6 border border-primary/20 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-white">Need Professional Installation?</h3>
          <p className="text-sm text-muted-foreground mt-1">Find a certified Contactless360 installer near you.</p>
        </div>
        <Link to="/host/installers">
          <Button variant="outline">Find Installer</Button>
        </Link>
      </div>
    </div>
  );
}