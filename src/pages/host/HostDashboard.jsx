import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { DollarSign, Car, Shield, TrendingUp, AlertTriangle, CheckCircle2, Clock, ArrowRight, Sparkles, Users, BarChart2, Wrench, ExternalLink, Rocket, Activity, Star } from "lucide-react";
import confetti from "canvas-confetti";
import OperationalEvidenceNudges from "@/components/host/reputation/OperationalEvidenceNudges";
import HostCoachingDashboard from "@/components/host/reputation/HostCoachingDashboard";
import PaymentOperationalAlertPanel from "@/components/payments/PaymentOperationalAlertPanel";
import TelematicsMap from "@/components/telematics/TelematicsMap";
import InstallerLocatorCTA from "@/components/installers/InstallerLocatorCTA";

const StatCard = ({ label, value, sub, icon: Icon, color, bg, href }) => {
  const inner = (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</p>
        <div className={`h-9 w-9 rounded-2xl flex items-center justify-center ${bg}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
      <p className="text-2xl font-black text-gray-900 leading-tight" style={{ fontFamily: "var(--font-syne)" }}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-2">{sub}</p>}
    </>
  );
  if (href) return (
    <Link to={href} className="block bg-white rounded-3xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97] transition-all">
      {inner}
    </Link>
  );
  return <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">{inner}</div>;
};

export default function HostDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host-profile", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({ queryKey: ["host-vehicles", host?.id], queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: gpsDevices = [], refetch: refetchGpsDevices } = useQuery({ queryKey: ["host-dashboard-gps", host?.id], queryFn: () => base44.entities.TelematicsDevice.filter({ host_id: host.id }), enabled: !!host?.id, refetchInterval: 60_000 });
  const { data: payouts = [] } = useQuery({ queryKey: ["host-payouts", host?.id], queryFn: () => base44.entities.HostPayout.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: compliance = [] } = useQuery({ queryKey: ["host-compliance", host?.id], queryFn: () => base44.entities.HostVehicleCompliance.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: bookings = [] } = useQuery({ queryKey: ["host-bookings", host?.id], queryFn: () => base44.entities.BookingRequest.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: maintenanceLogs = [] } = useQuery({ queryKey: ["host-maintenance-adoption", host?.id], queryFn: () => base44.entities.HostMaintenanceLog.filter({ host_id: host.id }, "-date", 300), enabled: !!host?.id });
  const { data: hostSignalSnapshots = [] } = useQuery({ queryKey: ["host-coaching-signals", host?.id], queryFn: () => base44.entities.ReputationSignalSnapshot.filter({ entity_type: "host", entity_id: host.id }, "-created_date", 20), enabled: !!host?.id });
  const { data: brandList = [] } = useQuery({ queryKey: ["host-brand", host?.id], queryFn: () => base44.entities.HostBrandSettings.filter({ host_id: host.id }), enabled: !!host?.id });

  const brand = brandList[0];
  const storeIsLive = brand?.published_status === "live";
  const storeUrl = brand?.business_slug ? `/host/${brand.business_slug}` : null;

  useEffect(() => {
    if (host?.status === "approved") {
      const key = `confetti_fired_${host.id}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        setTimeout(() => confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } }), 600);
      }
    }
  }, [host?.id, host?.status]);

  if (!host) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><Clock className="h-7 w-7 text-gray-400" /></div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Application Pending</h2>
      <p className="text-gray-500 text-sm max-w-sm">Your Fleet Partner application is under review. You'll receive an email once approved with your Stripe Connect onboarding link.</p>
    </div>
  );

  const pendingPayout = payouts.filter(p => p.status === "pending").reduce((s, p) => s + (p.net_payout || 0), 0);
  const totalEarned = payouts.filter(p => p.status === "paid").reduce((s, p) => s + (p.net_payout || 0), 0);
  const activeBookings = bookings.filter(b => ["active", "confirmed", "approved"].includes(b.booking_status));
  const expiringDocs = compliance.filter(c => c.status === "expiring_soon" || c.status === "expired");
  const availableVehicles = vehicles.filter(v => v.status === "Available").length;
  const rentedVehicles = vehicles.filter(v => ["Booked", "Active Rental", "Reserved", "Payment Due", "Grace Period"].includes(v.status)).length;
  const fleetUtilization = vehicles.length > 0 ? Math.round((rentedVehicles / vehicles.length) * 100) : 0;

  const onboardingSteps = [
    { id: 1, label: "Application approved", done: host.status === "approved", href: null, icon: CheckCircle2 },
    { id: 2, label: "Connect Stripe for payouts", done: !!host.stripe_onboarding_complete, href: "/host/payouts", icon: DollarSign, cta: "Connect →" },
    { id: 3, label: "Add your first vehicle", done: vehicles.length > 0, href: "/host/vehicles", icon: Car, cta: "Add Vehicle →" },
    { id: 4, label: "Upload compliance documents", done: compliance.length > 0, href: "/host/compliance", icon: Shield, cta: "Upload Docs →" },
    { id: 5, label: "Build your brand storefront", done: !!host.store_published, href: "/host/brand", icon: Sparkles, cta: "Build Store →" },
  ];
  const completedSteps = onboardingSteps.filter(s => s.done).length;
  const onboardingDone = completedSteps === onboardingSteps.length;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl overflow-hidden -mx-1" style={{ background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" }}>
        <div className="relative px-5 py-5">
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 80% 20%, hsl(338 90% 56% / 0.25) 0%, transparent 60%)" }} />
          <div className="relative z-10">
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">Fleet Partner Portal</p>
            <h1 className="text-2xl font-black text-white mb-1" style={{ fontFamily: "var(--font-syne)" }}>Welcome back, {host.full_name?.split(" ")[0]}!</h1>
            <p className="text-white/70 text-sm leading-snug">Your operator dashboard — everything in one place.</p>
          </div>
        </div>
      </div>

      <PaymentOperationalAlertPanel scope="host" hostId={host.id} limit={3} />

      <InstallerLocatorCTA
        source="host_dashboard"
        title="Find GPS Installers Near You"
        description="Locate GPS, alarm, and vehicle security installers near your fleet."
      />

      {/* Launch Card — shown until store is live */}
      {host.status === "approved" && !storeIsLive && (
        <button onClick={() => navigate("/host/brand")} className="w-full text-left rounded-3xl overflow-hidden relative group active:scale-[0.98] transition-all" style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #1a0533 100%)" }}>
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 70% 50%, hsl(338 90% 56% / 0.35) 0%, transparent 65%)" }} />
          <div className="relative z-10 px-6 py-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2"><span className="h-2 w-2 rounded-full bg-pink-400 animate-pulse" /><span className="text-pink-300 text-[10px] font-bold uppercase tracking-widest">You're Approved — Start Building</span></div>
                <h2 className="text-xl font-black text-white leading-tight mb-2" style={{ fontFamily: "var(--font-syne)" }}>Launch Your Car Rental Business Online — Free</h2>
                <p className="text-white/50 text-sm leading-relaxed mb-4">Design your branded storefront, list your vehicles, and start getting bookings — all in minutes.</p>
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white w-fit shadow-lg group-hover:scale-105 transition-transform" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}><Rocket className="h-4 w-4" /> Build My Store →</div>
              </div>
              <div className="flex-shrink-0 hidden sm:flex h-20 w-20 rounded-2xl items-center justify-center" style={{ background: "hsl(338 90% 56% / 0.15)", border: "1px solid hsl(338 90% 56% / 0.25)" }}><Sparkles className="h-10 w-10 text-pink-400" /></div>
            </div>
          </div>
        </button>
      )}

      {storeIsLive && storeUrl ? (
        <div className="flex items-center gap-4 p-4 rounded-2xl border border-emerald-200 bg-emerald-50">
          <div className="h-10 w-10 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div>
          <div className="flex-1 min-w-0"><p className="text-sm font-bold text-emerald-900">Your storefront is LIVE 🎉</p><p className="text-xs text-emerald-600 truncate">{window.location.origin}{storeUrl}</p><p className="text-xs text-emerald-600 mt-0.5">Share your link to start accepting bookings.</p></div>
          <a href={storeUrl} target="_blank" rel="noreferrer" className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-all"><ExternalLink className="h-3.5 w-3.5" /> View Store</a>
        </div>
      ) : host.status === "approved" && onboardingDone ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-gray-200 bg-gray-50"><div className="h-9 w-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0"><Rocket className="h-4 w-4 text-violet-600" /></div><div className="flex-1"><p className="text-sm font-bold text-gray-800">Complete setup to publish your storefront.</p><p className="text-xs text-gray-500">Go live to start receiving bookings from customers.</p></div><Link to="/host/brand" className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>Go Live →</Link></div>
      ) : null}

      {!onboardingDone && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-1"><h3 className="font-bold text-gray-900 text-sm">🚀 Get Started — {completedSteps}/{onboardingSteps.length} complete</h3><span className="text-xs font-bold text-pink-600">{Math.round((completedSteps / onboardingSteps.length) * 100)}%</span></div>
          <div className="h-1.5 rounded-full bg-gray-100 mb-4"><div className="h-full rounded-full transition-all" style={{ width: `${(completedSteps / onboardingSteps.length) * 100}%`, background: "linear-gradient(90deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} /></div>
          <div className="space-y-2">{onboardingSteps.map((step, i) => <div key={step.id} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${step.done ? "bg-emerald-50" : "bg-gray-50 border border-gray-100"}`}><div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${step.done ? "bg-emerald-500" : "bg-gray-200"}`}>{step.done ? <CheckCircle2 className="h-4 w-4 text-white" /> : <span className="text-xs font-bold text-gray-500">{i + 1}</span>}</div><p className={`text-sm flex-1 ${step.done ? "text-emerald-800 font-semibold" : "text-gray-700 font-medium"}`}>{step.label}</p>{step.done && <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full flex-shrink-0">Done</span>}{!step.done && step.href && <a href={step.href} className="text-xs font-bold px-3 py-1 rounded-lg text-white flex-shrink-0" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>{step.cta}</a>}</div>)}</div>
        </div>
      )}

      {!host.stripe_onboarding_complete && <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-yellow-200 bg-yellow-50"><div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" /><div><p className="text-sm font-bold text-yellow-900">Set Up Your Payouts</p><p className="text-xs text-yellow-700">Complete Stripe Connect onboarding to receive automatic fleet payouts.</p></div></div><Link to="/host/payouts" className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-yellow-800 bg-yellow-200 hover:bg-yellow-300 transition-all">Set Up →</Link></div>}

      {expiringDocs.length > 0 && <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-red-200 bg-red-50"><div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" /><div><p className="text-sm font-bold text-red-900">{expiringDocs.length} Document{expiringDocs.length > 1 ? "s" : ""} Need Attention</p><p className="text-xs text-red-700">Insurance or registration documents expiring soon.</p></div></div><Link to="/host/compliance" className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-red-800 bg-red-200 hover:bg-red-300 transition-all">View →</Link></div>}

      <HostCoachingDashboard snapshots={hostSignalSnapshots} />
      <OperationalEvidenceNudges maintenanceLogs={maintenanceLogs} compliance={compliance} activeBookings={activeBookings} vehicles={vehicles} />

      <TelematicsMap role="host" devices={gpsDevices} vehicles={vehicles} bookings={activeBookings} height={220} compact showFilters={false} refreshLabel="Refresh My Fleet" onRefresh={refetchGpsDevices} />

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Pending Payout" value={`$${pendingPayout.toLocaleString()}`} sub={pendingPayout === 0 ? "No payout pending" : "Next transfer scheduled"} icon={DollarSign} color="text-emerald-600" bg="bg-emerald-50" href="/host/payouts" />
        <StatCard label="Total Earned" value={`$${totalEarned.toLocaleString()}`} sub="All-time earnings" icon={TrendingUp} color="text-pink-600" bg="bg-pink-50" href="/host/payouts" />
        <StatCard label="Active Vehicles" value={vehicles.filter(v => ["Booked", "Active Rental", "Reserved", "Payment Due", "Grace Period"].includes(v.status)).length} sub="Available on storefront" icon={Car} color="text-blue-600" bg="bg-blue-50" href="/host/vehicles" />
        <StatCard label="Active Rentals" value={activeBookings.length} sub={activeBookings.length === 0 ? "No active rentals yet" : "Currently on the road"} icon={CheckCircle2} color="text-violet-600" bg="bg-violet-50" href="/host/payments" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4"><div><h3 className="font-bold text-gray-900 text-base">Fleet Health & Readiness</h3><p className="text-xs text-gray-500 mt-0.5">Operational readiness from vehicle status and compliance signals.</p></div><Link to="/host/vehicles" className="text-xs font-bold text-pink-600 flex items-center gap-1">Manage <ArrowRight className="h-3 w-3" /></Link></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3"><div className="rounded-2xl bg-blue-50 border border-blue-100 p-3"><p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Available</p><p className="text-xl font-black text-blue-700 mt-1">{availableVehicles}</p></div><div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3"><p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">In Use</p><p className="text-xl font-black text-emerald-700 mt-1">{rentedVehicles}</p></div><div className="rounded-2xl bg-violet-50 border border-violet-100 p-3"><p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider">Utilization</p><p className="text-xl font-black text-violet-700 mt-1">{fleetUtilization}%</p></div><div className="rounded-2xl bg-red-50 border border-red-100 p-3"><p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Docs Due</p><p className="text-xl font-black text-red-700 mt-1">{expiringDocs.length}</p></div></div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-2"><div><div className="flex items-center gap-2 mb-0.5"><h3 className="font-bold text-gray-900 text-base">Fleet Score</h3><span className="text-[10px] text-gray-400 border border-gray-200 rounded-full px-1.5 py-0.5 cursor-default" title="Based on compliance docs, payment readiness, vehicle availability, and customer satisfaction.">How is this calculated?</span></div><span className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>{host.fleet_score || 100}<span className="text-base text-gray-500 font-semibold">/100</span></span><p className={`text-[10px] font-bold mt-1 ${(host.fleet_score || 100) >= 80 ? "text-emerald-600" : "text-gray-600"}`}>{(host.fleet_score || 100) >= 80 ? "Excellent standing" : "Build your fleet to improve."}</p></div></div>
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-4"><div className="h-full rounded-full transition-all" style={{ width: `${host.fleet_score || 100}%`, background: "linear-gradient(90deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} /></div>
      </div>

      {activeBookings.length > 0 && <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"><div className="flex items-center justify-between mb-4"><h3 className="font-bold text-gray-900">Active Rentals</h3><Link to="/host/vehicles" className="text-xs font-semibold text-pink-600 hover:text-pink-700 flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link></div><div className="space-y-3">{activeBookings.slice(0, 5).map(b => <div key={b.id} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0"><div><p className="text-sm font-semibold text-gray-900">{b.vehicle_name}</p><p className="text-xs text-gray-500">{b.customer_full_name || b.user_email}</p></div><div className="text-right"><p className="text-sm font-bold text-emerald-600">${b.weekly_rate}/wk</p><p className="text-xs text-gray-500 capitalize">{b.booking_status}</p></div></div>)}</div></div>}

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Add Vehicle", sub: "List or manage inventory", href: "/host/vehicles", icon: Car, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "View Payouts", sub: "Track transfers & earnings", href: "/host/payouts", icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Brand Builder", sub: "Customize your storefront", href: "/host/brand", icon: Sparkles, color: "text-pink-600", bg: "bg-pink-50" },
          { label: "Reports & Exports", sub: "P&L reports and downloads", href: "/host/pnl", icon: BarChart2, color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Maintenance", sub: "Track service needs", href: "/host/maintenance", icon: Wrench, color: "text-orange-600", bg: "bg-orange-50" },
          { label: "Customers", sub: "Manage your renters", href: "/host/customers", icon: Users, color: "text-cyan-600", bg: "bg-cyan-50" },
        ].map(item => <Link key={item.href} to={item.href} className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white hover:border-pink-200 hover:shadow-sm transition-all group"><div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.bg}`}><item.icon className={`h-4 w-4 ${item.color}`} /></div><div className="min-w-0"><p className="text-sm font-semibold text-gray-800 group-hover:text-gray-900 transition-colors leading-snug">{item.label}</p><p className="text-[11px] text-gray-500 leading-snug mt-0.5">{item.sub}</p></div></Link>)}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4"><Activity className="h-4 w-4 text-gray-500" /><h3 className="font-bold text-gray-900 text-sm">Recent Activity</h3></div>
        {(() => {
          const events = [];
          if (storeIsLive) events.push({ icon: Star, color: "text-emerald-600", bg: "bg-emerald-100", text: "Storefront is live and accepting bookings", time: "Active" });
          if (host.stripe_onboarding_complete) events.push({ icon: DollarSign, color: "text-blue-600", bg: "bg-blue-100", text: "Stripe payouts connected", time: "Ready" });
          if (vehicles.length > 0) events.push({ icon: Car, color: "text-violet-600", bg: "bg-violet-100", text: `${vehicles.length} vehicle${vehicles.length > 1 ? "s" : ""} added to fleet`, time: `${vehicles.length} total` });
          if (activeBookings.length > 0) events.push({ icon: CheckCircle2, color: "text-pink-600", bg: "bg-pink-100", text: `${activeBookings.length} active rental${activeBookings.length > 1 ? "s" : ""} in progress`, time: "Live" });
          if (expiringDocs.length > 0) events.push({ icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-100", text: `${expiringDocs.length} compliance doc${expiringDocs.length > 1 ? "s" : ""} need attention`, time: "Action needed" });
          if (compliance.length > 0 && expiringDocs.length === 0) events.push({ icon: Shield, color: "text-emerald-600", bg: "bg-emerald-100", text: "Compliance documents up to date", time: "All clear" });
          if (events.length === 0) return <div className="text-center py-6"><div className="h-10 w-10 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3"><Activity className="h-5 w-5 text-gray-300" /></div><p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">Activity will appear here as rentals, payouts, and fleet actions update.</p></div>;
          return <div className="space-y-3">{events.map((ev, i) => <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0"><div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ev.bg}`}><ev.icon className={`h-4 w-4 ${ev.color}`} /></div><p className="text-sm text-gray-700 flex-1 leading-tight">{ev.text}</p><span className="text-[10px] font-semibold text-gray-500 flex-shrink-0 whitespace-nowrap ml-2">{ev.time}</span></div>)}</div>;
        })()}
      </div>
    </div>
  );
}