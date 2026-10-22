import React from "react";

const DUST = [
  { left: 6, size: 2, dur: 19, delay: 0, drift: 14, op: 0.42 },
  { left: 14, size: 1.5, dur: 24, delay: 3, drift: -10, op: 0.3 },
  { left: 22, size: 2.5, dur: 27, delay: 7, drift: 18, op: 0.5 },
  { left: 31, size: 1.5, dur: 21, delay: 1, drift: -14, op: 0.28 },
  { left: 39, size: 2, dur: 30, delay: 9, drift: 10, op: 0.38 },
  { left: 47, size: 1.5, dur: 18, delay: 5, drift: -18, op: 0.32 },
  { left: 55, size: 2, dur: 26, delay: 12, drift: 16, op: 0.44 },
  { left: 63, size: 1.5, dur: 23, delay: 2, drift: -8, op: 0.26 },
  { left: 71, size: 2.5, dur: 29, delay: 8, drift: 12, op: 0.4 },
  { left: 78, size: 1.5, dur: 20, delay: 4, drift: -16, op: 0.3 },
  { left: 85, size: 2, dur: 25, delay: 11, drift: 14, op: 0.36 },
  { left: 92, size: 1.5, dur: 22, delay: 6, drift: -12, op: 0.24 },
];

/**
 * GoldDustField — slow-drifting gold motes that give the dark field depth.
 * Purely decorative: the whole layer ignores pointer events.
 */
export default function GoldDustField() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 1 }}>
      <style>{`
        @keyframes gold-dust-drift {
          0% { transform: translate3d(0, 14px, 0) scale(0.85); opacity: 0; }
          16% { opacity: var(--dust-op); }
          82% { opacity: var(--dust-op); }
          100% { transform: translate3d(var(--dust-drift), -120px, 0) scale(1.08); opacity: 0; }
        }
        .gold-dust {
          position: absolute;
          bottom: -14px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,244,204,0.95), rgba(212,175,55,0.28) 68%, transparent);
          animation: gold-dust-drift linear infinite;
        }
      `}</style>
      {DUST.map((mote, i) => (
        <span
          key={i}
          className="gold-dust"
          style={{
            left: `${mote.left}%`,
            width: mote.size,
            height: mote.size,
            animationDuration: `${mote.dur}s`,
            animationDelay: `${mote.delay}s`,
            "--dust-op": mote.op,
            "--dust-drift": `${mote.drift}px`,
          }}
        />
      ))}
    </div>
  );
}