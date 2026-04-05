import React, { useEffect, useState } from "react";
import { MapPin, Zap } from "lucide-react";

const PHRASES = ["Your next ride.", "Freedom on wheels.", "Drive your way."];

export default function BookNowHero({ user, vehicleCount }) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setPhraseIdx((i) => (i + 1) % PHRASES.length);
        setFade(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative overflow-hidden px-4 pt-6 pb-10">
      {/* Background layers */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, hsl(338 90% 56%) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 right-0 h-48 w-48 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, hsl(265 80% 62%) 0%, transparent 70%)" }} />
        {/* Grid lines */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "linear-gradient(hsl(338 90% 56%) 1px, transparent 1px), linear-gradient(90deg, hsl(338 90% 56%) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      </div>

      <div className="relative">
        {/* Live availability badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-green-500/30 bg-green-500/10 mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-green-400 text-xs font-semibold">{vehicleCount} vehicles available now</span>
        </div>

        {/* Greeting */}
        {user ? (
          <div className="mb-1">
            <p className="text-white/50 text-sm">Welcome back,</p>
            <h1 className="text-white text-4xl font-bold leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
              {user.full_name?.split(" ")[0]} 👋
            </h1>
          </div>
        ) : (
          <div className="mb-1">
            <p className="text-white/50 text-sm">Premium rentals · Instant booking</p>
            <h1 className="text-white text-4xl font-bold leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
              Find Your Ride
            </h1>
          </div>
        )}

        {/* Animated phrase */}
        <p
          className="text-2xl font-bold mt-1 transition-opacity duration-300"
          style={{
            fontFamily: "var(--font-syne)",
            opacity: fade ? 1 : 0,
            background: "linear-gradient(135deg, hsl(338 90% 65%), hsl(265 80% 70%))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {PHRASES[phraseIdx]}
        </p>

        {/* Sub labels */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {["Weekly", "Rent-to-Own", "All Cities"].map((tag) => (
            <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-white/50 text-xs">
              {tag === "All Cities" ? <MapPin className="h-2.5 w-2.5" /> : <Zap className="h-2.5 w-2.5" />}
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}