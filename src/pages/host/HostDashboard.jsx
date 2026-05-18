import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { DollarSign, Car, Shield, TrendingUp, AlertTriangle, CheckCircle2, Clock, Zap, ArrowRight, Sparkles, Users, BarChart2, Wrench, ExternalLink, Rocket } from "lucide-react";
import confetti from "canvas-confetti";

const StatCard = ({ label, value, sub, icon: Icon, color, bg, href }) => {
  const inner = (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
        <div className={`h-9 w-9 rounded-2xl flex items-center justify-center ${bg}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
      <p className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
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

  const { data: vehicles = [] } = useQuery({
    queryKey: ["host-vehicles", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ["host-payouts", host?.id],
    queryFn: () => base44.entities.HostPayout.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: compliance = [] } = useQuery({
    queryKey: ["host-compliance", host?.id],
    queryFn: () => base44.entities.HostVehicleCompliance.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["host-bookings", host?.id],
    queryFn: () => base44.entities.BookingRequest.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: brandList = [] } = useQuery({
    queryKey: ["host-brand", host?.id],
    queryFn: () => base44.entities.HostBrandSettings.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });
  const brand = brandList[0];
  const storeIsLive = brand?.published_status === "live";
  const storeUrl = brand?.business_slug ? `/host/${brand.business_slug}` : null;

  // Fire confetti once on first approval visit
  useEffect(() => {
    if (host?.status === "approved") {
      const key = `confetti_fired_${host.id}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        setTimeout(() => {
          confetti({ particleCount: 150, spread: 80, origin: { y: 0.5 } });
        }, 600);
      }
    }
  }, [host?.id, host?.status]);

  const pendingPayout = payouts.filter(p => p.status === "pending").reduce((s, p) => s + (p.net_payout || 0), 0);
  const totalEarned = payouts.filter(p => p.status === "paid").reduce((s, p) => s + (p.net_payout || 0), 0);
  const activeBookings = bookings.filter(b => ["active", "confirmed", "approved"].includes(b.booking_status));
  const expiringDocs = compliance.filter(c => c.status === "expiring_soon" || c.status === "expired");

  if (!host) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <Clock className="h-7 w-7 text-gray-400" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Application Pending</h2>
      <p className="text-gray-400 text-sm max-w-sm">Your host application is under review. You'll receive an email once approved with your Stripe Connect onboarding link.</p>
    </div>
  );

  // Onboarding checklist steps
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
      {/* Premium header */}
      <div className="rounded-3xl overflow-hidden -mx-1" style={{ background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" }}>
        <div className="relative px-6 py-6">
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 80% 20%, hsl(338 90% 56% / 0.25) 0%, transparent 60%)" }} />
          <div className="relative z-10">
            <p className="text-white/50 text-xs font-bold uppercase tracking-wider mb-1">Host Portal</p>
            <h1 className="text-2xl font-black text-white mb-1" style={{ fontFamily: "var(--font-syne)" }}>
              Welcome back, {host.full_name?.split(" ")[0]}!
            </h1>
            <p className="text-white/50 text-sm">Here's your fleet performance</p>
          </div>
        </div>
      </div>

      {/* 🚀 Launch Card — shown until store is live */}
      {host.status === "approved" && !storeIsLive && (
        <button
          onClick={() => navigate("/host/brand")}
          className="w-full text-left rounded-3xl overflow-hidden relative group active:scale-[0.98] transition-all"
          style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #1a0533 100%)" }}
        >
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 70% 50%, hsl(338 90% 56% / 0.35) 0%, transparent 65%)" }} />
          <div className="relative z-10 px-6 py-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-2 w-2 rounded-full bg-pink-400 animate-pulse" />
                  <span className="text-pink-300 text-[10px] font-bold uppercase tracking-widest">You're Approved — Start Building</span>
                </div>
                <h2 className="text-xl font-black text-white leading-tight mb-2" style={{ fontFamily: "var(--font-syne)" }}>
                  Launch Your Car Rental Business Online — Free
                </h2>
                <p className="text-white/50 text-sm leading-relaxed mb-4">
                  Design your branded storefront, list your vehicles, and start getting bookings — all in minutes.
                </p>
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white w-fit shadow-lg group-hover:scale-105 transition-transform"
                  style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                  <Rocket className="h-4 w-4" /> Build My Store →
                </div>
              </div>
              <div className="flex-shrink-0 hidden sm:flex h-20 w-20 rounded-2xl items-center justify-center"
                style={{ background: "hsl(338 90% 56% / 0.15)", border: "1px solid hsl(338 90% 56% / 0.25)" }}>
                <Sparkles className="h-10 w-10 text-pink-400" />
              </div>
            </div>
          </div>
        </button>
      )}

      {/* 🎉 Store is Live Banner */}
      {storeIsLive && storeUrl && (
        <div className="flex items-center gap-4 p-4 rounded-2xl border border-emerald-200 bg-emerald-50">
          <div className="h-10 w-10 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-emerald-900">Your store is LIVE 🎉</p>
            <p className="text-xs text-emerald-600">{window.location.origin}{storeUrl}</p>
          </div>
          <a href={storeUrl} target="_blank" rel="noreferrer"
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-all">
            <ExternalLink className="h-3.5 w-3.5" /> View Store
          </a>
        </div>
      )}

      {/* Onboarding Checklist — hidden once all steps complete */}
      {!onboardingDone && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-gray-900 text-sm">🚀 Get Started — {completedSteps}/{onboardingSteps.length} complete</h3>
            <span className="text-xs font-bold text-pink-600">{Math.round((completedSteps / onboardingSteps.length) * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 mb-4">
            <div className="h-full rounded-full transition-all" style={{ width: `${(completedSteps / onboardingSteps.length) * 100}%`, background: "linear-gradient(90deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} />
          </div>
          <div className="space-y-2">
            {onboardingSteps.map((step, i) => (
              <div key={step.id} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${step.done ? "bg-emerald-50" : "bg-gray-50 border border-gray-100"}`}>
                <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${step.done ? "bg-emerald-500" : "bg-gray-200"}`}>
                  {step.done ? <CheckCircle2 className="h-4 w-4 text-white" /> : <span className="text-xs font-bold text-gray-500">{i + 1}</span>}
                </div>
                <p className={`text-sm flex-1 ${step.done ? "text-emerald-700 font-semibold line-through decoration-emerald-300" : "text-gray-700 font-medium"}`}>{step.label}</p>
                {!step.done && step.href && (
                  <a href={step.href} className="text-xs font-bold px-3 py-1 rounded-lg text-white flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                    {step.cta}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts */}
      {!host.stripe_onboarding_complete && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-yellow-200 bg-yellow-50">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-yellow-800">Set Up Your Payouts</p>
              <p className="text-xs text-yellow-600">Complete Stripe Connect onboarding to receive automatic payouts</p>
            </div>
          </div>
          <Link to="/host/payouts" className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-yellow-800 bg-yellow-200 hover:bg-yellow-300 transition-all">
            Set Up →
          </Link>
        </div>
      )}

      {expiringDocs.length > 0 && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-red-200 bg-red-50">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-800">{expiringDocs.length} Document{expiringDocs.length > 1 ? "s" : ""} Need Attention</p>
              <p className="text-xs text-red-600">Insurance or registration documents expiring soon</p>
            </div>
          </div>
          <Link to="/host/compliance" className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-red-800 bg-red-200 hover:bg-red-300 transition-all">
            View →
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Pending Payout" value={`$${pendingPayout.toLocaleString()}`} sub="Next transfer" icon={DollarSign} color="text-emerald-600" bg="bg-emerald-50" href="/host/payouts" />
        <StatCard label="Total Earned" value={`$${totalEarned.toLocaleString()}`} sub="All time" icon={TrendingUp} color="text-pink-600" bg="bg-pink-50" href="/host/payouts" />
        <StatCard label="Active Vehicles" value={vehicles.filter(v => v.status === "Booked" || v.status === "Available").length} sub={`of ${vehicles.length} total`} icon={Car} color="text-blue-600" bg="bg-blue-50" href="/host/vehicles" />
        <StatCard label="Active Rentals" value={activeBookings.length} sub="Operators on road" icon={CheckCircle2} color="text-violet-600" bg="bg-violet-50" href="/host/payments" />
      </div>

      {/* Fleet Score */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-gray-900">Fleet Score</h3>
            <p className="text-xs text-gray-400">Compliance, payments & satisfaction</p>
          </div>
          <span className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>{host.fleet_score || 100}<span className="text-base text-gray-400 font-semibold">/100</span></span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${host.fleet_score || 100}%`, background: "linear-gradient(90deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} />
        </div>
      </div>

      {/* Active Rentals */}
      {activeBookings.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Active Rentals</h3>
            <Link to="/host/vehicles" className="text-xs font-semibold text-pink-600 hover:text-pink-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {activeBookings.slice(0, 5).map(b => (
              <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{b.vehicle_name}</p>
                  <p className="text-xs text-gray-400">{b.customer_full_name || b.user_email}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-emerald-600">${b.weekly_rate}/wk</p>
                  <p className="text-xs text-gray-400 capitalize">{b.booking_status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Add Vehicle", href: "/host/vehicles", icon: Car, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "View Payouts", href: "/host/payouts", icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Brand Builder", href: "/host/brand", icon: Sparkles, color: "text-pink-600", bg: "bg-pink-50" },
          { label: "Reports", href: "/host/reports", icon: BarChart2, color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Maintenance", href: "/host/maintenance", icon: Wrench, color: "text-orange-600", bg: "bg-orange-50" },
          { label: "Customers", href: "/host/customers", icon: Users, color: "text-teal-600", bg: "bg-teal-50" },
        ].map(item => (
          <Link key={item.href} to={item.href}
            className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 bg-white hover:border-pink-200 hover:shadow-sm transition-all group">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${item.bg}`}>
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </div>
            <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition-colors">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}