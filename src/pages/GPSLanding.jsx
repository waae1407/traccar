import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, MapPin, Zap, Lock, Bell, Smartphone, Car, Building2, Users, Truck, CheckCircle, Star, ArrowRight, Package, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { useAuth } from "@/lib/AuthContext";
import AccountMenu from "@/components/shared/AccountMenu";

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";
const PRODUCT_IMG = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/4f05d3221_29FB89C9-50E3-48A5-A76D-C33D086036D1.png";

const features = [
  { icon: MapPin, title: "Live GPS Tracking", desc: "Real-time location updates, 24/7 monitoring from anywhere" },
  { icon: Shield, title: "Anti-Theft Protection", desc: "Instant geofence alerts and movement detection" },
  { icon: Zap, title: "Remote Starter Interrupt", desc: "Immobilize your vehicle remotely if it's stolen" },
  { icon: Bell, title: "Smart Alerts", desc: "Battery disconnect, movement, and tamper notifications" },
  { icon: Lock, title: "Contactless Rental Ready", desc: "Enable secure keyless rental handoffs" },
  { icon: Smartphone, title: "Mobile Dashboard", desc: "Full control from the uRideHub app" },
];

const audiences = [
  { icon: Car, title: "Personal Vehicle Owners", desc: "Protect your personal car with live tracking and theft alerts.", color: "from-yellow-500/20 to-yellow-600/10 border-yellow-500/30" },
  { icon: Building2, title: "uRide Hosts", desc: "Enable contactless rentals, track your fleet, and protect every vehicle.", color: "from-primary/20 to-primary/10 border-primary/30" },
  { icon: Truck, title: "Dealers & Finance Companies", desc: "Portfolio protection with GPS-verified vehicle locations and recovery.", color: "from-blue-500/20 to-blue-600/10 border-blue-500/30" },
  { icon: Users, title: "Fleet Operators", desc: "Manage large fleets with centralized tracking, alerts and reporting.", color: "from-green-500/20 to-green-600/10 border-green-500/30" },
];

// Map package_type to feature list display order
const FEATURE_MAP = {
  device_only: ["GPS Hardware Device", "12-Month Warranty", "Standard Shipping Included", "Optional: Activate on uRideHub"],
  device_subscription: ["GPS Hardware Device", "Live Tracking Dashboard", "Geofence & Movement Alerts", "Trip History", "Mobile App Access", "24/7 Monitoring", "12-Month Warranty"],
  host_contactless_kit: ["GPS Device Included", "Activation Included", "Vehicle Assignment", "Contactless Setup Checklist", "Command Test", "Rental Readiness Validation", "Priority Support"],
};

const CTA_MAP = {
  device_only: "Buy Device",
  device_subscription: "Buy + Activate",
  host_contactless_kit: "Order as Fleet Partner",
};

function PackageCard({ product, isApprovedHost }) {
  const isFleetKit = product.package_type === 'host_contactless_kit';
  const showDiscount = isFleetKit && product.is_discount_active && product.sale_price > 0;
  const displayPrice = showDiscount ? product.sale_price : product.device_price;
  const msrp = product.msrp_price || product.device_price;
  const features = product.features?.length ? product.features : (FEATURE_MAP[product.package_type] || []);
  const cta = CTA_MAP[product.package_type] || 'Order Now';
  const href = `/gps/checkout?pkg=${product.package_type}`;

  return (
    <div className={`rounded-2xl border p-8 flex flex-col gap-5 relative ${isFleetKit ? 'border-yellow-500/60 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5' : 'border-border bg-card/50'}`}>
      {isFleetKit && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black font-bold text-xs px-4">
          Fleet Partner Exclusive
        </Badge>
      )}
      <div>
        <h3 className="text-lg font-syne font-bold text-white">{product.name}</h3>
        <p className="text-sm text-muted-foreground mt-1">{product.description}</p>
      </div>
      <div className="space-y-1">
        {showDiscount ? (
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-black text-white">${displayPrice}</span>
            <span className="text-xl text-muted-foreground line-through">${msrp}</span>
          </div>
        ) : (
          <span className="text-4xl font-black text-white">${displayPrice}</span>
        )}
        {product.monthly_subscription_price > 0 && (
          <p className="text-sm text-muted-foreground">+ ${product.monthly_subscription_price}/mo</p>
        )}
        {showDiscount && (
          <div className="flex items-center gap-2 mt-1">
            <Tag className="w-3.5 h-3.5 text-green-400" />
            <span className="text-sm text-green-400 font-semibold">Save ${product.discount_amount} — {product.discount_label}</span>
          </div>
        )}
      </div>
      <ul className="space-y-2 flex-1">
        {features.map(f => (
          <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      {isFleetKit ? (
        <div className="space-y-3">
          <p className="text-xs text-yellow-400/80 text-center">Available only to approved uRide Fleet Partners.</p>
          {isApprovedHost ? (
            <Link to={href}>
              <Button className="w-full gradient-primary glow-sm">
                {cta} <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          ) : (
            <div className="space-y-2">
              <Link to="/become-a-host">
                <Button className="w-full" variant="outline">
                  Become a Fleet Partner <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/account">
                <Button className="w-full" variant="ghost" size="sm">Log In as Fleet Partner</Button>
              </Link>
            </div>
          )}
        </div>
      ) : (
        <Link to={href}>
          <Button className="w-full" variant="outline">
            {cta} <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      )}
    </div>
  );
}

export default function GPSLanding() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [isApprovedHost, setIsApprovedHost] = useState(false);

  useEffect(() => {
    base44.entities.GPSProduct.filter({ is_active: true, is_public: true }, 'sort_order', 10)
      .then(p => setProducts(p))
      .catch(() => {});

    if (user) {
      Promise.all([
        base44.entities.Host.filter({ email: user.email }),
        base44.entities.Host.filter({ user_id: user.id }),
      ]).then(([byEmail, byUser]) => {
        const host = byEmail[0] || byUser[0];
        setIsApprovedHost(host?.status === 'approved');
      }).catch(() => {});
    }
  }, [user]);

  // Sort: device_only, device_subscription, host_contactless_kit
  const sortedProducts = [...products].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur border-b border-border">
        <Link to="/">
          <img src={LOGO} alt="Contactless360" className="h-8 object-contain" />
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/gps/activate">
            <Button variant="outline" size="sm">Activate Device</Button>
          </Link>
          <Link to="/gps/checkout">
            <Button size="sm" className="gradient-primary">Buy Device</Button>
          </Link>
          {user
            ? <AccountMenu role={user.role === "admin" ? "admin" : user.role === "host" ? "host" : "user"} accountPath="/customer/gps" extraItems={[{ label: "My GPS", icon: MapPin, path: "/customer/gps" }]} compact />
            : <Link to="/account"><Button variant="ghost" size="sm">Sign In</Button></Link>
          }
        </div>
      </nav>

      {/* HERO */}
      <section className="relative pt-24 pb-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-background to-primary/5 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center min-h-[90vh]">
          <div className="space-y-6 z-10">
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs font-semibold tracking-wider">
              GPS • ANTI-THEFT • CONTACTLESS RENTAL READY
            </Badge>
            <h1 className="text-5xl lg:text-7xl font-syne font-black leading-none">
              <span className="text-white">Protect.</span><br />
              <span className="gradient-text">Track.</span><br />
              <span className="text-white">Control.</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-md leading-relaxed">
              Premium GPS protection for personal vehicles, rental fleets, dealers, and contactless rentals.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/gps/checkout">
                <Button size="lg" className="gradient-primary glow-sm font-semibold">
                  <Package className="w-4 h-4" />
                  Buy Device
                </Button>
              </Link>
              <Link to="/gps/activate">
                <Button size="lg" variant="outline">
                  <Zap className="w-4 h-4" />
                  Activate Device
                </Button>
              </Link>
              <Link to="/host/gps-store">
                <Button size="lg" variant="ghost">
                  For Hosts <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
            <div className="flex gap-6 pt-4">
              {["4G LTE", "12-Mo Warranty", "Global SIM", "24/7 Support"].map(t => (
                <div key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-yellow-400" />
                  {t}
                </div>
              ))}
            </div>
          </div>
          <div className="relative flex items-center justify-center z-10">
            <div className="absolute inset-0 bg-yellow-500/10 rounded-full blur-3xl scale-75" />
            <img src={PRODUCT_IMG} alt="Contactless360 GPS Device" className="relative w-full max-w-2xl object-contain drop-shadow-2xl" />
          </div>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-syne font-bold text-white mb-3">Built for Every Driver</h2>
          <p className="text-muted-foreground">Contactless360 protects vehicles across every use case.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {audiences.map((a) => (
            <div key={a.title} className={`rounded-2xl border bg-gradient-to-br p-6 space-y-3 ${a.color}`}>
              <a.icon className="w-8 h-8 text-yellow-400" />
              <h3 className="font-semibold text-white">{a.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24 bg-card/40 border-y border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-syne font-bold text-white mb-3">Smart Features That Matter</h2>
            <p className="text-muted-foreground">Everything you need to protect and manage your vehicles.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="glass rounded-2xl p-6 space-y-3 glass-hover">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-yellow-400" />
                </div>
                <h3 className="font-semibold text-white">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PACKAGES — DB-driven */}
      <section className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-syne font-bold text-white mb-3">Choose Your Package</h2>
          <p className="text-muted-foreground">Hardware, tracking, and full host kits available.</p>
        </div>
        {sortedProducts.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {sortedProducts.map(p => (
              <PackageCard key={p.id} product={p} isApprovedHost={isApprovedHost} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
            {[1,2,3].map(i => <div key={i} className="rounded-2xl border border-border bg-card/50 h-96" />)}
          </div>
        )}
      </section>

      {/* CTA BANNER */}
      <section className="py-20 bg-gradient-to-r from-yellow-500/10 via-yellow-600/5 to-primary/10 border-y border-yellow-500/20">
        <div className="max-w-3xl mx-auto px-6 text-center space-y-6">
          <img src={LOGO} alt="Contactless360" className="h-12 mx-auto object-contain" />
          <h2 className="text-3xl font-syne font-bold text-white">Ready to protect your vehicle?</h2>
          <p className="text-muted-foreground">Join thousands of drivers using Contactless360 GPS protection.</p>
          <div className="flex justify-center gap-4 flex-wrap">
            <Link to="/gps/checkout">
              <Button size="lg" className="gradient-primary glow-sm">Order Now</Button>
            </Link>
            <Link to="/gps/activate">
              <Button size="lg" variant="outline">Activate Existing Device</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-8 text-center text-muted-foreground text-sm border-t border-border">
        <p>© 2026 Contactless360 by uRideHub. All rights reserved.</p>
      </footer>
    </div>
  );
}