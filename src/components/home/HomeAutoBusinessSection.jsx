import React from "react";
import { Building2, Wrench, Car, FileCheck, Briefcase, ShoppingCart } from "lucide-react";

const SEGMENTS = [
  { icon: Building2, label: "Dealership rental fleets", tone: "text-pink-400" },
  { icon: Wrench, label: "Repair shop loaner/rental vehicles", tone: "text-violet-400" },
  { icon: Car, label: "Body shop replacement rentals", tone: "text-sky-400" },
  { icon: FileCheck, label: "Rent-to-own style programs", tone: "text-emerald-400" },
  { icon: Briefcase, label: "Weekly gig-driver rentals", tone: "text-amber-400" },
  { icon: ShoppingCart, label: "Vehicle liquidation & sourcing support", tone: "text-pink-400" },
];

export default function HomeAutoBusinessSection() {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/40 mb-2">
        Who it's for
      </p>
      <h3 className="text-3xl font-black text-white mb-3" style={{ fontFamily: "var(--font-syne)" }}>
        Built for Auto Businesses
      </h3>
      <p className="text-sm text-white/55 leading-relaxed mb-6 max-w-xl">
        uRideHub is designed for independent dealerships, repair shops, body shops, small fleet owners, and rental operators who want to monetize vehicles without building their own rental technology.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SEGMENTS.map((s, i) => (
          <div key={i} className="flex items-center gap-3 p-4 rounded-2xl glass glass-hover transition-all">
            <div className="h-10 w-10 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0">
              <s.icon className={`h-5 w-5 ${s.tone}`} />
            </div>
            <span className="text-sm font-semibold text-white/85 leading-tight">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}