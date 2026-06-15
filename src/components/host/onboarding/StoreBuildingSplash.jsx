import React, { useEffect, useState } from "react";

const PHASES = [
  { label: "Setting up your business…", duration: 2500 },
  { label: "Configuring your storefront…", duration: 2500 },
  { label: "Finalizing your plan…", duration: 2000 },
];

export default function StoreBuildingSplash({ storeName, onComplete, isComplete }) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [showReady, setShowReady] = useState(false);

  useEffect(() => {
    if (showReady) return;
    if (phaseIndex < PHASES.length - 1) {
      const t = setTimeout(() => setPhaseIndex((p) => p + 1), PHASES[phaseIndex].duration);
      return () => clearTimeout(t);
    }
  }, [phaseIndex, showReady]);

  // When backend finishes, advance to "ready" state then call onComplete
  useEffect(() => {
    if (!isComplete) return;
    setShowReady(true);
    const t = setTimeout(() => onComplete(), 1800);
    return () => clearTimeout(t);
  }, [isComplete]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(160deg, #0f0c29 0%, #302b63 55%, #e91e8c 130%)" }}
    >
      <div className="flex flex-col items-center gap-6 text-white px-8 text-center max-w-sm">
        {/* Animated logo mark */}
        <div className="relative h-20 w-20">
          <div className="absolute inset-0 rounded-[1.5rem] bg-white/10 animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            {showReady ? (
              <span className="text-4xl">🎉</span>
            ) : (
              <svg className="h-10 w-10 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-80" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
          </div>
        </div>

        {showReady ? (
          <>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/50">Store Created</p>
            <h2
              className="text-3xl font-black leading-tight"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              Your store is ready!
            </h2>
            <p className="text-white/70 text-sm">
              <strong>{storeName}</strong> is now live.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/50">
              Building Your Store
            </p>
            <h2
              className="text-3xl font-black leading-tight min-h-[3rem]"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              {storeName}
            </h2>
            <p className="text-white/70 text-sm transition-all duration-500">
              {PHASES[phaseIndex].label}
            </p>

            {/* Progress dots */}
            <div className="flex gap-2 mt-2">
              {PHASES.map((_, i) => (
                <div
                  key={i}
                  className="h-2 rounded-full transition-all duration-500"
                  style={{
                    width: i === phaseIndex ? "2rem" : "0.5rem",
                    background: i <= phaseIndex ? "white" : "rgba(255,255,255,0.25)",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}