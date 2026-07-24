import React from "react";
import { Link } from "react-router-dom";
import { Car, Building2, CheckCircle2 } from "lucide-react";
import HomeSearchBar from "./HomeSearchBar";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=2000&q=80";

const TRUST_CHECKS = [
  "GPS-monitored vehicles",
  "Verified fleet partners",
  "Secure Stripe payouts",
  "Contactless rentals",
];

export default function HomeHero() {
  return (
    <section className="relative min-h-[88vh] flex flex-col overflow-hidden bg-black">
      {/* Full-bleed cinematic vehicle image */}
      <img
        src={HERO_IMAGE}
        alt="uRideHub rental fleet"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Cinematic dark gradient — keeps copy legible like PS game banners */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(2,6,23,0.55) 0%, rgba(2,6,23,0.35) 35%, rgba(2,6,23,0.85) 78%, #02061f 100%)",
        }}
      />
      {/* Magenta accent glow (brand) */}
      <div
        className="absolute -top-24 right-0 h-[28rem] w-[28rem] rounded-full"
        style={{
          background:
            "radial-gradient(circle, hsl(338 90% 60% / 0.28) 0%, transparent 70%)",
        }}
      />

      {/* Top status strip */}
      <div className="relative z-10 border-b border-white/10 backdrop-blur-sm bg-black/20">
        <div className="max-w-5xl mx-auto px-5 py-2.5 flex items-center gap-4 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className="h-2.5 w-2.5 rounded-full bg-emerald-300 animate-pulse"
              style={{ boxShadow: "0 0 14px rgba(110,231,183,0.9)" }}
            />
            <span className="text-white text-[10px] font-semibold uppercase tracking-[0.18em]">
              Fleet Operations Platform
            </span>
          </div>
          <div className="h-3 w-px bg-white/15 flex-shrink-0" />
          {["GPS Tracking", "Remote Controls", "Stripe Connect"].map((t, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 text-white/80 text-[10px] font-medium tracking-wide flex-shrink-0"
            >
              <span className="h-1 w-1 rounded-full bg-white/60" />
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Hero copy — PlayStation-style: oversized, minimal, bottom-anchored */}
      <div className="relative z-10 flex-1 flex items-end">
        <div className="max-w-5xl mx-auto px-5 pb-12 pt-16 w-full">
          <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-white/70 mb-5 animate-fade-in-up">
            Drive · Earn · Automate
          </p>

          <h1
            className="text-5xl sm:text-7xl font-black text-white leading-[0.95] tracking-tight mb-6 animate-fade-in-up"
            style={{ fontFamily: "var(--font-syne)", textShadow: "0 4px 30px rgba(0,0,0,0.5)" }}
          >
            Get on the road.
            <br />
            <span className="gradient-text">Or build your fleet.</span>
          </h1>

          <p className="text-base sm:text-lg text-white/80 leading-relaxed max-w-xl mb-8 animate-fade-in-up">
            uRideHub connects drivers with rental vehicles — and gives fleet
            owners, dealerships, and auto shops their own contactless rental
            storefront.
          </p>

          {/* Search — glass pill, floats above cinematic bg */}
          <div className="mb-8 max-w-2xl">
            <HomeSearchBar />
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-start gap-3 mb-10">
            <Link
              to="/book-now"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white text-gray-900 font-bold text-sm shadow-2xl hover:scale-[1.03] transition-transform"
            >
              <Car className="h-4 w-4" /> I Need a Vehicle
            </Link>
            <Link
              to="/become-a-host"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-full font-semibold text-sm text-white border border-white/30 bg-white/5 backdrop-blur-md hover:bg-white/15 transition-colors"
            >
              <Building2 className="h-4 w-4" /> Become a Fleet Partner
            </Link>
          </div>

          {/* Trust row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {TRUST_CHECKS.map((t, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 text-white/85 text-[11px] font-semibold"
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-300 flex-shrink-0" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}