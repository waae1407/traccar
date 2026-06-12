import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const BANNER_IMG = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/1e1b1a7c0_FEDD61A2-F650-48CC-8656-E5F2B86C6C7D.png";
const ALT = "Contactless360 vehicle GPS protection with remote control, smoke detection, smart immobilizer, and fleet monitoring.";

/**
 * variant:
 *   "hero"        — full-width hero replacement on /gps landing
 *   "promo"       — top banner on /host/gps-store
 *   "dashboard"   — compact CTA on Host Dashboard
 *   "vehicle-cta" — GPS empty-state CTA on Vehicle360 / HostVehicle360
 *   "checkout"    — reassurance banner on /gps/checkout
 *   "admin"       — media preview in Admin GPS Store
 */
export default function Contactless360Banner({ variant = 'promo', vehicleId }) {

  if (variant === 'hero') {
    return (
      <div className="relative w-full overflow-hidden rounded-none md:rounded-2xl">
        {/* Desktop */}
        <img
          src={BANNER_IMG}
          alt={ALT}
          loading="eager"
          className="hidden md:block w-full object-cover object-top"
          style={{ maxHeight: 480 }}
        />
        {/* Mobile — cropped to top portion */}
        <img
          src={BANNER_IMG}
          alt={ALT}
          loading="eager"
          className="block md:hidden w-full object-cover object-top"
          style={{ height: 220 }}
        />
        {/* Gradient overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent pointer-events-none" />
        <div className="absolute bottom-6 left-6 right-1/2 hidden md:block">
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">Contactless360</p>
          <h2 className="text-3xl font-syne font-black text-white leading-tight">Protect What Moves You.</h2>
          <p className="text-white/70 text-sm mt-1">Advanced GPS protection. Real-time control. Total peace of mind.</p>
        </div>
      </div>
    );
  }

  if (variant === 'promo') {
    return (
      <div className="relative w-full overflow-hidden rounded-2xl">
        {/* Desktop */}
        <img
          src={BANNER_IMG}
          alt={ALT}
          loading="lazy"
          className="hidden md:block w-full object-cover object-top"
          style={{ maxHeight: 200 }}
        />
        {/* Mobile */}
        <img
          src={BANNER_IMG}
          alt={ALT}
          loading="lazy"
          className="block md:hidden w-full object-cover object-top"
          style={{ height: 140 }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent pointer-events-none" />
        <div className="absolute inset-0 flex items-center px-6 gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-yellow-400 text-[10px] font-bold uppercase tracking-widest mb-1">Fleet Partner Exclusive</p>
            <h2 className="text-white font-syne font-black text-xl leading-tight">
              Fleet Partner Kit — <span className="text-yellow-400">$130</span>
              <span className="text-white/50 line-through text-base ml-2">$179</span>
            </h2>
            <p className="text-white/70 text-xs mt-1 hidden sm:block">GPS + activation + contactless setup + rental readiness validation. Save $49 today.</p>
          </div>
          <Link
            to="/gps/checkout?pkg=host_contactless_kit"
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-black bg-yellow-400 hover:bg-yellow-300 transition-colors whitespace-nowrap"
          >
            Order Kit <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  if (variant === 'dashboard') {
    return (
      <Link to="/host/gps-store" className="block relative overflow-hidden rounded-2xl group active:scale-[0.98] transition-transform">
        {/* Desktop */}
        <img
          src={BANNER_IMG}
          alt={ALT}
          loading="lazy"
          className="hidden md:block w-full object-cover object-top"
          style={{ maxHeight: 120 }}
        />
        {/* Mobile */}
        <img
          src={BANNER_IMG}
          alt={ALT}
          loading="lazy"
          className="block md:hidden w-full object-cover object-top"
          style={{ height: 90 }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/50 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-between px-4">
          <div>
            <p className="text-yellow-400 text-[10px] font-bold uppercase tracking-widest">Contactless360</p>
            <p className="text-white font-bold text-sm leading-snug">Protect your fleet. Enable contactless.</p>
          </div>
          <span className="flex items-center gap-1 text-xs font-bold text-yellow-400 group-hover:translate-x-1 transition-transform">
            View Store <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </Link>
    );
  }

  if (variant === 'vehicle-cta') {
    return (
      <div className="rounded-2xl overflow-hidden border border-yellow-500/30">
        {/* Banner image — top strip */}
        <div className="relative h-28 overflow-hidden">
          <img
            src={BANNER_IMG}
            alt={ALT}
            loading="lazy"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/70" />
          <div className="absolute inset-0 flex items-center px-4">
            <div>
              <p className="text-yellow-400 text-[10px] font-bold uppercase tracking-widest">Contactless360</p>
              <p className="text-white font-syne font-bold text-sm">No GPS Device Installed</p>
              <p className="text-white/60 text-xs">Protect this vehicle — enable contactless rentals</p>
            </div>
          </div>
        </div>
        {/* Features + CTA */}
        <div className="bg-gradient-to-br from-yellow-500/8 to-yellow-600/4 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
            {["Live Tracking", "Contactless Rentals", "Starter Disable", "Remote Commands"].map(f => (
              <span key={f} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />{f}
              </span>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to={vehicleId ? `/gps/checkout?pkg=host_contactless_kit&vehicle=${vehicleId}` : '/host/gps-store'}>
              <button className="px-3 py-1.5 rounded-lg text-xs font-bold text-black bg-yellow-400 hover:bg-yellow-300 transition-colors">
                Order GPS Kit
              </button>
            </Link>
            <Link to="/gps/activate">
              <button className="px-3 py-1.5 rounded-lg text-xs font-bold text-white border border-white/20 hover:bg-white/10 transition-colors">
                Already Have Device
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'checkout') {
    return (
      <div className="relative rounded-xl overflow-hidden">
        <img
          src={BANNER_IMG}
          alt={ALT}
          loading="lazy"
          className="hidden md:block w-full object-cover object-top"
          style={{ maxHeight: 140 }}
        />
        <img
          src={BANNER_IMG}
          alt={ALT}
          loading="lazy"
          className="block md:hidden w-full object-cover object-top"
          style={{ height: 100 }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
        <div className="absolute inset-0 flex items-center px-5 gap-4">
          <div>
            <p className="text-yellow-400 text-[10px] font-bold uppercase tracking-widest mb-0.5">Contactless360</p>
            <p className="text-white font-bold text-sm leading-snug">Advanced GPS protection. Real-time control.</p>
            <p className="text-white/60 text-xs hidden sm:block">4G LTE · 12-Month Warranty · 24/7 Monitoring · Nationwide Coverage</p>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'admin') {
    return (
      <div className="rounded-xl overflow-hidden">
        <img
          src={BANNER_IMG}
          alt={ALT}
          loading="lazy"
          className="w-full object-cover object-top"
          style={{ maxHeight: 200 }}
        />
        <div className="p-3 bg-card/60 text-xs text-muted-foreground">
          Contactless360 — Marketing Banner Preview
        </div>
      </div>
    );
  }

  return null;
}