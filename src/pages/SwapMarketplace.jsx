import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Car, MapPin, ArrowLeftRight, Zap, ArrowRight } from "lucide-react";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const statusConfig = {
  open: { label: "Open", color: "text-emerald-700", bg: "bg-emerald-50" },
  matched: { label: "Matched", color: "text-blue-700", bg: "bg-blue-50" },
  negotiating: { label: "Negotiating", color: "text-yellow-700", bg: "bg-yellow-50" },
  completed: { label: "Completed", color: "text-violet-700", bg: "bg-violet-50" },
};

export default function SwapMarketplace() {
  const { data: swaps = [], isLoading } = useQuery({
    queryKey: ["swap-requests"],
    queryFn: () => base44.entities.SwapRequest.filter({ status: "open" }),
  });

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "var(--font-inter)" }}>
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={LOGO_ICON} alt="uRide" className="h-7 w-7 rounded-lg object-cover" />
            <span className="font-black text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>uRide Swap</span>
          </Link>
          <Link to="/host/dashboard" className="px-4 py-2 rounded-full text-sm font-bold text-white shadow-sm"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            Host Dashboard
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(160deg, #0d1b2a 0%, #1b263b 50%, #415a77 100%)" }}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 70% 40%, hsl(265 80% 62% / 0.25) 0%, transparent 60%)" }} />
        <div className="relative z-10 max-w-3xl mx-auto px-5 py-14 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-xs font-bold mb-5">
            <Zap className="h-3 w-3 text-violet-400" /> Phase 3 — Exchange Network
          </div>
          <h1 className="text-4xl font-black text-white mb-3" style={{ fontFamily: "var(--font-syne)" }}>Vehicle Swap Board</h1>
          <p className="text-white/50 text-sm max-w-sm mx-auto">Host-to-host exchanges across markets. Post what you have, find what you need. One $99 fee.</p>
        </div>
        <div className="h-6"><svg viewBox="0 0 375 24" fill="white" className="w-full" preserveAspectRatio="none"><path d="M0 24L375 24L375 6C300 20 180 1 0 15L0 24Z"/></svg></div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* How it works */}
        <div className="p-5 rounded-3xl border border-violet-100 bg-violet-50 mb-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-2xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <ArrowLeftRight className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h3 className="font-bold text-violet-900 mb-1">How Vehicle Swaps Work</h3>
              <p className="text-sm text-violet-700 leading-relaxed">Post your vehicle and what you're looking for. uRide AI matches you with compatible hosts. Negotiate directly, complete the swap, and pay a one-time $99 facilitation fee.</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-36 rounded-3xl bg-gray-100 animate-pulse" />)}</div>
        ) : swaps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-20 w-20 rounded-3xl bg-gray-100 flex items-center justify-center mb-5">
              <RefreshCw className="h-10 w-10 text-gray-300" />
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2" style={{ fontFamily: "var(--font-syne)" }}>No swap requests yet</h3>
            <p className="text-gray-400 text-sm mb-6">The swap board goes live in Phase 3. Become a host partner to be first in queue.</p>
            <Link to="/become-a-host" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              Become a Host <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {swaps.map(s => {
              const cfg = statusConfig[s.status] || statusConfig.open;
              return (
                <div key={s.id} className="rounded-3xl border border-gray-100 bg-white shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-bold text-gray-900">{s.requesting_host_name}</p>
                      <p className="text-xs text-gray-400">Posted swap request</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-2xl bg-gray-50 border border-gray-100">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Offering</p>
                      <p className="font-bold text-gray-900 text-sm">{s.offered_vehicle_name}</p>
                    </div>
                    <div className="p-3 rounded-2xl bg-pink-50 border border-pink-100">
                      <p className="text-[10px] font-bold text-pink-400 uppercase tracking-wider mb-1">Looking For</p>
                      <p className="font-bold text-gray-900 text-sm">{s.desired_year_min}–{s.desired_year_max} {s.desired_make} {s.desired_model}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5"><MapPin className="h-2.5 w-2.5 inline" /> {s.desired_city}, {s.desired_state}</p>
                    </div>
                  </div>
                  {s.notes && <p className="text-xs text-gray-400 mt-3">{s.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}