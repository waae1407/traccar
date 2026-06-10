export const OPERATIONAL_MODES = {
  marketplace_partner: {
    label: "Marketplace Partner",
    price: "8% per completed marketplace booking",
    summary: "Best when uRideHub helps bring renters and marketplace demand.",
    benefits: ["Get customers from the uRide marketplace", "Rental contracts handled for you", "Payments processed by uRide", "Automatic payouts after rentals"],
    tools: ["Marketplace exposure", "Payment routing options", "Contracts", "Compliance", "Customer flow"],
  },
  fleetos_professional: {
    label: "FleetOS Professional",
    price: "$29.99/month",
    summary: "Best for operators with their own customers who need infrastructure.",
    benefits: ["Keep your own customers", "Run your business from one dashboard", "Use your own rental agreements", "Get paid directly through your Stripe account", "GPS tracking & vehicle controls"],
    tools: ["Booking system", "Contracts", "Operations dashboard", "Customer management", "No marketplace transaction fee on direct business"],
  },
  hybrid_growth: {
    label: "Hybrid Growth",
    price: "$29.99/month + 5% marketplace booking fee",
    summary: "Best when you have direct customers but also want uRideHub demand.",
    benefits: ["Get customers from the uRide marketplace", "Keep and manage your own customers", "Run your fleet from one dashboard", "GPS tracking & vehicle controls"],
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
  const oneTimeAmount = addon?.oneTimePrice || 0;
  const monthlyAmount = addon?.monthlyPrice || 0;
  const annualAmount = addon?.annualPrice || 0;
  const transactionFeeAmount = addon?.transactionFee || 0;
  const pendingBilling = selected || key === "contactless_operations" || key === "dealer_network";

  return {
    host_id: hostId,
    user_id: userId,
    addon_key: key,
    addon_type: key,
    status: selected ? "selected" : "recommended",
    interest_status: selected ? "selected" : "recommended",
    selected,
    recommended,
    selection_source: source,
    activation_status: "not_activated",
    billing_status: pendingBilling ? "pending_billing_activation" : "not_required",
    setup_status: "not_started",
    one_time_price: oneTimeAmount,
    one_time_amount: oneTimeAmount,
    monthly_price: monthlyAmount,
    monthly_amount: monthlyAmount,
    per_vehicle_amount: key === "contactless_operations" ? 15 : 0,
    annual_price: annualAmount,
    annual_amount: annualAmount,
    transaction_fee: transactionFeeAmount,
    transaction_fee_amount: transactionFeeAmount,
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
  if (["Use my own payment system", "Use my own payment processor", "Start with my own payments, enable uRideHub Payments later"].includes(answers.payment_preference)) scores.fleetos_professional += 3;
  if (["I’m a dealership", "I manage a commercial fleet"].includes(answers.business_type)) scores.fleetos_professional += 2;

  if (["Some repeat customers", "Yes, we already operate independently"].includes(answers.has_existing_customers) && ["Yes", "Maybe occasionally"].includes(answers.wants_marketplace_demand)) {
    scores.hybrid_growth += 5;
    reasons.push("You have some demand already but still want growth channels.");
  }
  if (["11–25", "26–100", "100+"].includes(answers.fleet_size_range)) scores.hybrid_growth += 2;
  if (needs.includes("Marketplace exposure") && needs.length >= 3) scores.hybrid_growth += 2;

  const qualified_mode = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const ownPaymentSelected = ["Use my own payment system", "Use my own payment processor"].includes(answers.payment_preference);
  const recommended_mode = ownPaymentSelected ? "fleetos_professional" : qualified_mode;
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const recommendation_confidence = Math.round((scores[qualified_mode] / total) * 100);
  const addons = [];
  if (answers.wants_contactless === "Yes" || needs.includes("Contactless rentals")) addons.push("contactless_operations", "gps_telematics");
  if (["Yes", "Maybe later"].includes(answers.vehicle_acquisition_interest)) addons.push("dealer_network", "vehicle_sourcing");
  if (["Yes", "Maybe later"].includes(answers.inventory_liquidation_interest)) addons.push("inventory_liquidation", "dealer_network");
  if (["Yes, basic presence", "Yes, established brand"].includes(answers.website_branding_status)) addons.push("custom_domain");
  if (needs.includes("AI inspections")) addons.push("ai_inspections");

  const overrideNotice = ownPaymentSelected && qualified_mode !== "fleetos_professional"
    ? `You qualified for ${OPERATIONAL_MODES[qualified_mode].label}, but because you chose to use your own payment system, we placed you in FleetOS by default.`
    : "";

  return {
    recommended_mode,
    qualified_mode,
    payment_system_override_applied: !!overrideNotice,
    payment_system_override_notice: overrideNotice,
    recommendation_confidence,
    recommendation_reasoning: overrideNotice ? [...reasons, overrideNotice] : (reasons.length ? reasons : [OPERATIONAL_MODES[recommended_mode].summary]),
    recommended_addons: [...new Set(addons)],
  };
}

function paymentModeFromPreference(preference) {
  if (preference === "Use uRideHub Payments" || preference === "Use uRideHub payments") return "uride_payments";
  if (preference === "Start with my own payments, enable uRideHub Payments later") return "hybrid";
  return "own_payments";
}

export function planDefaults(mode, answers = {}, recommendedMode = mode, options = {}) {
  const isMarketplace = mode === "marketplace_partner";
  const now = new Date().toISOString();
  const paymentMode = paymentModeFromPreference(answers.payment_preference);
  const usesUridePayments = false;
  const usesOwnPayments = paymentMode === "own_payments" || paymentMode === "hybrid";
  const feeAcknowledged = !!options.feeAcknowledged;

  return {
    recommended_mode: recommendedMode,
    selected_mode: mode,
    active_mode: isMarketplace ? "marketplace_partner" : "none",
    status: isMarketplace ? "active" : "pending_payment",
    marketplace_enabled: mode !== "fleetos_professional",
    marketplace_fee_rate: mode === "fleetos_professional" ? 0 : mode === "hybrid_growth" ? 0.05 : 0.08,
    monthly_subscription_amount: isMarketplace ? 0 : 29.99,
    payment_mode: paymentMode,
    uses_uride_payments: usesUridePayments,
    uses_own_payments: usesOwnPayments,
    uride_payments_enabled_at: undefined,
    own_payments_enabled_at: usesOwnPayments ? now : undefined,
    stripe_connect_required: false,
    stripe_connect_optional: true,
    fee_structure_acknowledged: feeAcknowledged,
    fee_structure_acknowledged_at: feeAcknowledged ? now : undefined,
    fee_structure_acknowledged_by: options.actor || undefined,
    fee_structure_summary: "Package controls business tools. Payment mode controls how customer money moves.",
    platform_billing_route: isMarketplace ? "commission" : mode === "hybrid_growth" ? "subscription_plus_marketplace" : "subscription",
    customer_payment_routing: usesUridePayments ? "uride_checkout" : "host_external",
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