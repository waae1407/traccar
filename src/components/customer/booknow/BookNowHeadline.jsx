import React, { useEffect, useState, useRef, useCallback } from "react";

const PHRASES = ["Freedom on wheels.", "Your next ride.", "Drive your way."];

export default function BookNowHeadline({ user }) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [fade, setFade] = useState(true);
  const [fontSize, setFontSize] = useState(36);
  const containerRef = useRef(null);
  const textRef = useRef(null);

  const fitText = useCallback(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const maxWidth = container.offsetWidth;
    let size = 36;
    text.style.fontSize = size + "px";

    // Scale down until text fits in one line
    while (text.scrollWidth > maxWidth && size > 14) {
      size -= 0.5;
      text.style.fontSize = size + "px";
    }
    setFontSize(size);
  }, []);

  // Re-fit when phrase changes
  useEffect(() => {
    fitText();
  }, [phraseIdx, fitText]);

  // Re-fit on window resize
  useEffect(() => {
    window.addEventListener("resize", fitText);
    return () => window.removeEventListener("resize", fitText);
  }, [fitText]);

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
    <div className="px-4 mb-6">
      {user && (
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Hi {user.full_name?.split(" ")[0]} 👋
        </p>
      )}

      {/* Fixed-height container prevents layout shift */}
      <div ref={containerRef} style={{ height: "52px", overflow: "hidden" }}>
        <h1
          ref={textRef}
          className="font-bold leading-tight transition-opacity duration-300 whitespace-nowrap"
          style={{
            fontFamily: "var(--font-syne)",
            fontSize: fontSize + "px",
            opacity: fade ? 1 : 0,
            background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {PHRASES[phraseIdx]}
        </h1>
      </div>
    </div>
  );
}