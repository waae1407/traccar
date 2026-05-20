import React from "react";
import { Fingerprint, Store, Cpu, Briefcase, MapPin, Zap, Lock, Activity, CheckCircle2 } from "lucide-react";

const CARDS = [
  {
    icon: Fingerprint,
    title: "Contactless Ready",
    desc: "Online booking, remote pickup workflows, and GPS-supported fleet tools.",
    color: "text-pink-600",
    bg: "bg-pink-50",
    border: "border-pink-100",
    tags: [],
  },
  {
    icon: Store,
    title: "Host Storefronts",
    desc: "Hosts promote their own branded rental page instead of being buried in a generic marketplace.",
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-100",
    tags: [],
  },
  {
    icon: Cpu,
    title: "Fleet Automation",
    desc: "Purpose-built for vehicle monitoring, payment automation, and remote fleet controls.",
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-100",
    tags: [
      { icon: MapPin, label: "GPS tracking" },
      { icon: Zap, label: "Remote disable" },
      { icon: Lock, label: "Lock/unlock" },
      { icon: Activity, label: "Status monitoring" },
    ],
  },
  {
    icon: Briefcase,
    title: "Business-Focused",
    desc: "Built for real auto operators — not casual marketplace hosts or weekend renters.",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    tags: [],
  },
];

export default function HomeWhyDifferent() {
  return (
    <div>
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Platform differentiation</p>
      <h3 className="text-lg font-black text-gray-900 mb-4" style={{ fontFamily: "var(--font-syne)" }}>
        Why uRideHub Is Different
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CARDS.map((c, i) => (
          <div key={i} className={`p-4 rounded-2xl border ${c.border} bg-white shadow-sm`}>
            <div className={`h-9 w-9 rounded-xl ${c.bg} flex items-center justify-center mb-3`}>
              <c.icon className={`h-4 w-4 ${c.color}`} />
            </div>
            <h4 className="text-sm font-bold text-gray-900 mb-1">{c.title}</h4>
            <p className="text-xs text-gray-500 leading-relaxed">{c.desc}</p>
            {c.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {c.tags.map((t, ti) => (
                  <span key={ti} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-600 text-[10px] font-semibold">
                    <t.icon className="h-2.5 w-2.5" /> {t.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}