import React from "react";
import { Car, ShieldCheck } from "lucide-react";
import ScreenChrome from "./ScreenChrome";

const TILES = [
  { tag: "Front bumper", state: "Scuff noted", alert: true },
  { tag: "Rear left", state: "Clear", alert: false },
  { tag: "Interior", state: "Clear", alert: false },
  { tag: "Odometer", state: "41,208 mi", alert: false },
];

/** Return inspection: four geofenced photos with AI scan results. */
export default function AiInspectionScreen() {
  return (
    <ScreenChrome title="Return Inspection">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800 }}>4 photos submitted</p>
          <p style={{ margin: "2px 0 0", fontSize: 9, color: "#8E8E93" }}>
            Return window · 6:42 PM
          </p>
        </div>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 3,
            fontSize: 8,
            fontWeight: 800,
            color: "#22C55E",
            background: "rgba(34,197,94,0.13)",
            border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: 20,
            padding: "3px 7px",
            letterSpacing: "0.04em",
          }}
        >
          <ShieldCheck size={9} color="#22C55E" />
          GEOFENCE OK
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
        {TILES.map((tile, i) => (
          <div
            key={tile.tag}
            style={{
              position: "relative",
              height: 92,
              borderRadius: 11,
              overflow: "hidden",
              background:
                i === 0
                  ? "linear-gradient(150deg,#2a3038,#161a20)"
                  : "linear-gradient(150deg,#20262d,#14181e)",
              border: tile.alert
                ? "1px solid rgba(255,0,126,0.5)"
                : "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Car size={34} color="rgba(255,255,255,0.16)" strokeWidth={1.6} />
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 5,
                fontSize: 6,
                letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              SAMPLE
            </span>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: "4px 6px",
                background: "rgba(6,8,11,0.82)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 7.5, color: "rgba(255,255,255,0.75)" }}>{tile.tag}</span>
              <span
                style={{
                  fontSize: 7.5,
                  fontWeight: 800,
                  color: tile.alert ? "#ff4d9d" : "#22C55E",
                }}
              >
                {tile.state}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          borderRadius: 11,
          background: "rgba(255,0,126,0.09)",
          border: "1px solid rgba(255,0,126,0.3)",
          padding: "8px 10px",
        }}
      >
        <p style={{ margin: 0, fontSize: 9, fontWeight: 800, color: "#ff4d9d", letterSpacing: "0.05em" }}>
          AI SCAN COMPLETE
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 9, color: "rgba(255,255,255,0.66)", lineHeight: 1.45 }}>
          1 item flagged. Photos, timestamp and location stored as evidence.
        </p>
      </div>

      <div style={{ marginTop: "auto", fontSize: 9, color: "#8E8E93", paddingLeft: 2 }}>
        Evidence kept on file for any dispute.
      </div>
    </ScreenChrome>
  );
}