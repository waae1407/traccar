import React from "react";
import {
  Fingerprint, Store, Cpu, Briefcase, MapPin, Zap, Lock, Activity,
} from "lucide-react";

const CARDS = [
  {
    icon: Fingerprint,
    title: "Contactless Ready",
    desc: "Online booking, remote pickup workflows, and GPS-supported fleet tools.",
    tone: "hsl(338 90% 70%)",
    glow: "radial-gradient(circle, hsl(338 90% 60% / 0.2) 0%, transparent 70%)",
    tags: [],
  },
  {
    icon: Store,
    title: "Host Storefronts",
    desc: "Hosts promote their own branded rental page instead of being buried in a generic marketplace.",
    tone: "hsl(265 80% 72%)",
    glow: "radial-gradient(circle, hsl(265 80% 60% / 0.2) 0%, transparent 70%)",
    tags: [],
  },
  {
    icon: Cpu,
    title: "Fleet Automation",
    desc: "Purpose-built for vehicle monitoring, payment automation, and remote fleet controls.",
    tone: "hsl(199 90% 64%)",
    glow: "radial-gradient(circle, hsl(199 90% 54% / 0.2) 0%, transparent 70%)",
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
    tone: "hsl(152 60% 56%)",
    glow: "radial-gradient(circle, hsl(152 60% 46% / 0.2) 0%, transparent 70%)",
    tags: [],
  },
];

export default function HomeWhyDifferent() {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/40 mb-2">
        Platform differentiation
      </p>
      <h3
        className="text-3xl font-black text-white mb-6"
        style={{ fontFamily: "var(--font-syne)" }}
      >
        Why uRideHub Is Different
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CARDS.map((c, i) => (
          <div key={i} className="p-6 rounded-3xl glass glass-hover relative overflow-hidden transition-all">
            <div className="absolute -top-14 -right-14 h-40 w-40 rounded-full pointer-events-none" style={{ background: c.glow }} />
            <div className="relative z-10">
              <div
                className="h-11 w-11 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mb-4"
              >
                <c.icon className="h-5 w-5" style={{ color: c.tone }} />
              </div>
              <h4 className="text-base font-bold text-white mb-1.5">{c.title}</h4>
              <p className="text-sm text-white/55 leading-relaxed">{c.desc}</p>
              {c.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {c.tags.map((t, ti) => (
                    <span
                      key={ti}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 border border-white/10 text-white/75 text-[10px] font-semibold"
                    >
                      <t.icon className="h-2.5 w-2.5" /> {t.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}