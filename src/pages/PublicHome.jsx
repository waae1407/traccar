import React, { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Car, Home, Settings, ArrowRight, Zap, Shield, TrendingUp } from "lucide-react";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const ProfileCard = ({ icon: Icon, title, subtitle, description, bullets, cta, href, gradient, iconBg }) => (
  <Link to={href} className="group relative flex flex-col rounded-3xl border border-white/10 p-8 hover:border-white/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl overflow-hidden"
    style={{ background: "hsl(222 24% 11%)" }}>
    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
      style={{ background: gradient }} />
    <div className={`relative h-14 w-14 rounded-2xl flex items-center justify-center mb-6`} style={{ background: iconBg }}>
      <Icon className="h-7 w-7 text-white" />
    </div>
    <h2 className="relative text-2xl font-bold text-white mb-1 font-syne">{title}</h2>
    <p className="relative text-sm font-semibold mb-3" style={{ color: "hsl(338 90% 65%)" }}>{subtitle}</p>
    <p className="relative text-white/50 text-sm leading-relaxed mb-6">{description}</p>
    <ul className="relative space-y-2 mb-8 flex-1">
      {bullets.map((b, i) => (
        <li key={i} className="flex items-center gap-2 text-sm text-white/60">
          <div className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
          {b}
        </li>
      ))}
    </ul>
    <div className="relative flex items-center gap-2 text-sm font-bold text-white group-hover:gap-3 transition-all">
      {cta} <ArrowRight className="h-4 w-4" />
    </div>
  </Link>
);

export default function PublicHome() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === "admin") navigate("/dashboard", { replace: true });
    else if (user?.role === "host") navigate("/host/dashboard", { replace: true });
    else if (user) navigate("/book-now", { replace: true });
  }, [user, navigate]);

  return (
    <div className="min-h-screen text-white" style={{ background: "hsl(222 28% 7%)" }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <img src={LOGO_ICON} alt="uRide" className="h-8 w-8 rounded-full" />
          <span className="font-bold text-lg font-syne">uRide</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => base44.auth.redirectToLogin(window.location.href)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white/60 hover:text-white transition-colors">
            Sign In
          </button>
          <Link to="/book-now" className="px-4 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="text-center px-6 pt-16 pb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold mb-6">
          <Zap className="h-3 w-3" /> Fleet Platform · Powered by Stripe Connect
        </div>
        <h1 className="text-4xl md:text-6xl font-black mb-4 font-syne leading-tight">
          The Future of<br />
          <span className="gradient-text">Vehicle Monetization</span>
        </h1>
        <p className="text-white/40 text-lg max-w-xl mx-auto">
          Rent, own, or deploy your fleet. uRide connects operators, hosts, and administrators on one unified platform.
        </p>
      </div>

      {/* 3 Profile Cards */}
      <div className="max-w-6xl mx-auto px-6 pb-16 grid md:grid-cols-3 gap-6">
        <ProfileCard
          icon={Car}
          title="I Need a Car"
          subtitle="Renter / Operator"
          description="Weekly rentals and rent-to-own programs. No credit check. Get on the road in 24 hours."
          bullets={[
            "$0 security deposit",
            "Uber & Lyft ready vehicles",
            "Rent-to-Own — drive toward ownership",
            "Cancel anytime, no commitment",
          ]}
          cta="Browse Available Vehicles"
          href="/book-now"
          gradient="radial-gradient(ellipse at top left, hsl(338 90% 56% / 0.12) 0%, transparent 60%)"
          iconBg="linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))"
        />
        <ProfileCard
          icon={Home}
          title="I Own Vehicles"
          subtitle="Host / Fleet Owner"
          description="Turn your vehicles into passive income. We handle the renters, payments, and compliance — you just collect 80%."
          bullets={[
            "80% of every rental goes directly to you",
            "Stripe Connect — automated payouts",
            "We manage renters, you manage your fleet",
            "AV-ready infrastructure for the future",
          ]}
          cta="Become a Host"
          href="/become-a-host"
          gradient="radial-gradient(ellipse at top left, hsl(152 60% 46% / 0.12) 0%, transparent 60%)"
          iconBg="linear-gradient(135deg, hsl(152 60% 46%), hsl(199 90% 54%))"
        />
        <ProfileCard
          icon={Settings}
          title="Platform Admin"
          subtitle="uRide Staff"
          description="Full platform control — manage hosts, renters, vehicles, payouts, compliance, and analytics."
          bullets={[
            "Host approval & onboarding",
            "Automated payout oversight",
            "Fleet compliance monitoring",
            "Full CRM & reporting suite",
          ]}
          cta="Go to Dashboard"
          href="/dashboard"
          gradient="radial-gradient(ellipse at top left, hsl(265 80% 62% / 0.12) 0%, transparent 60%)"
          iconBg="linear-gradient(135deg, hsl(265 80% 62%), hsl(199 90% 54%))"
        />
      </div>

      {/* Stats bar */}
      <div className="border-t border-white/[0.06] px-6 py-8">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
          {[
            { label: "Platform Commission", value: "20%", sub: "You keep 80%" },
            { label: "Payout Speed", value: "2 Days", sub: "Via Stripe Connect" },
            { label: "Tax Automation", value: "1099-K", sub: "Stripe handles it" },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-2xl font-black gradient-text font-syne">{s.value}</p>
              <p className="text-sm font-semibold text-white/70 mt-1">{s.label}</p>
              <p className="text-xs text-white/30">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-white/40">
        <p>© {new Date().getFullYear()} uRide. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
        </div>
      </footer>
    </div>
  );
}