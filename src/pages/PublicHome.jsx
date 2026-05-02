import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Car, Home, Settings, ArrowRight, Zap, Shield, TrendingUp, ChevronRight } from "lucide-react";

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
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "var(--font-inter)" }}>
      {/* Top Nav — matches CustomerTopBar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="w-full max-w-2xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={LOGO_ICON} alt="uRide" className="h-8 w-8 rounded-xl object-cover" />
            <span className="font-bold text-gray-900 text-lg tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>
              uRide
            </span>
          </div>
          <button
            onClick={() => base44.auth.redirectToLogin(window.location.href)}
            className="px-4 py-2 rounded-full text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
          >
            Sign In
          </button>
        </div>
      </header>

      <main className="w-full max-w-2xl mx-auto pb-12">
        {/* Hero */}
        <div className="px-5 pt-8 pb-6 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-50 border border-pink-100 text-pink-600 text-xs font-semibold mb-4">
            <Zap className="h-3 w-3" /> Powered by Stripe Connect
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-3 leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
            The Future of<br />
            <span style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Vehicle Monetization
            </span>
          </h1>
          <p className="text-gray-400 text-sm max-w-xs mx-auto leading-relaxed">
            Rent, own, or deploy your fleet. uRide connects operators, hosts, and admins on one platform.
          </p>
        </div>

        {/* Profile Cards */}
        <div className="px-4 space-y-3">
          {/* Renter Card */}
          <Link to="/book-now" className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-all active:scale-[0.99]">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                <Car className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-900 text-base">I Need a Car</h2>
                  <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                </div>
                <p className="text-xs font-semibold text-pink-600 mb-2">Renter / Operator</p>
                <p className="text-sm text-gray-500 leading-relaxed mb-3">
                  Weekly rentals and rent-to-own programs. No credit check. Get on the road in 24 hours.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["$0 deposit", "Uber & Lyft ready", "Rent-to-Own", "Cancel anytime"].map(tag => (
                    <span key={tag} className="px-2.5 py-1 rounded-full bg-pink-50 text-pink-600 text-xs font-semibold">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </Link>

          {/* Host Card */}
          <Link to="/become-a-host" className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-all active:scale-[0.99]">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-emerald-500">
                <Home className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-900 text-base">I Own Vehicles</h2>
                  <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                </div>
                <p className="text-xs font-semibold text-emerald-600 mb-2">Host / Fleet Owner</p>
                <p className="text-sm text-gray-500 leading-relaxed mb-3">
                  Turn your vehicles into passive income. We handle renters and payments — you keep 80%.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["80% revenue", "Auto payouts", "AV-ready", "We handle renters"].map(tag => (
                    <span key={tag} className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-semibold">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </Link>

          {/* Admin Card */}
          <Link to="/dashboard" className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-all active:scale-[0.99]">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-violet-500">
                <Settings className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-900 text-base">Platform Admin</h2>
                  <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
                </div>
                <p className="text-xs font-semibold text-violet-600 mb-2">uRide Staff</p>
                <p className="text-sm text-gray-500 leading-relaxed mb-3">
                  Full platform control — hosts, renters, vehicles, payouts, compliance, and analytics.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Host approvals", "Payouts", "CRM", "Reports"].map(tag => (
                    <span key={tag} className="px-2.5 py-1 rounded-full bg-violet-50 text-violet-600 text-xs font-semibold">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Stats */}
        <div className="mx-4 mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="grid grid-cols-3 gap-4 text-center divide-x divide-gray-100">
            {[
              { label: "You keep", value: "80%", sub: "Platform takes 20%" },
              { label: "Payout speed", value: "2 days", sub: "Via Stripe Connect" },
              { label: "Tax auto", value: "1099-K", sub: "Stripe handles it" },
            ].map((s, i) => (
              <div key={i} className="px-2">
                <p className="text-lg font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>{s.value}</p>
                <p className="text-xs font-semibold text-gray-700 mt-0.5">{s.label}</p>
                <p className="text-[10px] text-gray-400">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="px-4 mt-4">
          <Link to="/book-now" className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-bold text-white text-sm shadow-sm"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            Browse Available Cars <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-4 px-5 pt-6 pb-2 text-xs text-gray-400">
          <Link to="/privacy" className="hover:text-gray-600 transition-colors">Privacy</Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-gray-600 transition-colors">Terms</Link>
          <span>·</span>
          <span>© {new Date().getFullYear()} uRide</span>
        </div>
      </main>
    </div>
  );
}