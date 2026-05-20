import React from "react";
import { Link } from "react-router-dom";
import { Car, Home, ArrowRight, CalendarDays, Fingerprint, ShieldCheck, Zap, Palette, MapPin, CreditCard, BarChart2 } from "lucide-react";

const DRIVER_BULLETS = [
  { icon: CalendarDays, text: "Flexible rental periods" },
  { icon: Fingerprint, text: "Contactless pickup options" },
  { icon: ShieldCheck, text: "Verified fleet partners" },
  { icon: Zap, text: "Fast online booking" },
];

const HOST_BULLETS = [
  { icon: Palette, text: "Branded storefront page" },
  { icon: Fingerprint, text: "Contactless rental tools" },
  { icon: MapPin, text: "GPS and remote vehicle controls" },
  { icon: CreditCard, text: "Stripe Connect payouts" },
];

export default function HomePathCards() {
  return (
    <div className="space-y-4">
      {/* Driver Card */}
      <Link to="/book-now"
        className="block w-full rounded-2xl shadow-lg overflow-hidden relative"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
        <div className="absolute right-0 top-0 bottom-0 w-40 opacity-20" style={{ background: "radial-gradient(circle at 100% 50%, white 0%, transparent 70%)" }} />
        <div className="relative z-10 p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                <Car className="h-4 w-4 text-white" />
              </div>
              <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider">For Drivers</span>
            </div>
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
              <ArrowRight className="h-4 w-4 text-white" />
            </div>
          </div>

          <h2 className="text-xl font-black text-white mt-3 mb-1" style={{ fontFamily: "var(--font-syne)", textShadow: "0 1px 6px rgba(0,0,0,0.2)" }}>I Need a Car</h2>
          <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.92)" }}>Find rental vehicles for rideshare, delivery, work, or personal use.</p>

          <div className="space-y-2 mb-4">
            {DRIVER_BULLETS.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <b.icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.82)" }} />
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.90)" }}>{b.text}</span>
              </div>
            ))}
          </div>

          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/20 text-white text-xs font-bold">
            Browse Vehicles <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </Link>

      {/* Host Card */}
      <Link to="/become-a-host"
        className="block w-full rounded-2xl shadow-lg overflow-hidden relative"
        style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #1a1040 100%)" }}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 80% 20%, hsl(265 80% 62% / 0.4) 0%, transparent 60%)" }} />
        <div className="relative z-10 p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center">
                <Home className="h-4 w-4 text-white" />
              </div>
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">For Fleet Partners</span>
            </div>
            <div className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center">
              <ArrowRight className="h-4 w-4 text-white" />
            </div>
          </div>

          <h2 className="text-xl font-black mt-3 mb-1" style={{ fontFamily: "var(--font-syne)", color: "rgba(255,255,255,0.95)", textShadow: "0 1px 6px rgba(0,0,0,0.2)" }}>I Own Vehicles</h2>
          <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.88)" }}>Launch your own rental storefront and turn idle vehicles into recurring income.</p>

          <div className="space-y-2 mb-4">
            {HOST_BULLETS.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <b.icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.72)" }} />
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.86)" }}>{b.text}</span>
              </div>
            ))}
          </div>

          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/15 text-white text-xs font-bold">
            Become a Fleet Partner <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </Link>
    </div>
  );
}