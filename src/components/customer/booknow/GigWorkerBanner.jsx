import React from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function GigWorkerBanner({ onCta }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate("/book-now")}
      className="mx-4 mb-5 rounded-2xl overflow-hidden relative w-[calc(100%-2rem)] text-left active:scale-[0.98] transition-transform"
      style={{ background: "linear-gradient(135deg, hsl(338 90% 56%) 0%, hsl(265 80% 58%) 100%)" }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-6 -right-6 h-28 w-28 rounded-full opacity-20 bg-white" />
        <div className="absolute bottom-0 left-8 h-16 w-16 rounded-full opacity-10 bg-white" />
      </div>
      <div className="relative px-4 py-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-white font-bold text-sm leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
            Drive for Uber, DoorDash or Lyft?
          </p>
          <p className="text-white/75 text-xs mt-0.5">Start earning today — get a car in Minutes</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-2xl">🚀</span>
          <ArrowRight className="h-4 w-4 text-white/80" />
        </div>
      </div>
    </button>
  );
}