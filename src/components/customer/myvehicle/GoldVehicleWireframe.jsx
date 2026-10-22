import React from "react";

/**
 * GoldVehicleWireframe — top-down gold line-art vehicle for the Gold remote skin.
 * Pure SVG wireframe on a black surface, with a soft metallic glow.
 */
export default function GoldVehicleWireframe({ width = 168 }) {
  const height = Math.round((width / 140) * 240);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 140 240"
      fill="none"
      style={{ filter: "drop-shadow(0 0 14px rgba(212,175,55,0.32))", overflow: "visible" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="goldWire" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#D4AF37" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#8A6E33" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      <g stroke="url(#goldWire)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {/* body */}
        <path d="M70 12 C88 12 98 20 101 34 L106 86 L106 172 L101 210 C98 224 88 231 70 231 C52 231 42 224 39 210 L34 172 L34 86 L39 34 C42 20 52 12 70 12 Z" />
        {/* windshield */}
        <path d="M50 56 L90 56 L86 34 C85 28 80 25 74 25 L66 25 C60 25 55 28 54 34 Z" opacity="0.9" />
        {/* cabin roof */}
        <path d="M49 66 L91 66 L91 176 L49 176 Z" opacity="0.55" />
        {/* rear glass */}
        <path d="M51 186 L89 186 L85 206 C84 212 79 215 73 215 L67 215 C61 215 56 212 55 206 Z" opacity="0.9" />
        {/* side mirrors */}
        <path d="M34 62 L20 56 L17 70 L32 74" opacity="0.9" />
        <path d="M106 62 L120 56 L123 70 L108 74" opacity="0.9" />
        {/* headlights */}
        <path d="M55 14 L63 14" opacity="0.8" />
        <path d="M77 14 L85 14" opacity="0.8" />
        {/* taillights */}
        <path d="M55 229 L63 229" opacity="0.8" />
        <path d="M77 229 L85 229" opacity="0.8" />
        {/* wheels */}
        <rect x="22" y="80" width="13" height="27" rx="6.5" opacity="0.85" />
        <rect x="105" y="80" width="13" height="27" rx="6.5" opacity="0.85" />
        <rect x="22" y="168" width="13" height="27" rx="6.5" opacity="0.85" />
        <rect x="105" y="168" width="13" height="27" rx="6.5" opacity="0.85" />
        {/* door seams */}
        <path d="M34 120 L48 120" opacity="0.45" />
        <path d="M92 120 L106 120" opacity="0.45" />
      </g>
    </svg>
  );
}