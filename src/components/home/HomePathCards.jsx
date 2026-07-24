import React from "react";
import { Link } from "react-router-dom";
import {
  Car, Home, ArrowRight, CalendarDays, Fingerprint, ShieldCheck,
  Zap, Palette, MapPin, CreditCard,
} from "lucide-react";

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

function GlassCard({ to, badge, badgeTone, icon: Icon, title, desc, bullets, cta, glow }) {
  return (
    <Link
      to={to}
      className="block w-full rounded-3xl overflow-hidden relative glass glass-hover p-6 transition-all"
    >
      {glow && (
        <div
          className="absolute -top-16 -right-16 h-48 w-48 rounded-full pointer-events-none"
          style={{ background: glow }}
        />
      )}
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
              <Icon className="h-4 w-4 text-white" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
              {badge}
            </span>
          </div>
          <div className="h-9 w-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
            <ArrowRight className="h-4 w-4 text-white" />
          </div>
        </div>

        <h2
          className="text-2xl font-black text-white mb-1.5"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          {title}
        </h2>
        <p className="text-sm text-white/65 mb-5 leading-relaxed">{desc}</p>

        <div className="space-y-2.5 mb-5">
          {bullets.map((b, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <b.icon className="h-4 w-4 flex-shrink-0" style={{ color: badgeTone }} />
              <span className="text-sm text-white/80">{b.text}</span>
            </div>
          ))}
        </div>

        <span
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-white text-xs font-bold border border-white/20 bg-white/10"
        >
          {cta} <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

export default function HomePathCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <GlassCard
        to="/book-now"
        badge="For Drivers"
        badgeTone="hsl(338 90% 70%)"
        icon={Car}
        title="I Need a Car"
        desc="Find rental vehicles for rideshare, delivery, work, or personal use."
        bullets={DRIVER_BULLETS}
        cta="Browse Vehicles"
        glow="radial-gradient(circle, hsl(338 90% 60% / 0.22) 0%, transparent 70%)"
      />
      <GlassCard
        to="/operator-questionnaire"
        badge="For Fleet Partners"
        badgeTone="hsl(265 80% 72%)"
        icon={Home}
        title="I Own Vehicles"
        desc="Launch your own rental storefront and turn idle vehicles into recurring income."
        bullets={HOST_BULLETS}
        cta="Become a Fleet Partner"
        glow="radial-gradient(circle, hsl(265 80% 60% / 0.22) 0%, transparent 70%)"
      />
    </div>
  );
}