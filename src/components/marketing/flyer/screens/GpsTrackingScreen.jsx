import React from "react";
import { Car, Search } from "lucide-react";
import ScreenChrome from "./ScreenChrome";

/** Live fleet map: geofence, route trace, vehicle marker and status sheet. */
export default function GpsTrackingScreen() {
  return (
    <ScreenChrome title="Fleet Tracking">
      <div
        style={{
          position: "relative",
          flex: 1,
          borderRadius: 13,
          overflow: "hidden",
          background: "linear-gradient(165deg,#132430 0%,#0b131a 58%,#0a0f14 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(0deg, rgba(255,255,255,0.055) 0 1px, transparent 1px 26px), repeating-linear-gradient(90deg, rgba(255,255,255,0.055) 0 1px, transparent 1px 26px)",
          }}
        />

        <svg
          viewBox="0 0 284 330"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          <circle
            cx="146"
            cy="140"
            r="82"
            fill="rgba(255,0,126,0.07)"
            stroke="rgba(255,0,126,0.45)"
            strokeWidth="1.5"
            strokeDasharray="6 6"
          />
          <path
            d="M34 296 C 74 250, 54 202, 104 176 S 198 128, 210 62"
            fill="none"
            stroke="#ff007e"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="34" cy="296" r="4" fill="#ffffff" opacity="0.65" />
        </svg>

        <div
          style={{
            position: "absolute",
            top: 9,
            left: 9,
            right: 9,
            height: 27,
            borderRadius: 14,
            background: "rgba(12,15,20,0.86)",
            border: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 10px",
          }}
        >
          <Search size={11} color="#8E8E93" />
          <span style={{ fontSize: 9.5, color: "#8E8E93" }}>Search fleet</span>
        </div>

        <div
          style={{
            position: "absolute",
            left: "70%",
            top: "15%",
            width: 30,
            height: 30,
            marginLeft: -15,
            marginTop: -15,
            borderRadius: 15,
            background: "#2F80FF",
            border: "2px solid #ffffff",
            boxShadow: "0 0 16px rgba(47,128,255,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Car size={15} color="#ffffff" strokeWidth={2.4} />
        </div>

        <div
          style={{
            position: "absolute",
            left: 8,
            right: 8,
            bottom: 8,
            borderRadius: 13,
            background: "rgba(12,15,20,0.94)",
            border: "1px solid rgba(255,255,255,0.1)",
            padding: "10px 11px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ margin: 0, fontSize: 11.5, fontWeight: 800 }}>Camry SE</p>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#2F80FF" }}>0.4 mi</span>
          </div>
          <p style={{ margin: "2px 0 7px", fontSize: 9, color: "#8E8E93" }}>
            Moving 24 mph · updated just now
          </p>
          <div style={{ display: "flex", gap: 5 }}>
            {["Geofence", "Trip history", "SOS"].map((chip) => (
              <span
                key={chip}
                style={{
                  fontSize: 8.5,
                  color: "rgba(255,255,255,0.82)",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  padding: "3px 7px",
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>
    </ScreenChrome>
  );
}