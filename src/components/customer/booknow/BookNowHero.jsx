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
    <div className="relative overflow-hidden px-4 pt-6 pb-10" style={{ background: "linear-gradient(160deg, #fff 0%, #fdf2f8 60%, #f3f0ff 100%)" }}>
      {/* Background blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-64 w-64 rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, hsl(338 90% 90%) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 right-0 h-40 w-40 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, hsl(265 80% 88%) 0%, transparent 70%)" }} />
      </div>

      <div className="relative">
        {/* Live availability badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-green-500/30 bg-green-50 mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-green-600 text-xs font-semibold">{vehicleCount} vehicles available now</span>
        </div>

        {/* Greeting */}
        {user ? (
          <div className="mb-1">
            <p className="text-gray-400 text-sm">Welcome back,</p>
            <h1 className="text-gray-900 text-4xl font-bold leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
              {user.full_name?.split(" ")[0]} 👋
            </h1>
          </div>
        ) : (
          <div className="mb-1">
            <p className="text-gray-400 text-sm">Premium rentals · Instant booking</p>
            <h1 className="text-gray-900 text-4xl font-bold leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
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
            background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {PHRASES[phraseIdx]}
        </p>

        {/* Sub labels */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {["Weekly", "Rent-to-Own", "All Cities"].map((tag) => (
            <span key={tag} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-500 text-xs">
              {tag === "All Cities" ? <MapPin className="h-2.5 w-2.5" /> : <Zap className="h-2.5 w-2.5" />}
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}