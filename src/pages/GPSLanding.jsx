import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Shield, MapPin, Zap, Lock, Bell, Smartphone, Car, Building2, Users, Truck, CheckCircle, ArrowRight, Package, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { useAuth } from "@/lib/AuthContext";
import AccountMenu from "@/components/shared/AccountMenu";
import FleetEligibilityModal from '@/components/gps/FleetEligibilityModal';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";
const PRODUCT_IMG = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/4f05d3221_29FB89C9-50E3-48A5-A76D-C33D086036D1.png";

const features = [
  { icon: MapPin, title: "Live GPS Tracking", desc: "Real-time location updates, 24/7 monitoring from anywhere" },
  { icon: Shield, title: "Anti-Theft Protection", desc: "Instant geofence alerts and movement detection" },
  { icon: Zap, title: "Smart Immobilizer", desc: "Remotely disable your vehicle if it's stolen" },
  { icon: Bell, title: "Smart Alerts", desc: "Battery, smoke, movement, and tamper notifications" },
  { icon: Lock, title: "Contactless Rental Ready", desc: "Enable secure keyless rental handoffs" },
  { icon: Smartphone, title: "Mobile Dashboard", desc: "Full control from the uRideHub app" },
];

const audiences = [
  { icon: Car, title: "Personal Vehicle Owners", desc: "Protect your personal car with live tracking and theft alerts.", color: "from-yellow-500/20 to-yellow-600/10 border-yellow-500/30" },
  { icon: Building2, title: "uRide Hosts", desc: "Enable contactless rentals, track your fleet, and protect every vehicle.", color: "from-primary/20 to-primary/10 border-primary/30" },
  { icon: Truck, title: "Dealers & Finance Companies", desc: "Portfolio protection with GPS-verified vehicle locations and recovery.", color: "from-blue-500/20 to-blue-600/10 border-blue-500/30" },
  { icon: Users, title: "Fleet Operators", desc: "Manage large fleets with centralized tracking, alerts and reporting.", color: "from-green-500/20 to-green-600/10 border-green-500/30" },
];

// Canonical feature lists by package type (used when product.features is empty)
const FEATURE_MAP = {
  device_only: [
    "GPS + 4G Hardware",
    "Smart Immobilizer Capable",
    "Remote Lock/Unlock Capable",
    "Cigarette Smoke Sensor",
    "Vehicle Finder / Horn Control",
    "Geofence & Movement Alert Capable",
    "Backup Lithium Battery",
    "12-Month Warranty",
  ],
  device_subscription: [
    "Everything in Device Only",
    "Contactless360 Activation",
    "Live GPS Dashboard",
    "Remote Lock/Unlock",
    "Smart Immobilizer Controls",
    "Cigarette Smoke Alerts",
    "Geofence & Movement Alerts",
    "Trip History",
    "Low Battery Alerts",
    "Mobile Dashboard Access",
    "24/7 Monitoring",
  ],
  host_contactless_kit: [
    "Everything in Contactless360",
    "Fleet Vehicle Assignment",
    "Contactless Setup Checklist",
    "Command Test",
    "Rental Readiness Validation",
    "Fleet Dashboard Connection",
    "Priority Fleet Support",
    "12-Month Warranty",
  ],
};

const DESCRIPTION_MAP = {
  device_only: "Premium GPS anti-theft hardware with built-in capability for tracking, smoke detection, smart immobilizer, remote entry, vehicle finder, alerts, and trip history. Activate anytime on uRideHub.",
  device_subscription: "First full setup with hardware, activation, live monitoring, remote commands, alerts, and uRideHub dashboard access.",
  host_contactless_kit: "Discounted expansion kit for approved uRide Fleet Partners adding another protected vehicle after their first Contactless360 device is already active.",
};

const FOOTER_NOTE_MAP = {
  device_only: "Live dashboard, alerts, commands, and monitoring require Contactless360 activation.",
};

async function checkFleetEligibility(user) {
  if (!user) return { eligible: false, reason: 'NOT_LOGGED_IN' };

  const [byEmail, byUser] = await Promise.all([
    base44.entities.Host.filter({ email: user.email }),
    base44.entities.Host.filter({ user_id: user.id }),
  ]);
  const host = byEmail[0] || byUser[0];

  if (!host) return { eligible: false, reason: 'NOT_HOST' };
  if (host.status !== 'approved') return { eligible: false, reason: 'HOST_NOT_APPROVED', host_id: host.id };

  const [vehicles, devices] = await Promise.all([
    base44.entities.Vehicle.filter({ host_id: host.id, status: 'Available' }),
    base44.entities.TelematicsDevice.filter({ host_id: host.id, lifecycle_status: 'live_enabled' }),
  ]);

  if (!vehicles.length) return { eligible: false, reason: 'NO_ACTIVE_VEHICLE', host_id: host.id };
  if (!devices.length) return { eligible: false, reason: 'NO_ACTIVE_TELEMATICS_DEVICE', host_id: host.id, active_vehicle_count: vehicles.length };

  return {
    eligible: true,
    reason: 'ELIGIBLE',
    host_id: host.id,
    active_vehicle_count: vehicles.length,
    active_telematics_count: devices.length,
  };
}

function PackageCard({ product, user, onFleetKitClick }) {
  const isFleetKit = product.package_type === 'host_contactless_kit';
  const isDeviceOnly = product.package_type === 'device_only';
  const showDiscount = isFleetKit && product.is_discount_active && product.sale_price > 0;
  const displayPrice = showDiscount ? product.sale_price : product.device_price;
  const msrp = product.msrp_price || product.device_price;
  const featureList = product.features?.length ? product.features : (FEATURE_MAP[product.package_type] || []);
  const description = product.description || DESCRIPTION_MAP[product.package_type] || '';
  const footerNote = FOOTER_NOTE_MAP[product.package_type];

  return (
    <div className={`rounded-2xl border p-8 flex flex-col gap-5 relative ${isFleetKit ? 'border-yellow-500/60 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5' : 'border-border bg-card/50'}`}>
      {isFleetKit && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black font-bold text-xs px-4">
          Fleet Partner Exclusive
        </Badge>
      )}

      <div>
        <h3 className="text-lg font-syne font-bold text-white">{product.name}</h3>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
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
        {featureList.map(f => (
          <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      {footerNote && (
        <p className="text-xs text-muted-foreground/70 italic border-t border-border pt-3">{footerNote}</p>
      )}

      {isFleetKit ? (
        <div className="space-y-3">
          <p className="text-xs text-yellow-400/80 text-center">
            Available only to approved Fleet Partners with at least one active vehicle and one active Contactless360 device.
          </p>
          <Button className="w-full gradient-primary glow-sm" onClick={onFleetKitClick}>
            Check Eligibility <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <Link to={`/gps/checkout?pkg=${product.package_type}`}>
          <Button className="w-full" variant="outline">
            {isDeviceOnly ? 'Buy Device' : 'Buy + Activate'} <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      )}
    </div>
  );
}

export default function GPSLanding() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalReason, setModalReason] = useState(null);
  const [eligibilityData, setEligibilityData] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    base44.entities.GPSProduct.filter({ is_active: true, is_public: true }, 'sort_order', 10)
      .then(p => setProducts(p))
      .catch(() => {});
  }, []);

  const handleFleetKitClick = useCallback(async () => {
    setChecking(true);
    const result = await checkFleetEligibility(user).catch(() => ({ eligible: false, reason: 'NOT_LOGGED_IN' }));
    setChecking(false);

    // Log event
    base44.entities.ActivityEvent.create({
      event_type: result.eligible ? 'fleet_partner_kit_eligible' : 'fleet_partner_kit_ineligible',
      actor_email: user?.email || 'guest',
      actor_id: user?.id || 'guest',
      target_entity: 'GPSProduct',
      summary: `Fleet Kit eligibility check: ${result.reason}`,
      metadata: {
        user_email: user?.email || 'guest',
        host_id: result.host_id || '',
        reason: result.reason,
        active_vehicle_count: result.active_vehicle_count || 0,
        active_telematics_count: result.active_telematics_count || 0,
        package_type: 'host_contactless_kit',
        source_page: 'GPSLanding',
      },
      source: 'customer_app',
      event_status: result.eligible ? 'success' : 'blocked',
    }).catch(() => {});

    setEligibilityData(result);
    setModalReason(result.reason);
    setModalOpen(true);
  }, [user]);

  const sortedProducts = [...products].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur border-b border-border">
        <Link to="/"><img src={LOGO} alt="Contactless360" className="h-8 object-contain" /></Link>
        <div className="flex items-center gap-3">
          <Link to="/gps/activate"><Button variant="outline" size="sm">Activate Device</Button></Link>
          <Link to="/gps/checkout"><Button size="sm" className="gradient-primary">Buy Device</Button></Link>
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
              <Link to="/gps/checkout?pkg=device_subscription">
                <Button size="lg" className="gradient-primary glow-sm font-semibold">
                  <Package className="w-4 h-4" /> Buy + Activate
                </Button>
              </Link>
              <Link to="/gps/activate">
                <Button size="lg" variant="outline"><Zap className="w-4 h-4" /> Activate Device</Button>
              </Link>
              <Link to="/host/gps-store">
                <Button size="lg" variant="ghost">For Hosts <ArrowRight className="w-4 h-4" /></Button>
              </Link>
            </div>
            <div className="flex gap-6 pt-4">
              {["4G LTE", "12-Mo Warranty", "Global SIM", "24/7 Support"].map(t => (
                <div key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-yellow-400" /> {t}
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

      {/* PACKAGES */}
      <section className="py-24 max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-syne font-bold text-white mb-3">Choose Your Package</h2>
          <p className="text-muted-foreground">Hardware, tracking, and fleet expansion kits available.</p>
        </div>
        {sortedProducts.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {sortedProducts.map(p => (
              <PackageCard
                key={p.id}
                product={p}
                user={user}
                onFleetKitClick={handleFleetKitClick}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map(i => <div key={i} className="rounded-2xl border border-border bg-card/50 h-96" />)}
          </div>
        )}
        {checking && (
          <div className="text-center mt-6 text-sm text-muted-foreground">Checking eligibility…</div>
        )}
      </section>

      {/* CTA BANNER */}
      <section className="py-20 bg-gradient-to-r from-yellow-500/10 via-yellow-600/5 to-primary/10 border-y border-yellow-500/20">
        <div className="max-w-3xl mx-auto px-6 text-center space-y-6">
          <img src={LOGO} alt="Contactless360" className="h-12 mx-auto object-contain" />
          <h2 className="text-3xl font-syne font-bold text-white">Ready to protect your vehicle?</h2>
          <p className="text-muted-foreground">Join thousands of drivers using Contactless360 GPS protection.</p>
          <div className="flex justify-center gap-4 flex-wrap">
            <Link to="/gps/checkout?pkg=device_subscription">
              <Button size="lg" className="gradient-primary glow-sm">Buy + Activate</Button>
            </Link>
            <Link to="/gps/activate">
              <Button size="lg" variant="outline">Activate Existing Device</Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-8 text-center text-muted-foreground text-sm border-t border-border">
        <p>© 2026 Contactless360 by uRideHub. All rights reserved.</p>
      </footer>

      <FleetEligibilityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        reason={modalReason}
        eligibilityData={eligibilityData}
      />
    </div>
  );
}