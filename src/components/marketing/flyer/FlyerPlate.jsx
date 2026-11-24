import React from "react";
import FlyerArtwork from "./FlyerArtwork";
import PhoneScreenFrame from "./PhoneScreenFrame";
import PaymentGuardScreen from "./screens/PaymentGuardScreen";
import SafetyMonitorScreen from "./screens/SafetyMonitorScreen";
import KeylessAccessScreen from "./screens/KeylessAccessScreen";
import GpsTrackingScreen from "./screens/GpsTrackingScreen";
import AiInspectionScreen from "./screens/AiInspectionScreen";

/**
 * The approved California master plate at its native 1199x1312 size: the SVG
 * artwork plus the live app screen inside the phone window. One rendering path
 * for the studio preview, the manual capture and the backend render surface.
 */
export const FLYER_SCREENS = {
  payment: PaymentGuardScreen,
  safety: SafetyMonitorScreen,
  keyless: KeylessAccessScreen,
  gps: GpsTrackingScreen,
  inspection: AiInspectionScreen,
};

export default function FlyerPlate({ preset }) {
  const Screen = preset.screen ? FLYER_SCREENS[preset.screen] : null;
  return (
    <>
      <FlyerArtwork preset={preset} />
      {Screen && (
        <PhoneScreenFrame>
          <Screen />
        </PhoneScreenFrame>
      )}
    </>
  );
}