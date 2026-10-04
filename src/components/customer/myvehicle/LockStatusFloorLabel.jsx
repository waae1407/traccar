import React from "react";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

const BEAM_STYLES = `
@keyframes lockLabelBeam {
  0%, 100% {
    text-shadow:
      0 0 4px rgba(47,128,255,0.28),
      0 0 9px rgba(47,128,255,0.12);
    opacity: 0.72;
  }
  45% {
    text-shadow:
      0 0 7px rgba(47,128,255,0.55),
      0 0 16px rgba(47,128,255,0.32),
      0 0 2px rgba(255,255,255,0.6);
    opacity: 1;
  }
  55% {
    text-shadow:
      0 0 7px rgba(47,128,255,0.55),
      0 0 16px rgba(47,128,255,0.32),
      0 0 2px rgba(255,255,255,0.6);
    opacity: 1;
  }
}
`;

/**
 * Lock status "printed" onto the reflective floor beneath the vehicle hero image.
 * Each letter carries a soft blue glow that brightens in a slow wave — a subtle
 * light-beam passing through the word so it stays legible on the dark floor.
 */
export default function LockStatusFloorLabel({ isLocked, aspect }) {
  const text = isLocked === true ? "Locked" : isLocked === false ? "Unlocked" : "Lock Status";
  const letters = text.toUpperCase().split("");

  return (
    <>
      <style>{BEAM_STYLES}</style>
      <div style={{
        position: "absolute",
        left: 0, right: 0, top: "50%",
        transform: "translateY(-50%)",
        aspectRatio: String(aspect),
        pointerEvents: "none",
        zIndex: 2,
      }}>
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
          filter: "drop-shadow(0 0 4px rgba(47,128,255,0.25))",
          opacity: isLocked === null ? 0.5 : 0.95,
        }}>
          {letters.map((ch, i) => (
            <span
              key={i}
              style={{
                display: "inline-block",
                animation: "lockLabelBeam 3.4s ease-in-out infinite",
                animationDelay: `${i * 0.13}s`,
              }}
            >
              {ch}
            </span>
          ))}
        </p>
      </div>
    </>
  );
}