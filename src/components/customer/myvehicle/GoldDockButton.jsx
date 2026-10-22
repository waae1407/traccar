import React from "react";

const GOLD = "#C5A059";
const GOLD_BRIGHT = "#FFD700";

/**
 * GoldDockButton — square gold-outline control tile (icon above label) for the
 * Gold remote skin. `active` lights the tile with a thicker glowing gold border.
 */
export default function GoldDockButton({ icon, label, onClick, disabled = false, active = false, loading = false }) {
  const color = active ? GOLD_BRIGHT : GOLD;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`control-tap${active ? " gold-tile-active" : ""}`}
      aria-label={label}
      style={{
        flex: 1,
        height: 88,
        position: "relative",
        overflow: "hidden",
        borderRadius: 22,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 0,
        cursor: disabled ? "default" : "pointer",
        background: active ? "rgba(255,215,0,0.06)" : "rgba(8,8,10,0.92)",
        border: active ? `2px solid ${GOLD_BRIGHT}` : "1px solid rgba(197,160,89,0.5)",
        boxShadow: active
          ? "0 0 26px rgba(255,215,0,0.42), 0 12px 28px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 0 16px rgba(255,215,0,0.1)"
          : "0 10px 26px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 18px rgba(197,160,89,0.06)",
        opacity: disabled ? 0.35 : 1,
        transition: "all 0.2s ease-in-out",
      }}
    >
      {loading ? (
        <span className="animate-spin" style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${GOLD}`, borderTopColor: "transparent" }} />
      ) : (
        React.cloneElement(icon, { color, strokeWidth: 1.6, size: 24 })
      )}
      <span
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: 12.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color,
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </button>
  );
}