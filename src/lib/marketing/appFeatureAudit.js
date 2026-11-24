/**
 * Application feature audit — what is genuinely built and marketable today.
 * Statuses: live (shipped and wired), partial (shipped with limits),
 * not_built (planned only, must not be advertised as available).
 */

export const AUDIT_STATUS = {
  live: { label: "Live", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  partial: { label: "Limited", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  not_built: { label: "Not built", className: "bg-white/5 text-white/45 border-white/15" },
};

export const APP_FEATURE_AUDIT = [
  {
    name: "Payment Guard",
    status: "live",
    note: "Weekly payments monitored; unpaid weeks restrict the vehicle's start until settled.",
  },
  {
    name: "Autopay recovery",
    status: "live",
    note: "Failed charges retried through a grace window before any restriction lands.",
  },
  {
    name: "Keyless lock / unlock",
    status: "live",
    note: "Remote door control and starter sync on compatible telematics devices.",
  },
  {
    name: "Live GPS tracking",
    status: "live",
    note: "Position, speed and route replay per connected vehicle.",
  },
  {
    name: "Geofence alerts",
    status: "live",
    note: "Radius breach, curfew and parked-movement alerts with suppression.",
  },
  {
    name: "SOS / panic",
    status: "live",
    note: "In-app SOS routed to emergency contacts, host and admin.",
  },
  {
    name: "Driving monitoring",
    status: "partial",
    note: "Five reckless patterns analysed from the last 24h of trips, pass/fail only. No numeric score yet.",
  },
  {
    name: "AI photo inspection",
    status: "live",
    note: "Geofenced pickup and return photos, scanned for damage.",
  },
  {
    name: "Evidence vault",
    status: "live",
    note: "Timestamped inspection evidence held for dispute resolution.",
  },
  {
    name: "Insurance360 reports",
    status: "live",
    note: "Factual incident and evidence reports, transmittable to a carrier.",
  },
  {
    name: "Weekly billing + e-signed contracts",
    status: "live",
    note: "Recurring billing with signed agreements captured per booking.",
  },
  {
    name: "Host payouts",
    status: "live",
    note: "Net payouts with a chargeback-protection hold after confirmed pickup.",
  },
  {
    name: "Marketplace",
    status: "live",
    note: "Public vehicle search with instant booking and availability rules.",
  },
  {
    name: "Host storefront + custom domain",
    status: "live",
    note: "White-label store with its own domain and branded checkout.",
  },
  {
    name: "Rent-to-own",
    status: "live",
    note: "Contracted rent-to-own tracking on eligible vehicles.",
  },
  {
    name: "Availability calendar",
    status: "live",
    note: "Daily, weekly and monthly rules with blackout dates per vehicle.",
  },
  {
    name: "Compliance tracking",
    status: "live",
    note: "Registration and insurance expiry monitoring with booking blocks.",
  },
  {
    name: "Maintenance + expenses",
    status: "live",
    note: "Service logs, cost tracking and per-vehicle profitability.",
  },
  {
    name: "Battery health",
    status: "live",
    note: "Voltage drain scoring with parasite-draw remediation.",
  },
  {
    name: "Dealer network",
    status: "live",
    note: "Offers, valuations and buy/sell requests between operators.",
  },
  {
    name: "Installer network",
    status: "live",
    note: "Installation jobs with device QA sign-off.",
  },
  {
    name: "Multi-channel notifications",
    status: "live",
    note: "Email, SMS, in-app and push routing with delivery logging.",
  },
  {
    name: "GPS hardware store",
    status: "live",
    note: "Device sales with trial and subscription activation.",
  },
  {
    name: "Reputation & trust",
    status: "live",
    note: "Host and vehicle trust signals surfaced on public pages.",
  },
  {
    name: "Numeric safety score",
    status: "not_built",
    note: "Planned. Until it ships, flyers advertise the pass/fail monitor only.",
  },
  {
    name: "Street takeover detection",
    status: "not_built",
    note: "Needs denser sampling than stored history provides. Not advertised.",
  },
];