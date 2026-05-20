import React from "react";
import { Fingerprint, Store, Cpu, Briefcase } from "lucide-react";

const CARDS = [
  {
    icon: Fingerprint,
    title: "Contactless Ready",
    desc: "Online booking, remote pickup workflows, and GPS-supported fleet tools.",
    color: "text-pink-600",
    bg: "bg-pink-50",
  },
  {
    icon: Store,
    title: "Host Storefronts",
    desc: "Hosts promote their own branded rental page instead of being buried in a generic marketplace.",
    color: "text-violet-600",
    bg: "bg-violet-50",
  },
  {
    icon: Cpu,
    title: "Fleet Automation",
    desc: "GPS tracking, remote disable, lock/unlock workflows, and vehicle status management.",
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    icon: Briefcase,
    title: "Business-Focused",
    desc: "Built for real auto operators, not only casual individual hosts.",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
];

export default function HomeWhyDifferent() {
  return (
    <div>
      <h3 className="text-lg font-black text-gray-900 mb-4" style={{ fontFamily: "var(--font-syne)" }}>
        Why uRideHub Is Different
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CARDS.map((c, i) => (
          <div key={i} className="p-4 rounded-2xl border border-gray-100 bg-white">
            <div className={`h-9 w-9 rounded-xl ${c.bg} flex items-center justify-center mb-3`}>
              <c.icon className={`h-4.5 w-4.5 ${c.color}`} />
            </div>
            <h4 className="text-sm font-bold text-gray-900 mb-1">{c.title}</h4>
            <p className="text-xs text-gray-500 leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}