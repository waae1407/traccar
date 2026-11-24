import React from "react";
import BenefitRow from "./BenefitRow";
import {
  CALIFORNIA_BG,
  URIDE_LOGO_WHITE,
  FLYER_W,
  FLYER_H,
  INK,
  MAGENTA,
  CTA_PINK,
} from "@/lib/marketing/flyerAssets";
import { featureSize, headlineSize, toLines } from "@/lib/marketing/flyerGeometry";

/**
 * The California Edition artboard. Every coordinate below is the approved
 * master's own: background 699x900 at x=500, shade and bottom gradients,
 * magenta corner wedges, logo at 60/42, badge wedge, headline, copy, benefit
 * strip, footer and CTA. Nothing is re-drawn by eye.
 */
export default function FlyerArtwork({ preset }) {
  const uid = preset.id;
  const fSize = featureSize(preset.feature);
  const hSize = headlineSize(preset.headline);
  const headlineLines = toLines(preset.headline);
  const copyLines = toLines(preset.copy);
  const usesPlaceholder = !preset.screen;

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
          <stop offset="0.55" stopColor="#10141b" stopOpacity="0.85" />
          <stop offset="1" stopColor="#10141b" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`bottom-${uid}`} x2="0" y2="1">
          <stop stopColor="#10141b" stopOpacity="0" />
          <stop offset="1" stopColor="#10141b" />
        </linearGradient>
        <linearGradient id={`pink-${uid}`}>
          <stop stopColor="#ff0080" />
          <stop offset="1" stopColor="#990045" />
        </linearGradient>
      </defs>

      <rect width={FLYER_W} height={FLYER_H} fill={INK} />
      <image
        href={CALIFORNIA_BG}
        x="500"
        y="0"
        width="699"
        height="900"
        preserveAspectRatio="xMidYMid slice"
      />
      <rect width={FLYER_W} height="900" fill={`url(#shade-${uid})`} />
      <rect y="620" width={FLYER_W} height="400" fill={`url(#bottom-${uid})`} />

      <path d="M740 0H1199V68L620 175Z" fill={`url(#pink-${uid})`} />
      <path d="M0 1160L290 1312H0Z" fill={`url(#pink-${uid})`} />
      <path d="M480 1312L1199 1190V1312Z" fill={`url(#pink-${uid})`} />

      <g fontFamily="Arial, Helvetica, sans-serif">
        <image href={URIDE_LOGO_WHITE} x="60" y="42" width="480" height="132" />

        <path d="M75 198H585L540 305H75Z" fill={`url(#pink-${uid})`} />
        <text
          x="95"
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

      <g transform="translate(715 248) rotate(8 167 292)">
        <rect width="334" height="584" rx="48" fill="#08090c" stroke="#aeb0b4" strokeWidth="5" />
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