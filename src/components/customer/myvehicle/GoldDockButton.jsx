import React from "react";

const GOLD = "#C5A059";
const GOLD_BRIGHT = "#FFD700";

/**
 * GoldDockButton — square gold-outline control tile (icon above label)
 * for the Gold remote skin. `active` lights the tile up.
 */
export default function GoldDockButton({ icon, label, onClick, disabled = false, active = false, loading = false }) {
  const color = active ? GOLD_BRIGHT : GOLD;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="control-tap"
      aria-label={label}
      style={{
        flex: 1,
        height: 86,
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: 0,
        cursor: disabled ? "default" : "pointer",
        background: active ? "rgba(255,215,0,0.07)" : "rgba(0,0,0,0.55)",
        border: `1.5px solid ${active ? GOLD_BRIGHT : "rgba(197,160,89,0.75)"}`,
        boxShadow: active ? "0 0 16px rgba(255,215,0,0.45)" : "0 0 10px rgba(197,160,89,0.12)",
        opacity: disabled ? 0.45 : 1,
        transition: "all 0.2s ease-in-out",
      }}
    >
      {loading ? (
        <span className="animate-spin" style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${GOLD}`, borderTopColor: "transparent" }} />
      ) : (
        React.cloneElement(icon, { color, strokeWidth: 1.8, size: 26 })
      )}
      <span style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color,
        lineHeight: 1,
      }}>
        {label}
      </span>
    </button>
  );
}