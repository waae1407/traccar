import React from "react";

/**
 * LocateAnimationOverlay — visual feedback rendered over the vehicle hero
 * image when the Locate button is pressed.
 *
 * Three effects fire together (~2s), mimicking the real alarm the device
 * triggers on the physical car:
 *   1. Headlight + taillight flash (rapid strobe pulses at front & rear)
 *   2. Horn-blast rings expanding outward from the vehicle center
 *   3. Body shake (applied by the parent <img> via the .locate-shaking class)
 *
 * Monochrome / blue palette to match the premium aesthetic.
 */
export default function LocateAnimationOverlay({ active }) {
  if (!active) return null;
  return (
    <>
      {/* Headlight flash — front of car */}
      <div className="locate-headlight" />
      {/* Taillight flash — rear of car */}
      <div className="locate-taillight" />
      {/* Horn-blast rings */}
      <div className="locate-ring locate-ring-1" />
      <div className="locate-ring locate-ring-2" />
      <div className="locate-ring locate-ring-3" />
    </>
  );
}