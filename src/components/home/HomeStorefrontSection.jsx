import React from "react";
import { Palette, Car, CalendarDays, CreditCard, Fingerprint, BarChart2 } from "lucide-react";

const FEATURES = [
  { icon: Palette, label: "Add your logo & business profile" },
  { icon: Car, label: "List your vehicles" },
  { icon: CalendarDays, label: "Accept weekly bookings" },
  { icon: CreditCard, label: "Manage payouts" },
  { icon: Fingerprint, label: "Support contactless pickup" },
  { icon: BarChart2, label: "Track fleet activity" },
];

export default function HomeStorefrontSection() {
  return (
    <div className="rounded-3xl glass p-8 relative overflow-hidden">
      <div
        className="absolute -top-20 -right-20 h-56 w-56 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(338 90% 60% / 0.18) 0%, transparent 70%)" }}
      />
      <div className="relative z-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/40 mb-2">
          White-label storefront
        </p>
        <h3 className="text-3xl font-black text-white mb-3" style={{ fontFamily: "var(--font-syne)" }}>
          Your Own Rental Storefront
        </h3>
        <p className="text-sm leading-relaxed text-white/65 mb-3 max-w-xl">
          Every approved host gets a dedicated uRideHub storefront to showcase vehicles, accept bookings, manage customers, and build their own local rental brand.
        </p>
        <p className="text-sm font-semibold mb-5 gradient-text">
          Your customers. Your storefront. Powered by uRideHub.
        </p>

        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 mb-6">
          <span className="text-white/40">🔗</span>
          <span className="text-xs font-mono text-white/70 truncate">
            uridehub.com/fleet/<span className="text-pink-400 font-bold">your-business-name</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURES.map((f, i) => (
            <div key={i} className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 glass-hover transition-all">
              <div className="h-9 w-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0">
                <f.icon className="h-4 w-4 text-pink-400" />
              </div>
              <span className="text-sm font-semibold leading-tight text-white/85">{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}