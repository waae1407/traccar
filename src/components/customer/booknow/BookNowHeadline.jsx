import React, { useEffect, useState } from "react";

export default function BookNowHeadline({ user }) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setPhraseIdx((i) => (i + 1) % 3);
        setFade(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const PHRASES = ["Freedom on wheels.", "Your next ride.", "Drive your way."];

  return (
    <div className="px-4 mb-6">
      {/* Small greeting (optional, subtle) */}
      {user && (
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Hi {user.full_name?.split(" ")[0]} 👋
        </p>
      )}
      
      {/* Main headline */}
      <h1
        className="text-4xl font-bold leading-tight transition-opacity duration-300"
        style={{
          fontFamily: "var(--font-syne)",
          opacity: fade ? 1 : 0,
          background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {PHRASES[phraseIdx]}
      </h1>
    </div>
  );
}