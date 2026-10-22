import React from "react";

/**
 * GoldVehicleWireframe — sleek top-down SUV for the Gold remote skin.
 * Thin glowing gold line-art over a deep metallic shell, with an upright SUV
 * greenhouse carrying roof rails, and perspective lighting on the hood and roof.
 */

const BODY =
  "M100 20 C146 20 170 32 174 48 L182 96 C198 108 198 162 182 174 L184 246 C198 258 198 312 182 324 L180 340 C176 360 154 380 100 380 C46 380 24 360 20 340 L18 324 C2 312 2 258 18 246 L16 174 C0 162 0 108 18 96 L26 48 C30 32 54 20 100 20 Z";
const WINDSHIELD = "M74 58 C82 54 118 54 126 58 L138 108 C118 114 82 114 62 108 Z";
const ROOF =
  "M48 122 C48 118 52 116 58 116 L142 116 C148 116 152 118 152 122 L152 294 C152 298 148 300 142 300 L58 300 C52 300 48 298 48 294 Z";
const REAR_GLASS = "M62 308 C80 304 120 304 138 308 L132 346 C122 352 78 352 68 346 Z";

export default function GoldVehicleWireframe() {
  return (
    <svg
      viewBox="0 0 200 400"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id="gv-gold" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#FFE9A3" stopOpacity="0.95" />
          <stop offset="30%" stopColor="#FFD700" />
          <stop offset="65%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#8A6E33" />
        </linearGradient>
        <linearGradient id="gv-body" x1="0.12" y1="0" x2="0.88" y2="1">
          <stop offset="0%" stopColor="#232429" />
          <stop offset="34%" stopColor="#111214" />
          <stop offset="72%" stopColor="#060608" />
          <stop offset="100%" stopColor="#141519" />
        </linearGradient>
        <linearGradient id="gv-roof" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#2A2C32" />
          <stop offset="48%" stopColor="#101114" />
          <stop offset="100%" stopColor="#060607" />
        </linearGradient>
        <linearGradient id="gv-glass" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#101217" />
          <stop offset="55%" stopColor="#03040A" />
          <stop offset="100%" stopColor="#12141A" />
        </linearGradient>
        <radialGradient id="gv-spec" cx="0.34" cy="0.18" r="0.8">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.12" />
          <stop offset="42%" stopColor="#FFFFFF" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gv-hoodsheen" cx="0.5" cy="0.2" r="0.55">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.13" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="gv-roofsheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.09" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gv-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.02" />
          <stop offset="28%" stopColor="#FFFFFF" stopOpacity="0.14" />
          <stop offset="62%" stopColor="#FFFFFF" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.12" />
        </linearGradient>
        <filter id="gv-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4.2" result="wide" />
          <feComponentTransfer in="wide" result="wideDim">
            <feFuncA type="linear" slope="0.4" />
          </feComponentTransfer>
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="tight" />
          <feMerge>
            <feMergeNode in="wideDim" />
            <feMergeNode in="tight" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="gv-soft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <linearGradient id="gv-scanband" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0" />
          <stop offset="50%" stopColor="#FFD700" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* ambient gold halo */}
      <ellipse cx="100" cy="200" rx="78" ry="188" fill="#D4AF37" opacity="0.06" filter="url(#gv-soft)" />

      {/* HUD scanner ring */}
      <g opacity="0.15" fill="none" stroke="url(#gv-gold)" pointerEvents="none">
        <circle cx="100" cy="200" r="94" strokeWidth="0.6" strokeDasharray="2 22" />
        <g strokeWidth="0.7" strokeDasharray="26 18">
          <circle cx="100" cy="200" r="85" />
          <animateTransform attributeName="transform" type="rotate" from="0 100 200" to="360 100 200" dur="34s" repeatCount="indefinite" />
        </g>
      </g>

      {/* tyres — drawn under the shell so the fenders cover their inner half */}
      <g stroke="url(#gv-gold)" strokeWidth="1" opacity="0.65">
        <rect x="182" y="112" width="16" height="52" rx="8" fill="#07070A" />
        <rect x="2" y="112" width="16" height="52" rx="8" fill="#07070A" />
        <rect x="182" y="262" width="16" height="52" rx="8" fill="#07070A" />
        <rect x="2" y="262" width="16" height="52" rx="8" fill="#07070A" />
      </g>

      {/* shell + glazing */}
      <path d={BODY} fill="url(#gv-body)" />
      <path d={WINDSHIELD} fill="url(#gv-glass)" />
      <path d={REAR_GLASS} fill="url(#gv-glass)" />
      <path d={ROOF} fill="url(#gv-roof)" />

      {/* perspective lighting */}
      <path d={BODY} fill="url(#gv-spec)" />
      <path d={ROOF} fill="url(#gv-spec)" opacity="0.6" />
      <path d="M50 120 C62 116 78 115 90 115 L84 296 C70 296 58 295 50 292 Z" fill="url(#gv-roofsheen)" />
      <ellipse cx="100" cy="40" rx="44" ry="26" fill="url(#gv-hoodsheen)" />
      <g filter="url(#gv-soft)" opacity="0.45">
        <path d="M32 118 L32 344" stroke="url(#gv-sheen)" strokeWidth="5" fill="none" strokeLinecap="round" />
        <path d="M168 118 L168 344" stroke="url(#gv-sheen)" strokeWidth="5" fill="none" strokeLinecap="round" />
      </g>

      {/* gold line-art */}
      <g filter="url(#gv-glow)" fill="none" stroke="url(#gv-gold)" strokeWidth="1.05" strokeLinecap="round" strokeLinejoin="round">
        <path d={BODY} />
        <path d={WINDSHIELD} opacity="0.85" />
        <path d={REAR_GLASS} opacity="0.85" />
        <path d={ROOF} opacity="0.7" />
        {/* roof rails + crossbars */}
        <path d="M56 128 L56 288" strokeWidth="1.5" opacity="0.6" />
        <path d="M144 128 L144 288" strokeWidth="1.5" opacity="0.6" />
        <path d="M56 172 L144 172" opacity="0.18" />
        <path d="M56 244 L144 244" opacity="0.18" />
        {/* hood */}
        <path d="M46 48 C58 36 78 29 100 29 C122 29 142 36 154 48" opacity="0.45" />
        <path d="M74 48 C82 42 90 39 100 39" opacity="0.35" />
        <path d="M126 48 C118 42 110 39 100 39" opacity="0.35" />
        {/* grille slats */}
        <path d="M82 34 L118 34" opacity="0.2" />
        <path d="M86 40 L114 40" opacity="0.16" />
        {/* wiper streak on the glass */}
        <path d="M66 114 C82 108 118 108 134 114" opacity="0.16" />
        {/* mirrors */}
        <path d="M26 88 C18 86 12 83 8 81 L4 94 C10 98 20 102 26 104 Z" opacity="0.85" />
        <path d="M174 88 C182 86 188 83 192 81 L196 94 C190 98 180 102 174 104 Z" opacity="0.85" />
        {/* panel shut-lines */}
        <path d="M26 62 L24 340" opacity="0.1" />
        <path d="M174 62 L176 340" opacity="0.1" />
        <path d="M18 190 L48 190" opacity="0.16" />
        <path d="M182 190 L152 190" opacity="0.16" />
        <path d="M18 254 L48 254" opacity="0.16" />
        <path d="M182 254 L152 254" opacity="0.16" />
        {/* door handles */}
        <path d="M30 208 L42 208" strokeWidth="1.8" opacity="0.55" />
        <path d="M170 208 L158 208" strokeWidth="1.8" opacity="0.55" />
        <path d="M30 240 L42 240" strokeWidth="1.8" opacity="0.55" />
        <path d="M170 240 L158 240" strokeWidth="1.8" opacity="0.55" />
        {/* rear plate */}
        <path d="M86 370 L114 370" opacity="0.22" />
      </g>

      {/* lights */}
      <g filter="url(#gv-glow)" stroke="url(#gv-gold)" strokeWidth="1.1" strokeLinejoin="round">
        <path d="M46 48 C56 38 68 33 78 31 L82 43 C72 46 60 50 52 55 Z" fill="#C5A059" fillOpacity="0.26" />
        <path d="M154 48 C144 38 132 33 122 31 L118 43 C128 46 140 50 148 55 Z" fill="#C5A059" fillOpacity="0.26" />
        <path d="M46 350 C56 356 66 360 74 362 L72 372 C62 370 54 366 48 362 Z" fill="#C5A059" fillOpacity="0.24" />
        <path d="M154 350 C144 356 134 360 126 362 L128 372 C138 370 146 366 152 362 Z" fill="#C5A059" fillOpacity="0.24" />
      </g>

      {/* levitation glow */}
      <ellipse cx="100" cy="388" rx="74" ry="12" fill="#D4AF37" filter="url(#gv-soft)" pointerEvents="none">
        <animate attributeName="opacity" values="0.06;0.14;0.06" dur="5.5s" repeatCount="indefinite" />
      </ellipse>

      {/* lidar scan sweep */}
      <g pointerEvents="none">
        <animateTransform attributeName="transform" type="translate" values="0 26; 0 356" dur="5.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.85;0.85;0" keyTimes="0;0.15;0.8;1" dur="5.5s" repeatCount="indefinite" />
        <rect x="10" y="-18" width="180" height="36" fill="url(#gv-scanband)" />
        <path d="M16 0 L184 0" stroke="url(#gv-gold)" strokeWidth="0.7" opacity="0.45" />
      </g>
    </svg>
  );
}