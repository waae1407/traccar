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
        left: "64%", top: "74%",
        margin: 0,
        lineHeight: 1,
        transform: "translateX(-50%) perspective(160px) rotateX(24deg)",
        transformOrigin: "center top",
        whiteSpace: "nowrap",
        fontFamily: LABEL_FONT,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.32em",
        paddingLeft: "0.32em",
        textTransform: "uppercase",
        color: "#FFFFFF",
        textShadow: "0 0 4px rgba(255,255,255,0.9), 0 0 12px rgba(47,128,255,0.6), 0 0 24px rgba(47,128,255,0.3)",
        animation: "lockLabelGlow 2.5s ease-in-out infinite",
        opacity: isLocked === null ? 0.6 : 1,
      }}>
        {text}
      </p>
    </div>
  );
}