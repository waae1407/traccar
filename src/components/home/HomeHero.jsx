import React from "react";
import { Link } from "react-router-dom";
import { Car, Building2, MapPin, CreditCard, Fingerprint, Shield, CheckCircle2 } from "lucide-react";

const TRUST_CHECKS = [
  "GPS-monitored vehicles",
  "Verified fleet partners",
  "Secure Stripe payouts",
  "Contactless rentals",
];

export default function HomeHero() {
  return (
    <div className="relative overflow-hidden"
      style={{ background: "linear-gradient(160deg, hsl(338 90% 48%) 0%, hsl(265 80% 45%) 55%, hsl(240 70% 35%) 100%)" }}>

      {/* Background grid pattern for tech feel */}
      <div className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "32px 32px"
        }} />

      {/* Glow orbs */}
      <div className="absolute top-0 right-0 w-80 h-80 rounded-full"
        style={{ background: "radial-gradient(circle, hsl(338 90% 70% / 0.25) 0%, transparent 70%)", transform: "translate(25%, -25%)" }} />
      <div className="absolute bottom-0 left-0 w-56 h-56 rounded-full"
        style={{ background: "radial-gradient(circle, hsl(265 80% 70% / 0.2) 0%, transparent 70%)", transform: "translate(-25%, 25%)" }} />

      {/* Fleet status bar — gives operational feel */}
      <div className="relative z-10 border-b border-white/10">
        <div className="max-w-3xl mx-auto px-5 py-2 flex items-center gap-4 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="h-3 w-3 rounded-full bg-emerald-200 animate-pulse shadow-lg" style={{ boxShadow: "0 0 16px rgba(187, 247, 208, 1), 0 0 8px rgba(134, 239, 172, 0.9)" }} />
            <span className="text-white text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#ffffff", textShadow: "0 2px 6px rgba(0,0,0,0.5)" }}>Fleet Operations Platform</span>
          </div>
          <div className="h-3 w-px bg-white/15 flex-shrink-0" />
          <div className="flex items-center gap-3 flex-shrink-0">
            {["GPS Tracking", "Remote Controls", "Stripe Connect"].map((t, i) => (
              <span key={i} className="text-white text-[10px] font-medium flex items-center gap-1" style={{ color: "#ffffff", textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
                <span className="h-1.5 w-1.5 rounded-full bg-white/70" />{t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 pt-10 pb-12 text-center relative z-10">

        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/16 border border-white/24 backdrop-blur-sm mb-6">
          <Shield className="h-3 w-3 text-white" style={{ color: "rgba(255,255,255,0.92)" }} />
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: "rgba(255,255,255,0.92)" }}>
            Flexible rental options · Independent fleet partners
          </span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-black text-white leading-[1.05] mb-4 tracking-tight"
          style={{ fontFamily: "var(--font-syne)", textShadow: "0 2px 12px rgba(0,0,0,0.25)" }}>
          Get on the road fast.
          <br />
          <span style={{ color: "rgba(255,255,255,0.92)" }}>Or build your rental fleet.</span>
        </h1>

        <p style={{ color: "rgba(255,255,255,0.92)" }} className="text-sm sm:text-base leading-relaxed max-w-md mx-auto mb-8">
          uRideHub connects drivers with rental vehicles while giving fleet owners, dealerships, and auto shops their own contactless rental storefront.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
          <Link to="/book-now"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white text-gray-900 font-bold text-sm shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
            <Car className="h-4 w-4" /> I Need a Vehicle
          </Link>
          <Link to="/become-a-host"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white text-gray-900 font-bold text-sm shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all ring-2 ring-white/25">
            <Building2 className="h-4 w-4" /> Start a Rental Fleet
          </Link>
        </div>

        {/* Operational trust row */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {TRUST_CHECKS.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-white text-[11px] font-semibold" style={{ color: "rgba(255,255,255,0.92)" }}>
              <CheckCircle2 className="h-3 w-3 text-emerald-300 flex-shrink-0" style={{ color: "rgb(134, 239, 172)" }} />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Wave */}
      <div className="h-5 relative">
        <svg viewBox="0 0 375 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full" preserveAspectRatio="none">
          <path d="M0 20L375 20L375 5C300 18 180 1 0 12L0 20Z" fill="white"/>
        </svg>
      </div>
    </div>
  );
}