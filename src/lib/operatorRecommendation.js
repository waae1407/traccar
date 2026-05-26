export const OPERATIONAL_MODES = {
  marketplace_partner: {
    label: "Marketplace Partner",
    price: "8% per completed booking",
    summary: "Best when uRideHub helps bring renters and demand.",
    tools: ["Marketplace exposure", "uRideHub payments", "Contracts", "Compliance", "Customer flow"],
  },
  fleetos_professional: {
    label: "FleetOS Professional",
    price: "$49/month starting",
    summary: "Best for operators with their own customers who need infrastructure.",
    tools: ["Booking system", "Contracts", "Operations dashboard", "Customer management", "Compliance tools"],
  },
  hybrid_growth: {
    label: "Hybrid Growth",
    price: "$49/month + 4% on marketplace bookings",
    summary: "Best when you have direct customers but also want uRideHub demand.",
    tools: ["Direct operations", "Marketplace demand", "Custom storefront", "Payments options", "Growth tools"],
  },
};

export const ADDON_LABELS = {
  contactless: "Contactless Operations",
  dealer_network: "Dealer Network Membership",
  sourcing: "Vehicle Sourcing",
  liquidation: "Inventory Liquidation",
  custom_domain: "Custom Storefront / Custom Domain",
  gps: "GPS/Telematics",
  ai_inspections: "AI Inspections",
};

export function recommendOperatorMode(answers) {
  const scores = { marketplace_partner: 0, fleetos_professional: 0, hybrid_growth: 0 };
  const reasons = [];
  const needs = answers.operational_needs || [];

  if (answers.has_existing_customers === "No, I need customers") { scores.marketplace_partner += 4; reasons.push("You said you need help finding customers."); }
  if (answers.wants_marketplace_demand === "Yes") { scores.marketplace_partner += 3; scores.hybrid_growth += 2; reasons.push("Marketplace demand is important to your setup."); }
  if (answers.website_branding_status === "No") scores.marketplace_partner += 2;
  if (["0, I need help sourcing vehicles", "1–2"].includes(answers.fleet_size_range)) scores.marketplace_partner += 2;

  if (answers.has_existing_customers === "Yes, we already operate independently") { scores.fleetos_professional += 4; scores.hybrid_growth += 2; reasons.push("You already operate independently with customers."); }
  if (answers.website_branding_status === "Yes, established brand") scores.fleetos_professional += 3;
  if (answers.payment_preference === "Use my own payment processor") scores.fleetos_professional += 3;
  if (["I’m a dealership", "I manage a commercial fleet"].includes(answers.business_type)) scores.fleetos_professional += 2;

  if (["Some repeat customers", "Yes, we already operate independently"].includes(answers.has_existing_customers) && ["Yes", "Maybe occasionally"].includes(answers.wants_marketplace_demand)) {
    scores.hybrid_growth += 5;
    reasons.push("You have some demand already but still want growth channels.");
  }
  if (["11–25", "26–100", "100+"].includes(answers.fleet_size_range)) scores.hybrid_growth += 2;
  if (needs.includes("Marketplace exposure") && needs.length >= 3) scores.hybrid_growth += 2;

  const recommended_mode = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const recommendation_confidence = Math.round((scores[recommended_mode] / total) * 100);
  const addons = [];
  if (answers.wants_contactless === "Yes" || needs.includes("Contactless rentals")) addons.push("contactless", "gps");
  if (["Yes", "Maybe later"].includes(answers.vehicle_acquisition_interest)) addons.push("dealer_network", "sourcing");
  if (["Yes", "Maybe later"].includes(answers.inventory_liquidation_interest)) addons.push("liquidation", "dealer_network");
  if (["Yes, basic presence", "Yes, established brand"].includes(answers.website_branding_status)) addons.push("custom_domain");
  if (needs.includes("AI inspections")) addons.push("ai_inspections");

  return {
    recommended_mode,
    recommendation_confidence,
    recommendation_reasoning: reasons.length ? reasons : [OPERATIONAL_MODES[recommended_mode].summary],
    recommended_addons: [...new Set(addons)],
  };
}

export function planDefaults(mode, answers = {}) {
  return {
    active_mode: mode,
    marketplace_fee_rate: mode === "fleetos_professional" ? 0 : mode === "hybrid_growth" ? 0.04 : 0.08,
    monthly_subscription_amount: mode === "marketplace_partner" ? 0 : 49,
    uses_uride_payments: answers.payment_preference !== "Use my own payment processor",
    uses_own_payments: answers.payment_preference === "Use my own payment processor",
    contactless_enabled: answers.wants_contactless === "Yes",
    dealer_network_enabled: ["Yes", "Maybe later"].includes(answers.vehicle_acquisition_interest) || ["Yes", "Maybe later"].includes(answers.inventory_liquidation_interest),
    dealer_network_membership_status: "inactive",
    gps_subscription_enabled: answers.wants_contactless === "Yes",
    custom_domain_enabled: ["Yes, basic presence", "Yes, established brand"].includes(answers.website_branding_status),
    concierge_sourcing_enabled: ["Yes", "Maybe later"].includes(answers.vehicle_acquisition_interest),
    concierge_liquidation_enabled: ["Yes", "Maybe later"].includes(answers.inventory_liquidation_interest),
    effective_date: new Date().toISOString().slice(0, 10),
    status: "configuration_pending",
  };
}