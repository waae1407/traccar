import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Car, MapPin, ArrowLeftRight, Zap } from "lucide-react";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const statusColors = {
  open: "bg-green-500/20 text-green-400",
  matched: "bg-blue-500/20 text-blue-400",
  negotiating: "bg-yellow-500/20 text-yellow-400",
  completed: "bg-purple-500/20 text-purple-400",
};

export default function SwapMarketplace() {
  const { data: swaps = [], isLoading } = useQuery({
    queryKey: ["swap-requests"],
    queryFn: () => base44.entities.SwapRequest.filter({ status: "open" }),
  });

  return (
    <div className="min-h-screen text-white" style={{ background: "hsl(222 28% 7%)" }}>
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link to="/" className="flex items-center gap-2">
          <img src={LOGO_ICON} alt="uRide" className="h-8 w-8 rounded-full" />
          <span className="font-bold text-lg font-syne">uRide Swap</span>
        </Link>
        <Link to="/host/dashboard" className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Host Dashboard
        </Link>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs font-semibold mb-4">
            <Zap className="h-3 w-3" /> Phase 3 — Exchange Network
          </div>
          <h1 className="text-4xl font-black font-syne mb-3">Vehicle Swap Board</h1>
          <p className="text-white/40">Host-to-host vehicle exchanges across markets. Post what you have, find what you need.</p>
        </div>

        <div className="p-6 rounded-2xl border border-purple-500/20 bg-purple-500/5 mb-8">
          <div className="flex items-start gap-4">
            <ArrowLeftRight className="h-6 w-6 text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-white mb-1">How Vehicle Swaps Work</h3>
              <p className="text-sm text-white/50">Post your vehicle and what you're looking for. uRide AI matches you with compatible hosts. Negotiate directly, complete the swap, and pay a one-time $99 facilitation fee. No commission on the swap itself.</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 rounded-2xl bg-white/[0.04] animate-pulse" />)}</div>
        ) : swaps.length === 0 ? (
          <div className="text-center py-20">
            <RefreshCw className="h-14 w-14 text-white/20 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No swap requests yet</h3>
            <p className="text-white/40 text-sm mb-6">The swap marketplace is coming in Phase 3. Host partners can post swap requests from their dashboard.</p>
            <Link to="/become-a-host" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white gradient-primary">
              Become a Host to Join →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {swaps.map(s => {
              const cfg = statusColors[s.status] || statusColors.open;
              return (
                <div key={s.id} className="rounded-2xl border border-white/[0.08] p-6 glass">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-bold text-white">{s.requesting_host_name}</p>
                      <p className="text-xs text-white/40">Posted swap request</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cfg}`}>{s.status}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                      <p className="text-xs text-white/40 mb-2">Offering</p>
                      <p className="font-semibold text-white">{s.offered_vehicle_name}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <p className="text-xs text-primary/60 mb-2">Looking For</p>
                      <p className="font-semibold text-white">{s.desired_year_min}–{s.desired_year_max} {s.desired_make} {s.desired_model}</p>
                      <p className="text-xs text-white/40 mt-1"><MapPin className="h-3 w-3 inline" /> {s.desired_city}, {s.desired_state}</p>
                    </div>
                  </div>
                  {s.notes && <p className="text-sm text-white/40 mt-3">{s.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}