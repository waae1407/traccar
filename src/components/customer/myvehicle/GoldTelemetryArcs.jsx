import React from "react";

const CENTER = { x: 100, y: 200 };
const START_DEG = 300; // gap centred at 12 o'clock
const MAX_SWEEP = 300;
const TONE = { gold: "#FFD700", warn: "#FF9F0A", alert: "#FF453A" };

function arcPath(r, sweepDeg) {
  const rad = (d) => (d * Math.PI) / 180;
  const x1 = CENTER.x + r * Math.cos(rad(START_DEG));
  const y1 = CENTER.y + r * Math.sin(rad(START_DEG));
  const x2 = CENTER.x + r * Math.cos(rad(START_DEG + sweepDeg));
  const y2 = CENTER.y + r * Math.sin(rad(START_DEG + sweepDeg));
  return `M ${x1} ${y1} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

/**
 * GoldTelemetryArcs — live holographic rings around the vehicle:
 * battery (outer), signal (middle), GPS freshness (inner).
 * Shares the wireframe's coordinate space so both scale together.
 */
export default function GoldTelemetryArcs({ battery = 0, signal = 0, gps = 0, batteryTone = "gold" }) {
  const rings = [
    { r: 96, pct: battery, tone: batteryTone },
    { r: 86, pct: signal, tone: "gold" },
    { r: 76, pct: gps, tone: "gold" },
  ];

  return (
    <svg
      viewBox="0 0 200 430"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    >
      {rings.map((ring) => {
        const pct = Math.max(0, Math.min(100, Math.round(ring.pct)));
        return (
          <g key={ring.r}>
            <path d={arcPath(ring.r, MAX_SWEEP)} fill="none" stroke="#C5A059" strokeOpacity="0.15" strokeWidth="1.1" strokeLinecap="round" />
            {pct > 0 && (
              <g>
                <animate attributeName="opacity" values="0.72;1;0.72" dur="4.5s" repeatCount="indefinite" />
                <path
                  d={arcPath(ring.r, (MAX_SWEEP * pct) / 100)}
                  fill="none"
                  stroke={TONE[ring.tone] || TONE.gold}
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  style={{ filter: "drop-shadow(0 0 4px rgba(255,215,0,0.45))" }}
                />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}