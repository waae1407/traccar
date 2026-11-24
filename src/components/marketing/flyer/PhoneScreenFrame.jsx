import React from "react";
import { PHONE } from "@/lib/marketing/flyerAssets";

/**
 * Places a live React screen inside the master's tilted phone window.
 * The window's centre in artboard space is (882, 540); rotating about its own
 * centre with an 8° transform is geometrically identical to the master's
 * `rotate(8 167 292)` inside the translated frame group.
 */
export default function PhoneScreenFrame({ children }) {
  return (
    <div
      style={{
        position: "absolute",
        left: PHONE.x,
        top: PHONE.y,
        width: PHONE.w,
        height: PHONE.h,
        borderRadius: PHONE.radius,
        overflow: "hidden",
        transform: `rotate(${PHONE.rotate}deg)`,
        transformOrigin: "center",
        background: "#0a0b0f",
        boxShadow:
          "inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 26px 48px -22px rgba(255,255,255,0.16), inset 0 -20px 40px -24px rgba(0,0,0,0.9)",
      }}
    >
      {children}
    </div>
  );
}