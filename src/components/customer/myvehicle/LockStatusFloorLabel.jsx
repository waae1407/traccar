import React from "react";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

/**
 * Lock status "printed" onto the reflective floor beneath the vehicle hero image.
 * The frame matches the image's rendered content box (object-fit: contain, centered),
 * so the label stays pinned in the shadow under the front tire on any screen height.
 */
export default function LockStatusFloorLabel({ isLocked, aspect }) {
  const text = isLocked === true ? "Locked" : isLocked === false ? "Unlocked" : "Lock Status";

  return (
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
        background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        mixBlendMode: "screen",
        filter: "drop-shadow(0 0 6px rgba(47,128,255,0.35))",
        opacity: isLocked === null ? 0.5 : 0.9,
      }}>
        {text}
      </p>
    </div>
  );
}