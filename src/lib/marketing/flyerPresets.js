/**
 * The five Phase 1 flyers, plus the master's own TOAST preset kept verbatim
 * as a pixel reference for the template.
 *
 * Copy rules: headline max ~12 characters per line, body copy max ~33 per line.
 * Longer strings run under the phone at x=727.
 */

export const REFERENCE_PRESET = {
  id: "reference",
  feature: "TOAST",
  kicker: "THEFT & TAMPER ALERT SYSTEM",
  headline: "Protect\nYour Rental\nFleet.",
  copy: "Real-time alerts, location\ntracking, and tamper detection\nfor greater security and control.",
  benefits: [
    { icon: "bell", label: "Instant Alerts" },
    { icon: "mapPin", label: "Live Location" },
    { icon: "lock", label: "Remote Control" },
    { icon: "shieldCheck", label: "Theft Deterrence" },
  ],
  cta: "TOAST",
  screen: null,
  phone: "TOAST Alert",
  detail: "Unauthorized Access Detected",
  rows: ["Live Location", "Tamper Alert", "Vehicle Control"],
};

export const FLYER_PRESETS = [
  {
    id: "payment-guard",
    feature: "PAYMENT GUARD",
    kicker: "PAYMENT-LINKED VEHICLE CONTROL",
    headline: "No Payment?\nNo Start.",
    copy: "Payments are watched automatically.\nWhen a week goes unpaid, the\nvehicle\u2019s start is restricted.",
    benefits: [
      { icon: "creditCard", label: "Auto Monitoring" },
      { icon: "lock", label: "Start Hold" },
      { icon: "activity", label: "Auto Retry" },
      { icon: "shieldCheck", label: "Fleet Control" },
    ],
    cta: "GUARD",
    screen: "payment",
  },
  {
    id: "safety-monitor",
    feature: "SAFETY MONITOR",
    kicker: "DRIVING BEHAVIOR MONITORING",
    headline: "Your Car.\nTheir Driving.\nYour Risk.",
    copy: "Five reckless patterns checked\non every trip, with a pass or\nfail verdict on the vehicle.",
    benefits: [
      { icon: "gauge", label: "Speed Patterns" },
      { icon: "zap", label: "Acceleration" },
      { icon: "route", label: "Hard Cornering" },
      { icon: "shieldCheck", label: "Trip Verdicts" },
    ],
    cta: "SAFETY",
    screen: "safety",
  },
  {
    id: "keyless-access",
    feature: "KEYLESS ACCESS",
    kicker: "REMOTE VEHICLE ACCESS",
    headline: "Stop\nDelivering\nKeys.",
    copy: "Lock, unlock and locate from\nyour phone. No key handoff,\nno meeting point, no wait.",
    benefits: [
      { icon: "lock", label: "Remote Lock" },
      { icon: "unlock", label: "Remote Unlock" },
      { icon: "mapPin", label: "Live Location" },
      { icon: "shieldCheck", label: "No Key Handoff" },
    ],
    cta: "KEYLESS",
    screen: "keyless",
  },
  {
    id: "gps-tracking",
    feature: "GPS TRACKING",
    kicker: "LIVE FLEET LOCATION",
    headline: "Know Where\nEvery Vehicle\nIs. Always.",
    copy: "Live position, full trip\nhistory and geofence alerts\non every connected vehicle.",
    benefits: [
      { icon: "mapPin", label: "Live Map" },
      { icon: "route", label: "Trip History" },
      { icon: "bell", label: "Geofence Alerts" },
      { icon: "shieldCheck", label: "SOS Alerts" },
    ],
    cta: "TRACK",
    screen: "gps",
  },
  {
    id: "ai-inspection",
    feature: "AI INSPECTION",
    kicker: "PICKUP & RETURN PHOTO PROOF",
    headline: "Every Return.\nDocumented.",
    copy: "Geofenced pickup and return\nphotos, scanned for damage\nand kept as dated evidence.",
    benefits: [
      { icon: "camera", label: "Photo Proof" },
      { icon: "mapPin", label: "Geofence Check" },
      { icon: "scan", label: "AI Damage Scan" },
      { icon: "shieldCheck", label: "Evidence Vault" },
    ],
    cta: "INSPECT",
    screen: "inspection",
  },
];