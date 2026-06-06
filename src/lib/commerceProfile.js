export const PLAN_COMMERCE_DEFAULTS = {
  marketplace_partner: {
    plan_type: "marketplace_partner",
    marketplace_enabled: true,
    marketplace_visibility: true,
    booking_enabled: true,
    online_payments_enabled: true,
    payment_processor: "uride_stripe",
    commission_rate: 0.08,
    subscription_rate: 0,
    host_checkout_enabled: false,
  },
  hybrid_growth: {
    plan_type: "hybrid_growth",
    marketplace_enabled: true,
    marketplace_visibility: true,
    booking_enabled: true,
    online_payments_enabled: true,
    payment_processor: "uride_stripe",
    commission_rate: 0.04,
    subscription_rate: 29.99,
    host_checkout_enabled: false,
  },
  fleetos_professional: {
    plan_type: "fleetos_professional",
    marketplace_enabled: false,
    marketplace_visibility: false,
    booking_enabled: true,
    online_payments_enabled: false,
    payment_processor: "host_stripe",
    commission_rate: 0,
    subscription_rate: 29.99,
    host_checkout_enabled: false,
  },
};

export function commerceDefaultsForPlan(planType, host = {}) {
  const base = PLAN_COMMERCE_DEFAULTS[planType] || PLAN_COMMERCE_DEFAULTS.marketplace_partner;
  const stripeReady = !!host?.stripe_onboarding_complete && !!host?.stripe_account_id;
  if (base.plan_type !== "fleetos_professional") return { ...base, stripe_account_id: host?.stripe_account_id || "" };
  return {
    ...base,
    online_payments_enabled: stripeReady,
    stripe_account_id: host?.stripe_account_id || "",
    host_checkout_enabled: stripeReady,
  };
}

export function isMarketplaceVisible(commerceProfile, fallbackPlan) {
  if (commerceProfile) return commerceProfile.marketplace_enabled !== false && commerceProfile.marketplace_visibility !== false;
  return fallbackPlan?.marketplace_enabled !== false;
}