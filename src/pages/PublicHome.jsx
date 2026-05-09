import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Car, Home, ArrowRight, Zap, Star, Shield, TrendingUp } from "lucide-react";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

export default function PublicHome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === "admin") navigate("/dashboard", { replace: true });
    else if (user?.role === "host") navigate("/host/dashboard", { replace: true });
    else if (user) navigate("/book-now", { replace: true });
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "var(--font-inter)" }}>
      {/* NAV */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-lg mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={LOGO_ICON} alt="uRide" className="h-7 w-7 rounded-lg object-cover" />
            <span className="font-black text-gray-900 text-base tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>uRide</span>
          </div>
          <button
            onClick={() => base44.auth.redirectToLogin(window.location.href)}
            className="px-4 py-1.5 rounded-full text-sm font-bold text-white shadow-sm"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
          >
            Sign In
          </button>
        </div>
      </header>

      {/* HERO */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(160deg, hsl(338 90% 56%) 0%, hsl(265 80% 55%) 60%, hsl(240 70% 45%) 100%)" }}>
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-20" style={{ background: "radial-gradient(circle, white 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10" style={{ background: "radial-gradient(circle, white 0%, transparent 70%)", transform: "translate(-30%, 30%)" }} />

        <div className="max-w-lg mx-auto px-5 pt-10 pb-12 text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold mb-5">
            <Zap className="h-3 w-3" /> Powered by Stripe Connect
          </div>
          <h1 className="text-4xl font-black text-white leading-[1.1] mb-4" style={{ fontFamily: "var(--font-syne)" }}>
            Get a Car<br />in Minutes.<br />
            <span className="opacity-75 text-3xl">Drive &amp; Earn Today.</span>
          </h1>
          <p className="text-white/80 text-sm leading-relaxed max-w-xs mx-auto mb-8">
            Weekly rentals for gig drivers. Passive income for fleet owners. One unified platform.
          </p>

          {/* Trust row */}
          <div className="flex items-center justify-center gap-4 text-white/80 text-xs">
            {["4.9★ rated", "No credit check", "Cancel anytime"].map((t, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-white/30">·</span>}
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Wave divider */}
        <div className="h-8 relative">
          <svg viewBox="0 0 375 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full" preserveAspectRatio="none">
            <path d="M0 32L375 32L375 8C300 28 180 2 0 20L0 32Z" fill="white"/>
          </svg>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="max-w-lg mx-auto px-4 pb-16 mt-4">

        {/* Primary CTA */}
        <Link to="/book-now"
          className="flex items-center justify-between w-full p-5 rounded-2xl mb-3 shadow-lg overflow-hidden relative"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          {/* bg decoration */}
          <div className="absolute right-0 top-0 bottom-0 w-32 opacity-20" style={{ background: "radial-gradient(circle at 100% 50%, white 0%, transparent 70%)" }} />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-7 w-7 rounded-lg bg-white/20 flex items-center justify-center">
                <Car className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-xs font-bold text-white/80 uppercase tracking-wider">For Drivers</span>
            </div>
            <h2 className="text-xl font-black text-white" style={{ fontFamily: "var(--font-syne)" }}>I Need a Car</h2>
            <p className="text-white/70 text-xs mt-1">On the road in 24 hrs · No credit check</p>
            <div className="flex gap-2 mt-3">
              {["$0 deposit", "Uber ready", "RTO available"].map(tag => (
                <span key={tag} className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-semibold">{tag}</span>
              ))}
            </div>
          </div>
          <div className="relative z-10 h-10 w-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <ArrowRight className="h-5 w-5 text-white" />
          </div>
        </Link>

        {/* Host card */}
        <Link to="/become-a-host"
          className="flex items-center justify-between w-full p-5 rounded-2xl mb-3 shadow-lg overflow-hidden relative"
          style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #1a1040 100%)" }}>
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 80% 20%, hsl(265 80% 62% / 0.4) 0%, transparent 60%), radial-gradient(ellipse at 10% 90%, hsl(152 60% 40% / 0.3) 0%, transparent 50%)" }} />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-7 w-7 rounded-lg bg-white/15 flex items-center justify-center">
                <Home className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-xs font-bold text-white/60 uppercase tracking-wider">For Fleet Owners</span>
            </div>
            <h2 className="text-xl font-black" style={{ fontFamily: "var(--font-syne)", color: "hsl(265 60% 85%)" }}>I Own Vehicles</h2>
            <p className="text-white/60 text-xs mt-1">We handle renters · You keep 80%</p>
            <div className="flex gap-2 mt-3">
              {["80% revenue", "Auto payouts", "AV-ready"].map(tag => (
                <span key={tag} className="px-2 py-0.5 rounded-full bg-white/15 text-white/90 text-[10px] font-semibold">{tag}</span>
              ))}
            </div>
          </div>
          <div className="relative z-10 h-10 w-10 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
            <ArrowRight className="h-5 w-5 text-white" />
          </div>
        </Link>

        {/* Admin card — hidden from public, accessible directly at /dashboard */}

        {/* Stats strip */}
        <div className="rounded-2xl overflow-hidden mb-6" style={{ background: "linear-gradient(135deg, hsl(222 28% 10%), hsl(265 40% 15%))" }}>
          <div className="grid grid-cols-3 divide-x divide-white/10">
            {[
              { value: "80%", label: "You keep", sub: "per rental" },
              { value: "2 days", label: "Payout speed", sub: "via Stripe" },
              { value: "1099-K", label: "Tax auto", sub: "Stripe files it" },
            ].map((s, i) => (
              <div key={i} className="px-3 py-4 text-center">
                <p className="text-lg font-black text-white leading-none" style={{ fontFamily: "var(--font-syne)" }}>{s.value}</p>
                <p className="text-[10px] font-semibold text-white/60 mt-1">{s.label}</p>
                <p className="text-[9px] text-white/30">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Feature pills */}
        <div className="mb-6">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Why uRide?</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: Shield, label: "Verified Renters", desc: "ID & income checks", color: "text-blue-600", bg: "bg-blue-50" },
              { icon: Zap, label: "Instant Setup", desc: "Live in 24 hours", color: "text-yellow-600", bg: "bg-yellow-50" },
              { icon: TrendingUp, label: "AV-Ready Fleet", desc: "Future-proof your cars", color: "text-violet-600", bg: "bg-violet-50" },
              { icon: Star, label: "4.9★ Platform", desc: "Trusted by hundreds", color: "text-pink-600", bg: "bg-pink-50" },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${f.bg}`}>
                  <f.icon className={`h-4 w-4 ${f.color}`} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900">{f.label}</p>
                  <p className="text-[10px] text-gray-400">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <Link to="/book-now"
          className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-bold text-white text-sm shadow-md mb-4"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Browse Available Cars <ArrowRight className="h-4 w-4" />
        </Link>

        {/* Footer */}
        <div className="flex items-center justify-center gap-4 text-xs text-gray-300 pt-2">
          <Link to="/privacy" className="hover:text-gray-500 transition-colors">Privacy</Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-gray-500 transition-colors">Terms</Link>
          <span>·</span>
          <span>© {new Date().getFullYear()} uRide</span>
        </div>
      </div>
    </div>
  );
}