import React, { useRef } from "react";
import FlyerPlate from "./FlyerPlate";
import useFitScale from "@/hooks/useFitScale";
import { FLYER_W, FLYER_H, INK } from "@/lib/marketing/flyerAssets";

/**
 * One rendering path for preview and export: the SVG artwork, then the live
 * app screen composited into the phone window, scaled from the fixed 1199x1312
 * artboard. `fitHeight` shrinks the whole board to one screen without scrolling.
 */
export default function Flyer({ preset, className = "", fitHeight = false }) {
  const stageRef = useRef(null);
  const scale = useFitScale(stageRef, FLYER_W, fitHeight ? FLYER_H : null);

  const frameStyle = fitHeight
    ? { width: FLYER_W * scale, height: FLYER_H * scale }
    : { width: "100%", aspectRatio: `${FLYER_W} / ${FLYER_H}` };

  return (
    <div
      ref={stageRef}
      className={className}
      style={{
        ...frameStyle,
        position: "relative",
        overflow: "hidden",
        borderRadius: 14,
        background: INK,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: FLYER_W,
          height: FLYER_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <FlyerPlate preset={preset} />
      </div>
    </div>
  );
}