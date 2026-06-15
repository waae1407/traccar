import React, { useEffect, useRef, useState } from "react";

const PHASES = [
  { label: "Registering your business…", duration: 3000 },
  { label: "Configuring your storefront…", duration: 3000 },
  { label: "Setting up your operator plan…", duration: 3000 },
  { label: "Publishing your store…", duration: 3000 },
  { label: "Almost ready…", duration: 99999 }, // holds until backend responds
];

const READY_HOLD_MS = 2000; // minimum time to show "ready" screen before navigating

export default function StoreBuildingSplash({ storeName, onComplete, isComplete }) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [showReady, setShowReady] = useState(false);
  const [readyProgress, setReadyProgress] = useState(0);
  const completeFiredRef = useRef(false);
  const phaseTimerRef = useRef(null);
  const readyShownAtRef = useRef(null);

  // Advance phases on a timer — pause at last phase until isComplete
  useEffect(() => {
    if (showReady) return;
    if (phaseIndex >= PHASES.length - 1) return; // hold at last phase
    phaseTimerRef.current = setTimeout(() => {
      setPhaseIndex((p) => p + 1);
    }, PHASES[phaseIndex].duration);
    return () => clearTimeout(phaseTimerRef.current);
  }, [phaseIndex, showReady]);

  // When backend signals complete, jump to ready state
  useEffect(() => {
    if (!isComplete || completeFiredRef.current) return;
    completeFiredRef.current = true;
    clearTimeout(phaseTimerRef.current);
    setTimeout(() => {
      setShowReady(true);
      readyShownAtRef.current = Date.now();
    }, 400);
  }, [isComplete]);

  // Once ready is shown, animate progress bar — navigate only when BOTH:
  // 1. minimum hold time has passed, AND 2. parent signals page is ready (onComplete called externally)
  useEffect(() => {
    if (!showReady) return;
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min((elapsed / READY_HOLD_MS) * 100, 100);
      setReadyProgress(progress);
      if (elapsed >= READY_HOLD_MS) {
        clearInterval(tick);
        onComplete();
      }
    }, 50);
    return () => clearInterval(tick);
  }, [showReady]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(160deg, #0f0c29 0%, #302b63 55%, #e91e8c 130%)" }}
    >
      <div className="flex flex-col items-center gap-6 text-white px-8 text-center max-w-sm w-full">

        {/* Icon */}
        <div className="relative h-24 w-24 mb-2">
          <div className="absolute inset-0 rounded-[1.8rem] bg-white/10" />
          {showReady ? (
            <div className="absolute inset-0 flex items-center justify-center text-5xl animate-bounce">
              🎉
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="h-12 w-12 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-80" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
          )}
        </div>

        {showReady ? (
          <>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-white/50">
              Store Created Successfully
            </p>
            <h2
              className="text-4xl font-black leading-tight"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              Your store is ready! 🚀
            </h2>
            <p className="text-white/80 text-base">
              <strong className="text-white">{storeName}</strong> is now live on uRide.
            </p>
            <p className="text-white/50 text-sm">
              Customers can find your store now. Add your first vehicle to start accepting bookings.
            </p>

            {/* Progress bar draining down */}
            <div className="w-full mt-4">
              <div className="h-1 w-full rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white transition-none"
                  style={{ width: `${readyProgress}%`, transition: "width 50ms linear" }}
                />
              </div>
              <p className="text-white/30 text-xs mt-2">Taking you to your dashboard…</p>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-white/50">
              Building Your Store
            </p>
            <h2
              className="text-3xl font-black leading-tight"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {storeName || "Your Store"}
            </h2>

            {/* Phase label with fade */}
            <p className="text-white/75 text-sm min-h-[1.5rem] transition-all duration-700">
              {PHASES[phaseIndex].label}
            </p>

            {/* Progress dots */}
            <div className="flex gap-2 mt-2">
              {PHASES.map((_, i) => (
                <div
                  key={i}
                  className="h-2 rounded-full transition-all duration-500"
                  style={{
                    width: i === phaseIndex ? "2.5rem" : "0.5rem",
                    background: i <= phaseIndex ? "white" : "rgba(255,255,255,0.2)",
                  }}
                />
              ))}
            </div>

            {/* Subtle pulsing background bar */}
            <div className="w-full mt-4">
              <div className="h-0.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div className="h-full w-1/3 bg-white/30 rounded-full animate-shimmer" style={{ backgroundImage: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)", backgroundSize: "200% 100%" }} />
              </div>
            </div>

            <p className="text-white/30 text-xs">This only takes a few seconds…</p>
          </>
        )}
      </div>
    </div>
  );
}