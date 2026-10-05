import React from "react";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

const HEADLIGHT_STYLES = `
@keyframes headlightPulse {
  0%, 100% { opacity: 0.80; }
  50% { opacity: 1; }
}
@keyframes headlightWarmUp {
  0% { opacity: 0; filter: blur(10px); }
  60% { opacity: 0.7; filter: blur(4px); }
  100% { opacity: 1; filter: blur(0); }
}
`;

/**
 * Lock status projected onto the reflective floor beneath the vehicle hero
 * image as a headlight beam — a pool of colored light on the ground with the
 * status text glowing brightly inside it.
 *
 * Color by state:
 *   locked   → cool blue LED headlight
 *   unlocked → warm amber headlight
 *   unknown  → dim grey (parking-light feel)
 */
export default function LockStatusFloorLabel({ isLocked, aspect }) {
  const text = isLocked === true ? "Locked" : isLocked === false ? "Unlocked" : "Lock Status";

  const beam = isLocked === true
    ? { pool: "rgba(47,128,255,0.45)", core: "rgba(190,215,255,0.85)", glow: "rgba(120,170,255,0.9)" }
    : isLocked === false
    ? { pool: "rgba(255,160,60,0.40)", core: "rgba(255,230,190,0.85)", glow: "rgba(255,200,120,0.9)" }
    : { pool: "rgba(120,120,130,0.22)", core: "rgba(200,200,210,0.55)", glow: "rgba(160,160,170,0.5)" };

  return (
    <>
      <style>{HEADLIGHT_STYLES}</style>
      <div style={{
        position: "absolute",
        left: 0, right: 0, top: "50%",
        transform: "translateY(-50%)",
        aspectRatio: String(aspect),
        pointerEvents: "none",
        zIndex: 2,
      }}>
        {/* Headlight beam pool on the ground */}
        <div style={{
          position: "absolute",
          left: "27%", top: "70%",
          transform: "translateX(-50%)",
          width: "46%", height: "32%",
          background: `radial-gradient(ellipse 60% 50% at center, ${beam.pool} 0%, transparent 70%)`,
          filter: "blur(7px)",
          animation: "headlightPulse 2.6s ease-in-out infinite",
        }} />
        {/* Bright core glow */}
        <div style={{
          position: "absolute",
          left: "27%", top: "75%",
          transform: "translateX(-50%)",
          width: "32%", height: "20%",
          background: `radial-gradient(ellipse at center, ${beam.core} 0%, transparent 65%)`,
          filter: "blur(4px)",
          animation: "headlightPulse 2.6s ease-in-out infinite",
          mixBlendMode: "screen",
        }} />
        {/* Text projected in the beam */}
        <p style={{
          position: "absolute",
          left: "27%", top: "77%",
          margin: 0,
          lineHeight: 1,
          transform: "translateX(-50%) perspective(160px) rotateX(24deg)",
          transformOrigin: "center top",
          whiteSpace: "nowrap",
          fontFamily: LABEL_FONT,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.32em",
          paddingLeft: "0.32em",
          textTransform: "uppercase",
          color: "#FFFFFF",
          mixBlendMode: "screen",
          textShadow: `0 0 7px ${beam.glow}, 0 0 16px ${beam.glow}, 0 0 2px rgba(255,255,255,0.85)`,
          animation: "headlightPulse 2.6s ease-in-out infinite",
          opacity: isLocked === null ? 0.6 : 1,
        }}>
          {text}
        </p>
      </div>
    </>
  );
}