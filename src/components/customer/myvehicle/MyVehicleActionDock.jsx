import React from "react";
import { Lock, Unlock } from "lucide-react";
import SOSButton from "@/components/customer/sos/SOSButton";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

/**
 * MyVehicleActionDock — fixed, thumb-reachable action bar for mobile.
 *
 * Renders Lock | Locate | Unlock as a slim dock pinned just above the bottom
 * nav, plus a floating SOS button above the dock. Both hide/show with the
 * same scroll-aware `visible` flag the bottom nav uses, so the cinematic map
 * stays immersive while the controls snap back the moment the user reaches
 * for them. On desktop width the fixed dock stays centered (maxWidth 430)
 * to match the app column.
 */
export default function MyVehicleActionDock({
  booking,
  device,
  isLocked,
  commandLoading,
  dropoffInspectionComplete,
  onCommand,
  visible = true,
  navVisible = false,
}) {
  const baseBtn = {
    flex: 1,
    height: 92,
    borderRadius: 16,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: 0,
    cursor: "pointer",
    transition: "all 0.2s ease-in-out",
    position: "relative",
    overflow: "hidden",
  };

  const labelStyle = {
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 16,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#F5F5F7",
    lineHeight: 1.1,
  };

  const subLabelStyle = {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
    fontWeight: 400,
    fontSize: 11,
    color: "#8E8E93",
    letterSpacing: "0.01em",
    lineHeight: 1.1,
  };

  const disabledAny = !!commandLoading || dropoffInspectionComplete;

  return (
    <>
      {/* ── Fixed action dock: Lock | Locate | Unlock ── */}
      <div
        style={{
          position: "fixed",
          bottom: navVisible ? 70 : 0,
          left: "50%",
          transform: visible
            ? "translateX(-50%) translateY(0)"
            : "translateX(-50%) translateY(160%)",
          transition: "transform 0.3s ease-in-out",
          width: "100%",
          maxWidth: 430,
          padding: "8px 14px",
          zIndex: 55,
          display: "flex",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            width: "100%",
            background: "rgba(23,24,28,0.92)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: 8,
            pointerEvents: "auto",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
          }}
        >
          {/* Lock */}
          <button
            onClick={() => booking && onCommand("lock")}
            disabled={disabledAny}
            className={`control-tap ${commandLoading === "lock" ? "btn-loading-spin" : ""}`}
            style={{
              ...baseBtn,
              background: "#1A1A1A",
              border: "1px solid rgba(255,255,255,0.08)",
              opacity: dropoffInspectionComplete && commandLoading !== "lock" ? 0.45 : 1,
            }}
          >
            <div className="btn-loading-content" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <Lock
                size={34}
                color={isLocked ? "#22C55E" : "#FFFFFF"}
                strokeWidth={2.2}
                style={{ filter: isLocked ? "drop-shadow(0 2px 8px rgba(34,197,94,0.45))" : "none" }}
              />
              <span style={labelStyle}>Lock</span>
              <span style={subLabelStyle}>Doors</span>
            </div>
          </button>

          {/* Locate */}
          <button
            onClick={() => booking && onCommand("find")}
            disabled={disabledAny}
            className={`control-tap ${commandLoading === "find" ? "btn-loading-spin" : ""}`}
            style={{
              ...baseBtn,
              background: "rgba(47,128,255,0.10)",
              border: "1px solid rgba(59,130,246,0.45)",
              boxShadow: "0 0 12px rgba(59,130,246,0.12)",
              opacity: dropoffInspectionComplete && commandLoading !== "find" ? 0.45 : 1,
              cursor: !dropoffInspectionComplete ? "pointer" : "default",
            }}
          >
            <div className="btn-loading-content" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <svg width="34" height="34" viewBox="0 0 44 56" fill="none" style={{ filter: "drop-shadow(0 0 5px rgba(59,130,246,0.5))" }}>
                <path d="M22 2C11.5 2 3 10.5 3 21c0 12 19 31 19 31s19-19 19-31C41 10.5 32.5 2 22 2z" fill="#0A0A0A" stroke="#3B82F6" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M15.5 19 L17.5 14.5 Q18 13.5 19.2 13.5 H24.8 Q26 13.5 26.5 14.5 L28.5 19 Z" fill="#FFFFFF"/>
                <rect x="13" y="19" width="18" height="7" rx="2" fill="#FFFFFF"/>
                <circle cx="16.5" cy="22.5" r="1.2" fill="#0A0A0A"/>
                <circle cx="27.5" cy="22.5" r="1.2" fill="#0A0A0A"/>
              </svg>
              <span style={labelStyle}>Locate</span>
              <span style={subLabelStyle}>Vehicle</span>
            </div>
          </button>

          {/* Unlock */}
          <button
            onClick={() => booking && onCommand("unlock")}
            disabled={disabledAny}
            className={`control-tap ${commandLoading === "unlock" ? "btn-loading-spin" : ""}`}
            style={{
              ...baseBtn,
              background: "#1A1A1A",
              border: "1px solid rgba(255,255,255,0.08)",
              opacity: dropoffInspectionComplete && commandLoading !== "unlock" ? 0.45 : 1,
            }}
          >
            <div className="btn-loading-content" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <Unlock
                size={34}
                color={!isLocked ? "#22C55E" : "#FFFFFF"}
                strokeWidth={2.2}
                style={{ filter: !isLocked ? "drop-shadow(0 2px 8px rgba(34,197,94,0.45))" : "none" }}
              />
              <span style={labelStyle}>Unlock</span>
              <span style={subLabelStyle}>Doors</span>
            </div>
          </button>
        </div>
      </div>

      {/* ── Floating SOS (above the dock, bottom-right) ── */}
      <div
        style={{
          position: "fixed",
          bottom: navVisible ? 178 : 124,
          right: 16,
          transform: visible ? "translateY(0)" : "translateY(220%)",
          transition: "transform 0.3s ease-in-out",
          zIndex: 56,
        }}
      >
        <SOSButton booking={booking} device={device} inline size={52} />
      </div>
    </>
  );
}