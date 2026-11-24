import React from "react";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import ScreenChrome from "./ScreenChrome";

const PATTERNS = [
  "Sustained High Speed",
  "Rapid Acceleration",
  "Hard Cornering",
  "Stop-and-Dash",
  "Speeding Bursts",
];

/** The live pass/fail monitor card, opened to its five-pattern breakdown. */
export default function SafetyMonitorScreen() {
  return (
    <ScreenChrome title="Driving Monitor">
      <div
        style={{
          borderRadius: 14,
          background: "#1A1A1A",
          border: "1px solid rgba(34,197,94,0.35)",
          padding: "12px 13px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "rgba(34,197,94,0.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <ShieldCheck size={18} color="#22C55E" />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#22C55E" }}>
            PASS — Safe Driving
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 9.5, color: "#8E8E93" }}>
            Last 24h · 38.2 mi analysed
          </p>
        </div>
      </div>

      <p
        style={{
          margin: "4px 0 -2px",
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#71717A",
        }}
      >
        Patterns checked
      </p>

      {PATTERNS.map((label) => (
        <div
          key={label}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255,255,255,0.045)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 10,
            padding: "7px 10px",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <CheckCircle2 size={12} color="#22C55E" />
            <span style={{ fontSize: 10.5 }}>{label}</span>
          </span>
          <span style={{ fontSize: 9, fontWeight: 800, color: "#22C55E", letterSpacing: "0.06em" }}>
            CLEAR
          </span>
        </div>
      ))}

      <div
        style={{
          marginTop: "auto",
          fontSize: 9.5,
          color: "#8E8E93",
          lineHeight: 1.5,
          paddingLeft: 2,
        }}
      >
        Recent trips are checked for five reckless patterns.
      </div>
    </ScreenChrome>
  );
}