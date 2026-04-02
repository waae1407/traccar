import React from "react";
import { Key, ArrowRight } from "lucide-react";

export default function RtoBanner({ count }) {
  return (
    <div className="mx-4 mt-6 rounded-2xl overflow-hidden relative"
      style={{ background: "linear-gradient(135deg, #1a0a12 0%, #130920 100%)" }}>
      {/* Glow orbs */}
      <div className="absolute top-0 right-0 h-32 w-32 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(338 90% 56% / 0.3) 0%, transparent 70%)" }} />
      <div className="absolute bottom-0 left-16 h-20 w-20 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(265 80% 62% / 0.2) 0%, transparent 70%)" }} />

      <div className="relative p-5 flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.3), hsl(265 80% 62% / 0.2))", border: "1px solid hsl(338 90% 56% / 0.25)" }}>
          <Key className="h-6 w-6 text-pink-400" />
        </div>
        <div className="flex-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-pink-400">Rent-to-Own</span>
          <h3 className="text-white font-bold text-base leading-tight mt-0.5">Drive it. Own it.</h3>
          <p className="text-white/50 text-xs mt-1">
            {count} vehicle{count !== 1 ? "s" : ""} available for ownership
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white flex-shrink-0 active:opacity-80 transition-opacity"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          Start
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}