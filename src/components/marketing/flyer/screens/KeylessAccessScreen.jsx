import React from "react";
import { Lock, Unlock, MapPin } from "lucide-react";
import ScreenChrome from "./ScreenChrome";

function DockButton({ icon: Icon, label, sub, active }) {
  return (
    <div
      style={{
        flex: 1,
        height: 82,
        borderRadius: 12,
        background: "#1A1A1A",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
      }}
    >
      <Icon size={26} color={active ? "#22C55E" : "#FFFFFF"} strokeWidth={2.2} />
      <span
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "#F5F5F7",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 8, color: "#8E8E93" }}>{sub}</span>
    </div>
  );
}

/** The live My Vehicle action dock: lock, locate, unlock with address line. */
export default function KeylessAccessScreen() {
  return (
    <ScreenChrome title="Vehicle Access">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Camry SE</p>
          <p style={{ margin: "2px 0 0", fontSize: 9.5, color: "#8E8E93" }}>
            Updated just now
          </p>
        </div>
        <span
          style={{
            fontSize: 8.5,
            fontWeight: 800,
            color: "#22C55E",
            background: "rgba(34,197,94,0.14)",
            border: "1px solid rgba(34,197,94,0.32)",
            borderRadius: 20,
            padding: "4px 9px",
            letterSpacing: "0.06em",
          }}
        >
          LOCKED
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "0 2px" }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            background: "rgba(47,128,255,0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <MapPin size={13} color="#2F80FF" strokeWidth={2.4} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 650, lineHeight: 1.25 }}>
            1120 Sunset Blvd
          </p>
          <p style={{ margin: "1px 0 0", fontSize: 9.5, color: "#8E8E93" }}>
            Los Angeles, CA · 0.4 mi away
          </p>
        </div>
      </div>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          gap: 7,
          background: "rgba(23,24,28,0.95)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 15,
          padding: 7,
        }}
      >
        <DockButton icon={Lock} label="Lock" sub="Doors" active />
        <DockButton icon={MapPin} label="Locate" sub="Vehicle" />
        <DockButton icon={Unlock} label="Unlock" sub="Doors" />
      </div>
    </ScreenChrome>
  );
}