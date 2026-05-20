import React from "react";
import { Link } from "react-router-dom";
import { Car, Home, Fingerprint, MapPin, CreditCard, CalendarDays } from "lucide-react";

export default function HomeHero() {
  return (
    <div className="relative" style={{ background: "linear-gradient(160deg, hsl(338 90% 56%) 0%, hsl(265 80% 55%) 60%, hsl(240 70% 45%) 100%)" }}>
      <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-15" style={{ background: "radial-gradient(circle, white 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
      <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-10" style={{ background: "radial-gradient(circle, white 0%, transparent 70%)", transform: "translate(-30%, 30%)" }} />

      <div className="max-w-3xl mx-auto px-5 pt-12 pb-14 text-center relative z-10">
        <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-5">
          Contactless weekly rentals powered by independent fleet partners
        </p>

        <h1 className="text-3xl sm:text-5xl font-black text-white leading-[1.1] mb-4" style={{ fontFamily: "var(--font-syne)" }}>
          Get on the road fast.<br />
          <span className="opacity-80">Or build your own rental fleet.</span>
        </h1>

        <p className="text-white/75 text-sm sm:text-base leading-relaxed max-w-lg mx-auto mb-8">
          uRideHub connects drivers with weekly rental vehicles while giving fleet owners, dealerships, and auto shops their own contactless rental storefront.
        </p>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-9">
          {[
            { icon: Fingerprint, label: "Contactless pickup" },
            { icon: MapPin, label: "GPS-protected vehicles" },
            { icon: CreditCard, label: "Stripe-powered payouts" },
            { icon: CalendarDays, label: "Weekly rentals" },
          ].map((b, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-white text-[11px] font-semibold">
              <b.icon className="h-3.5 w-3.5" /> {b.label}
            </span>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/book-now"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-white text-gray-900 font-bold text-sm shadow-lg hover:shadow-xl transition-all">
            <Car className="h-4 w-4" /> I Need a Vehicle
          </Link>
          <Link to="/become-a-host"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl border-2 border-white/40 text-white font-bold text-sm hover:bg-white/10 transition-all">
            <Home className="h-4 w-4" /> Become a Fleet Partner
          </Link>
        </div>
      </div>

      {/* Wave */}
      <div className="h-4 relative">
        <svg viewBox="0 0 375 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute bottom-0 w-full" preserveAspectRatio="none">
          <path d="M0 16L375 16L375 4C300 14 180 1 0 10L0 16Z" fill="white"/>
        </svg>
      </div>
    </div>
  );
}