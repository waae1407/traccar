import React from "react";
import { Badge } from "@/components/ui/badge";
import { Shield, Sparkles } from "lucide-react";

export default function VehicleCommandHeader({ mode }) {
  const copy = {
    admin: {
      eyebrow: "Enterprise Fleet Command",
      title: "Vehicle Command Center",
      subtitle: "Control, monitor, and audit every connected vehicle from one premium operations console.",
      badge: "Admin Override Enabled"
    },
    host: {
      eyebrow: "Host Fleet Command",
      title: "Vehicle Command Center",
      subtitle: "Operate only vehicles assigned to your approved host fleet with readiness-based controls.",
      badge: "Host Scoped"
    },
    customer: {
      eyebrow: "Rental Command",
      title: "My Vehicle Controls",
      subtitle: "Locate, lock, unlock, or find your active rental while your booking is paid and active.",
      badge: "Active Rental Only"
    }
  }[mode] || {};

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 p-5 text-white shadow-2xl sm:p-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.28),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.22),transparent_34%)]" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-pink-200"><Sparkles className="h-3.5 w-3.5" />{copy.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl" style={{ fontFamily: "var(--font-syne)" }}>{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/60 sm:text-base">{copy.subtitle}</p>
        </div>
        <Badge className="w-fit rounded-full border-white/15 bg-white/10 px-3 py-1 text-white"><Shield className="mr-1 h-3.5 w-3.5" />{copy.badge}</Badge>
      </div>
    </div>
  );
}