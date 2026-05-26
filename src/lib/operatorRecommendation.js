export const OPERATIONAL_MODES = {
  marketplace_partner: {
    label: "Marketplace Partner",
    price: "8% per completed marketplace booking",
    summary: "Best when uRideHub helps bring renters and marketplace demand.",
    tools: ["Marketplace exposure", "uRideHub payments", "Contracts", "Compliance", "Customer flow"],
  },
  fleetos_professional: {
    label: "FleetOS Professional",
    price: "$29.99/month",
    summary: "Best for operators with their own customers who need infrastructure.",
    tools: ["Booking system", "Contracts", "Operations dashboard", "Customer management", "No marketplace transaction fee on direct business"],
  },
  hybrid_growth: {
    label: "Hybrid Growth",
    price: "$29.99/month + 4% marketplace booking fee",
    summary: "Best when you have direct customers but also want uRideHub demand.",
    tools: ["Direct operations", "Marketplace demand", "Custom storefront", "Payments options", "Growth tools"],
  },
};

export const OPERATOR_ADDONS = {
  contactless_operations: {
    name: "Contactless Operations",
    summary: "Operate rentals remotely without meeting renters.",
    includes: ["lock/unlock doors", "kill switch / remote disable where supported", "true GPS tracking", "Bluetooth control where supported", "device uptime monitoring", "contactless pickup/dropoff support", "theft-recovery support"],
    pricing: ["$75 device one-time per vehicle", "$15/month per active device/vehicle"],
    billingImpact: "Adds device hardware cost when activated and $15/month per active device after assignment. Removing later stops future contactless subscription billing and disables contactless functionality for assigned vehicles.",
    operationalImpact: "Enables remote rental operations, contactless workflows, and theft-recovery readiness where supported.",
    oneTimePrice: 75,
    monthlyPrice: 15,
  },
  gps_telematics: {
    name: "GPS/Telematics",
    summary: "Track vehicle location and movement in real time.",
    includes: ["live GPS", "trip visibility", "geofence readiness", "device health", "event history"],
    pricing: ["Included with Contactless Operations if using the full device package", "GPS-only support remains a configurable placeholder"],
    billingImpact: "No billing is activated from this screen. GPS-only pricing can be configured later if supported separately.",
    operationalImpact: "Adds location visibility and device health foundations without sending real GPS commands.",
    oneTimePrice: 0,
    monthlyPrice: 0,
  },
  dealer_network: {
    name: "Dealer Network Membership",
    summary: "Access wholesale sourcing, buying, and liquidation tools.",
    includes: ["vehicle sourcing", "bid request center", "internal wholesale marketplace", "liquidation requests", "wholesale intelligence tools"],
    pricing: ["$100/year membership", "$50 per successful purchased/sold vehicle later", "plus actual auction/listing/transport fees"],
    billingImpact: "Annual membership is required for buying/liquidation workflows. Removing or cancelling disables Dealer Network actions but does not affect rental operations.",
    operationalImpact: "Unlocks planning access to wholesale tools without real auction API calls or transaction fees.",
    annualPrice: 100,
    transactionFee: 50,
  },
  vehicle_sourcing: {
    name: "Vehicle Sourcing",
    summary: "Get help finding vehicles to grow your fleet.",
    includes: ["auction search requests", "buy request workflow", "wholesale intelligence", "transport estimate readiness"],
    pricing: ["Requires Dealer Network membership", "$50 platform transaction fee only when a vehicle is successfully purchased later", "plus actual auction/transport fees"],
    billingImpact: "No transaction fee is activated now. Fees apply only after a future successful purchase workflow is approved.",
    operationalImpact: "Adds sourcing workflow readiness without real auction API calls.",
    transactionFee: 50,
  },
  inventory_liquidation: {
    name: "Inventory Liquidation",
    summary: "Sell or liquidate vehicles you no longer want to keep.",
    includes: ["internal Dealer Network listing", "auction liquidation request", "AI/MMR-style pricing guidance placeholder", "inspection-style photo package"],
    pricing: ["Requires Dealer Network membership", "$50 platform transaction fee only when a vehicle is successfully sold later", "plus actual auction/listing/transport fees"],
    billingImpact: "No transaction fee is activated now. Fees apply only after a future successful sale workflow is approved.",
    operationalImpact: "Adds liquidation workflow readiness without real listing, transport, or auction execution.",
    transactionFee: 50,
  },
};

export const ADDON_LABELS = Object.fromEntries(Object.entries(OPERATOR_ADDONS).map(([key, addon]) => [key, addon.name]));

export function normalizeAddonKey(key) {
  const aliases = { contactless: "contactless_operations", gps: "gps_telematics", sourcing: "vehicle_sourcing", liquidation: "inventory_liquidation" };
  return aliases[key] || key;
}

export function buildAddonPayload(addonKey, { hostId = "", userId = "", recommended = false, selected = false, source = "questionnaire", actor = "system" } = {}) {
  const key = normalizeAddonKey(addonKey);
  const addon = OPERATOR_ADDONS[key];
  const now = new Date().toISOString();
  return {
    host_id: hostId,
    user_id: userId,
    addon_key: key,
    status: selected ? "selected" : "recommended",
    selected,
    recommended,
    selection_source: source,
    activation_status: selected ? "interest_recorded" : "not_started",
    billing_status: "not_required_yet",
    one_time_price: addon?.oneTimePrice || 0,
    monthly_price: addon?.monthlyPrice || 0,
    annual_price: addon?.annualPrice || 0,
    transaction_fee: addon?.transactionFee || 0,
    pricing_note: addon?.pricing?.join(" · ") || "",
    billing_impact: addon?.billingImpact || "",
    operational_impact: addon?.operationalImpact || "",
    setup_note: "Lifecycle foundation only — no real billing, Stripe charge, GPS command, dealer fee, or auction action is activated here.",
    selected_at: selected ? now : undefined,
    last_updated_at: now,
    audit_log: [{ action: selected ? "selected" : "recommended", status: selected ? "selected" : "recommended", changed_by: actor, changed_at: now, note: "Add-on lifecycle record created without activating billing." }]
  };
}

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
  if (answers.wants_contactless === "Yes" || needs.includes("Contactless rentals")) addons.push("contactless_operations", "gps_telematics");
  if (["Yes", "Maybe later"].includes(answers.vehicle_acquisition_interest)) addons.push("dealer_network", "vehicle_sourcing");
  if (["Yes", "Maybe later"].includes(answers.inventory_liquidation_interest)) addons.push("inventory_liquidation", "dealer_network");
  if (["Yes, basic presence", "Yes, established brand"].includes(answers.website_branding_status)) addons.push("custom_domain");
  if (needs.includes("AI inspections")) addons.push("ai_inspections");

  return {
    recommended_mode,
    recommendation_confidence,
    recommendation_reasoning: reasons.length ? reasons : [OPERATIONAL_MODES[recommended_mode].summary],
    recommended_addons: [...new Set(addons)],
  };
}

export function planDefaults(mode, answers = {}, recommendedMode = mode) {
  const isMarketplace = mode === "marketplace_partner";
  const now = new Date().toISOString();

  return {
    recommended_mode: recommendedMode,
    selected_mode: mode,
    active_mode: isMarketplace ? "marketplace_partner" : "none",
    status: isMarketplace ? "active" : "pending_payment",
    marketplace_enabled: mode !== "fleetos_professional",
    marketplace_fee_rate: mode === "fleetos_professional" ? 0 : mode === "hybrid_growth" ? 0.04 : 0.08,
    monthly_subscription_amount: isMarketplace ? 0 : 29.99,
    uses_uride_payments: answers.payment_preference !== "Use my own payment processor",
    uses_own_payments: answers.payment_preference === "Use my own payment processor",
    contactless_enabled: answers.wants_contactless === "Yes",
    dealer_network_enabled: ["Yes", "Maybe later"].includes(answers.vehicle_acquisition_interest) || ["Yes", "Maybe later"].includes(answers.inventory_liquidation_interest),
    dealer_network_membership_status: "pending_payment",
    dealer_network_annual_fee: 100,
    dealer_network_transaction_fee: 50,
    gps_subscription_enabled: answers.wants_contactless === "Yes",
    custom_domain_enabled: ["Yes, basic presence", "Yes, established brand"].includes(answers.website_branding_status),
    concierge_sourcing_enabled: ["Yes", "Maybe later"].includes(answers.vehicle_acquisition_interest),
    concierge_liquidation_enabled: ["Yes", "Maybe later"].includes(answers.inventory_liquidation_interest),
    effective_date: now.slice(0, 10),
    last_updated_at: now,
    activation_source: isMarketplace ? "host_approval" : "subscription_payment",
    payment_required: !isMarketplace,
    billing_activation_pending: !isMarketplace,
    last_payment_status: isMarketplace ? "not_required" : "pending",
    status_audit_log: [{
      from_status: "created",
      to_status: isMarketplace ? "active" : "pending_payment",
      changed_by: "system",
      changed_at: now,
      reason: isMarketplace ? "Marketplace Partner is active with no monthly subscription." : "Paid plan selected and pending future billing activation.",
      source: "user_selection"
    }],
  };
}