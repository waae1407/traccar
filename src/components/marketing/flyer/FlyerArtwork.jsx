import React from "react";
import BenefitRow from "./BenefitRow";
import FlyerIcon from "./FlyerIcon";
import {
  LANDSCAPE_BG,
  LANDSCAPE,
  FLYER_W,
  FLYER_H,
  INK,
  MAGENTA,
  CTA_PINK,
} from "@/lib/marketing/flyerAssets";
import { featureSize, headlineSize, toLines } from "@/lib/marketing/flyerGeometry";

const BADGE_ICON = { cx: 127, cy: 253, size: 62 };
const BADGE_TEXT_X = 176;

/**
 * The California Edition artboard. Every coordinate below is the approved
 * master's own: badge wedge, kicker, rule, headline, copy, benefit strip,
 * footer, CTA and the tilted phone at translate(715 248) rotate(8 167 292).
 * Nothing is re-drawn by eye.
 */
export default function FlyerArtwork({ preset }) {
  const uid = preset.id;
  const fSize = featureSize(preset.feature, 600);
  const hSize = headlineSize(preset.headline);
  const headlineLines = toLines(preset.headline);
  const copyLines = toLines(preset.copy);
  const usesPlaceholder = !preset.screen;
  const featureIcon =
    preset.featureIcon || preset.benefits?.[0]?.icon || "shieldCheck";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={FLYER_W}
      height={FLYER_H}
      viewBox={`0 0 ${FLYER_W} ${FLYER_H}`}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={`shade-${uid}`}>
          <stop stopColor="#0d1017" />
          <stop offset="0.5" stopColor="#10141b" stopOpacity="0.92" />
          <stop offset="0.78" stopColor="#10141b" stopOpacity="0.35" />
          <stop offset="1" stopColor="#10141b" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`bottom-${uid}`} x2="0" y2="1">
          <stop stopColor="#10141b" stopOpacity="0" />
          <stop offset="0.45" stopColor="#10141b" stopOpacity="0.85" />
          <stop offset="1" stopColor="#10141b" />
        </linearGradient>
        <linearGradient id={`pink-${uid}`}>
          <stop stopColor="#ff0080" />
          <stop offset="1" stopColor="#990045" />
        </linearGradient>

        {/* Feathers the landscape's left edge into the dark side of the flyer. */}
        <linearGradient id={`fade-${uid}`} x1="0" x2="1">
          <stop offset="0" stopColor="#000000" />
          <stop offset="0.32" stopColor="#ffffff" />
        </linearGradient>
        <mask id={`bgMask-${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width={FLYER_W} height={FLYER_H}>
          <rect x={LANDSCAPE.x} y="0" width={LANDSCAPE.w} height={LANDSCAPE.h} fill={`url(#fade-${uid})`} />
        </mask>

        {/* Photoreal phone body: brushed metal edge over deep glass black. */}
        <linearGradient id={`body-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#4c505a" />
          <stop offset="0.18" stopColor="#20232b" />
          <stop offset="0.55" stopColor="#0c0e13" />
          <stop offset="0.82" stopColor="#191c23" />
          <stop offset="1" stopColor="#3b3f48" />
        </linearGradient>
        <linearGradient id={`edge-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#b9bfc9" />
          <stop offset="0.35" stopColor="#3a3e47" />
          <stop offset="0.7" stopColor="#24272e" />
          <stop offset="1" stopColor="#a7adb8" />
        </linearGradient>
        <radialGradient id={`shadow-${uid}`}>
          <stop stopColor="#000000" stopOpacity="0.55" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width={FLYER_W} height={FLYER_H} fill={INK} />

      {/* Full-height landscape, feathered on its left edge — no seam. */}
      <g mask={`url(#bgMask-${uid})`}>
        <image
          href={LANDSCAPE_BG}
          x={LANDSCAPE.x}
          y={LANDSCAPE.y}
          width={LANDSCAPE.w}
          height={LANDSCAPE.h}
          preserveAspectRatio="xMidYMid slice"
        />
      </g>

      <rect width={FLYER_W} height={FLYER_H} fill={`url(#shade-${uid})`} />
      <rect y="620" width={FLYER_W} height={FLYER_H - 620} fill={`url(#bottom-${uid})`} />

      <path d="M740 0H1199V68L620 175Z" fill={`url(#pink-${uid})`} />
      <path d="M0 1160L290 1312H0Z" fill={`url(#pink-${uid})`} />
      <path d="M480 1312L1199 1190V1312Z" fill={`url(#pink-${uid})`} />

      <g fontFamily="Arial, Helvetica, sans-serif">
        {/* All-white wordmark, vector so it stays sharp at any resolution. */}
        <text
          x="60"
          y="158"
          fill="#ffffff"
          fontSize="132"
          fontWeight="800"
          fontFamily="Syne, 'Arial Black', Arial, sans-serif"
          textLength="470"
          lengthAdjust="spacingAndGlyphs"
        >
          uRide
        </text>

        <path d="M75 198H585L540 305H75Z" fill={`url(#pink-${uid})`} />
        <FlyerIcon name={featureIcon} cx={BADGE_ICON.cx} cy={BADGE_ICON.cy} size={BADGE_ICON.size} />
        <text
          x={BADGE_TEXT_X}
          y="280"
          fill="#ffffff"
          fontSize={fSize}
          fontWeight="900"
          fontStyle="italic"
        >
          {preset.feature}
        </text>

        <text x="68" y="350" fill="#ffffff" fontSize="25" fontWeight="700" letterSpacing="1">
          {preset.kicker}
        </text>
        <rect x="70" y="382" width="160" height="8" rx="4" fill="#ff0080" />

        {headlineLines.map((line, i) => (
          <text
            key={`h-${i}`}
            x="70"
            y={460 + i * 84}
            fontSize={hSize}
            fontWeight="900"
            fill={i === headlineLines.length - 1 ? MAGENTA : "#ffffff"}
          >
            {line}
          </text>
        ))}

        {copyLines.map((line, i) => (
          <text key={`c-${i}`} x="72" y={690 + i * 37} fontSize="30" fontWeight="400" fill="#ffffff">
            {line}
          </text>
        ))}

        <BenefitRow benefits={preset.benefits} />

        <text x="70" y="1125" fill="#ffffff" fontSize="28">
          Contactless360  |  Powered by uRide
        </text>
        <rect x="655" y="1070" width="475" height="100" rx="50" fill={CTA_PINK} />
        <text
          x="892"
          y="1132"
          fill="#ffffff"
          textAnchor="middle"
          fontSize="42"
          fontWeight="900"
        >
          {`DM \u201c${preset.cta}\u201d \u2192`}
        </text>
      </g>

      {/* Photoreal phone: brushed-metal body, glass inset, side buttons. */}
      <g transform="translate(715 248) rotate(8 167 292)">
        <ellipse cx="167" cy="602" rx="172" ry="26" fill={`url(#shadow-${uid})`} />
        <rect
          x="0"
          y="0"
          width="334"
          height="584"
          rx="48"
          fill={`url(#body-${uid})`}
          stroke={`url(#edge-${uid})`}
          strokeWidth="2.5"
        />
        <rect
          x="1.6"
          y="1.6"
          width="330.8"
          height="580.8"
          rx="46.4"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.22"
          strokeWidth="1.2"
        />
        <rect x="7" y="7" width="320" height="570" rx="42" fill="#05060b" />
        <rect x="12" y="12" width="310" height="560" rx="38" fill="#0a0b0f" />
        <rect x="-3.5" y="140" width="4" height="58" rx="2" fill="#2c3038" />
        <rect x="-3.5" y="214" width="4" height="92" rx="2" fill="#2c3038" />
        <rect x="333.5" y="186" width="4" height="104" rx="2" fill="#23262c" />

        {usesPlaceholder && (
          <g fontFamily="Arial, Helvetica, sans-serif">
            <text x="167" y="90" textAnchor="middle" fontSize="40" fontWeight="900" fill="#ffffff">
              uRide
            </text>
            <rect x="25" y="132" width="284" height="170" rx="22" fill="#97004d" />
            <text x="167" y="198" textAnchor="middle" fill="#ffffff" fontSize="26" fontWeight="bold">
              {preset.phone}
            </text>
            <text x="167" y="244" textAnchor="middle" fill="#ffffff" fontSize="16">
              {preset.detail}
            </text>
            {(preset.rows || []).map((row, i) => (
              <g key={`r-${i}`}>
                <rect x="25" y={320 + i * 64} width="284" height="54" rx="12" fill="#24262b" />
                <text x="43" y={353 + i * 64} fill="#ffffff" fontSize="22">
                  {row}
                </text>
              </g>
            ))}
          </g>
        )}
      </g>
    </svg>
  );
}