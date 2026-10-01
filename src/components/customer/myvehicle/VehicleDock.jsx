import React from "react";
import { Lock, Unlock, MapPin, ChevronUp } from "lucide-react";

const GOLD = "#F9D479";

function GoldCircleBtn({ icon, label, onClick, loading, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`control-tap ${loading ? "btn-loading-spin" : ""}`}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        background: "none",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled && !loading ? 0.4 : 1,
        padding: 0,
      }}
    >
      <div
        style={{
          width: 76,
          height: 76,
          borderRadius: "50%",
          background: "radial-gradient(circle at 50% 40%, rgba(50,44,20,0.9), rgba(10,10,10,0.92))",
          border: `1.5px solid ${GOLD}`,
          boxShadow:
            `0 0 20px ${GOLD}66, 0 0 4px ${GOLD}80, inset 0 0 14px ${GOLD}33`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="btn-loading-content" style={{ gap: 0 }}>
          {loading ? (
            <div style={{ width: 24, height: 24, border: `2px solid ${GOLD}4D`, borderTopColor: GOLD, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          ) : (
            icon
          )}
        </div>
      </div>
      <span style={{ fontSize: 16, fontWeight: 700, color: "#F5F5F7", letterSpacing: "0.03em" }}>
        {label}
      </span>
    </button>
  );
}

export default function VehicleDock({ commandLoading, disabled, onCommand }) {
  const off = !!commandLoading || disabled;
  const iconProps = { size: 32, color: GOLD, strokeWidth: 2.2, fill: `${GOLD}59` };
  return (
    <div
      style={{
        margin: "0 16px 10px",
        padding: "16px 8px 14px",
        borderRadius: 24,
        display: "flex",
        justifyContent: "space-around",
        background: "rgba(22,24,24,0.55)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
      }}
    >
      <GoldCircleBtn icon={<Lock {...iconProps} />} label="LOCK" onClick={() => onCommand("lock")} loading={commandLoading === "lock"} disabled={off} />
      <GoldCircleBtn icon={<MapPin {...iconProps} />} label="LOCATE" onClick={() => onCommand("find")} loading={commandLoading === "find"} disabled={off} />
      <GoldCircleBtn icon={<Unlock {...iconProps} />} label="UNLOCK" onClick={() => onCommand("unlock")} loading={commandLoading === "unlock"} disabled={off} />
    </div>
  );
}

export function MoreStrip({ onExpand }) {
  return (
    <button
      onClick={onExpand}
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        border: "none",
        cursor: "pointer",
        padding: "10px 16px calc(16px + env(safe-area-inset-bottom))",
        background: "rgba(8,8,10,0.94)",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <ChevronUp size={20} color={GOLD} />
      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.03em", color: "#F5F5F7" }}>
        <span style={{ color: GOLD }}>MORE —</span> RENTAL • VEHICLE HEALTH • ADVANCED CONTROLS
      </span>
    </button>
  );
}