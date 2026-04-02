import React from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

const gradients = [
  "gradient-card-1",
  "gradient-card-2",
  "gradient-card-3",
  "gradient-card-4",
  "gradient-card-5",
  "gradient-card-6",
];

const iconColors = [
  { bg: "bg-pink-500/15 border-pink-500/20", text: "text-pink-400", glow: "shadow-[0_0_16px_hsl(338_90%_56%/0.3)]" },
  { bg: "bg-purple-500/15 border-purple-500/20", text: "text-purple-400", glow: "shadow-[0_0_16px_hsl(265_80%_62%/0.3)]" },
  { bg: "bg-green-500/15 border-green-500/20", text: "text-green-400", glow: "shadow-[0_0_16px_hsl(152_60%_46%/0.3)]" },
  { bg: "bg-yellow-500/15 border-yellow-500/20", text: "text-yellow-400", glow: "shadow-[0_0_16px_hsl(38_95%_54%/0.3)]" },
  { bg: "bg-red-500/15 border-red-500/20", text: "text-red-400", glow: "shadow-[0_0_16px_hsl(0_72%_58%/0.3)]" },
  { bg: "bg-cyan-500/15 border-cyan-500/20", text: "text-cyan-400", glow: "shadow-[0_0_16px_hsl(199_90%_54%/0.3)]" },
];

export default function StatCard({ title, value, icon: Icon, colorIndex = 0, subtitle, trend, trendValue }) {
  const idx = colorIndex % 6;
  const ic = iconColors[idx];
  const gr = gradients[idx];

  return (
    <div className={cn(
      "relative rounded-2xl p-5 border border-white/[0.07] overflow-hidden group cursor-default transition-all duration-300",
      "hover:border-white/[0.12] hover:shadow-card-hover hover:-translate-y-0.5",
      gr
    )} style={{ boxShadow: "0 4px 24px hsl(222 28% 5% / 0.5)" }}>
      {/* Subtle noise texture overlay */}
      <div className="absolute inset-0 rounded-2xl opacity-30"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E\")" }} />

      <div className="relative flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-white/40 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-white font-syne mt-2">{value}</p>
          {subtitle && <p className="text-xs text-white/30 mt-1">{subtitle}</p>}
          {trendValue !== undefined && (
            <div className={cn("flex items-center gap-1 text-xs font-medium mt-2", trend === "up" ? "text-green-400" : "text-red-400")}>
              {trend === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {trendValue}
            </div>
          )}
        </div>
        <div className={cn("p-2.5 rounded-xl border", ic.bg, ic.glow)}>
          <Icon className={cn("h-5 w-5", ic.text)} />
        </div>
      </div>
    </div>
  );
}