/**
 * CANONICAL PLATFORM FEE RESOLVER
 *
 * Single source of truth for all uRide platform fee determinations.
 * ALL payment flows (Stripe, weekly billing, manual/admin, backfill, reconciliation)
 * MUST call resolvePlatformFee() — never inline commission logic anywhere else.
 *
 * Plan defaults:
 *   marketplace_partner  → 8% marketplace commission
 *   hybrid_growth        → 4% hybrid commission
 *   fleetos_professional → 0% (subscription-based, no marketplace commission)
 */

const PLAN_FEE_DEFAULTS = {
  marketplace_partner:  { platform_fee_rate: 0.08, requires_platform_fee: true,  label: 'Marketplace Partner (8%)' },
  hybrid_growth:        { platform_fee_rate: 0.04, requires_platform_fee: true,  label: 'Hybrid Growth (4%)' },
  fleetos_professional: { platform_fee_rate: 0.00, requires_platform_fee: false, label: 'FleetOS Professional (0%)' },
};

const MANUAL_PAYMENT_METHODS = ['zelle', 'cash', 'cashapp', 'venmo', 'check', 'other'];
const STRIPE_PAYMENT_METHODS = ['stripe'];

/**
 * Resolve the effective platform fee for a payment.
 *
 * @param {object} opts
 * @param {string}  opts.planMode              - active_mode from OperatorPlanConfiguration ('marketplace_partner'|'hybrid_growth'|'fleetos_professional')
 * @param {number}  opts.grossAmount            - total gross payment collected (dollars)
 * @param {string}  [opts.paymentMethod]        - 'stripe'|'zelle'|'cash'|'cashapp'|'venmo'|'check'|'other'
 * @param {object}  [opts.operatorPlan]         - OperatorPlanConfiguration record (optional override)
 * @param {object}  [opts.commerceProfile]      - HostCommerceProfile record (optional override)
 * @param {object}  [opts.hostPaymentSettings]  - HostPaymentSettings record (for payment routing check)
 *
 * @returns {{
 *   platform_fee_rate: number,
 *   platform_fee_amount_due: number,
 *   host_net_after_fee: number,
 *   requires_platform_fee: boolean,
 *   fee_collection_status: 'due'|'not_applicable',
 *   manual_collection_requires_platform_fee: boolean,
 *   is_manual_payment: boolean,
 *   plan_mode: string,
 *   plan_label: string,
 *   resolution_source: string,
 * }}
 */
export function resolvePlatformFee({ planMode, grossAmount, paymentMethod = 'stripe', operatorPlan = null, commerceProfile = null, hostPaymentSettings = null }) {
  const gross = Number(grossAmount) || 0;
  const normalizedPlan = normalizePlanMode(planMode, operatorPlan, commerceProfile);

  // Plan defaults — override with operator plan's configured fee rate if present
  const planDefaults = PLAN_FEE_DEFAULTS[normalizedPlan] || PLAN_FEE_DEFAULTS.marketplace_partner;

  // Allow plan-specific override of commission rate from OperatorPlanConfiguration
  let effectiveFeeRate = planDefaults.platform_fee_rate;
  if (operatorPlan?.marketplace_fee_rate != null && operatorPlan.marketplace_fee_rate >= 0) {
    effectiveFeeRate = operatorPlan.marketplace_fee_rate;
  } else if (commerceProfile?.commission_rate != null && commerceProfile.commission_rate >= 0) {
    effectiveFeeRate = commerceProfile.commission_rate;
  }

  const isManualPayment = MANUAL_PAYMENT_METHODS.includes((paymentMethod || '').toLowerCase());
  const requiresFee = planDefaults.requires_platform_fee && effectiveFeeRate > 0;

  const platformFeeAmountDue = requiresFee ? Math.round(gross * effectiveFeeRate * 100) / 100 : 0;
  const hostNetAfterFee = Math.round((gross - platformFeeAmountDue) * 100) / 100;

  const resolutionSource = operatorPlan?.marketplace_fee_rate != null
    ? 'operator_plan_config'
    : commerceProfile?.commission_rate != null
    ? 'commerce_profile'
    : 'plan_defaults';

  return {
    platform_fee_rate: effectiveFeeRate,
    platform_fee_amount_due: platformFeeAmountDue,
    host_net_after_fee: hostNetAfterFee,
    requires_platform_fee: requiresFee,
    fee_collection_status: platformFeeAmountDue > 0 ? 'due' : 'not_applicable',
    manual_collection_requires_platform_fee: isManualPayment && requiresFee,
    is_manual_payment: isManualPayment,
    plan_mode: normalizedPlan,
    plan_label: planDefaults.label,
    resolution_source: resolutionSource,
  };
}

/**
 * Normalize and resolve the canonical plan mode from available data.
 */
function normalizePlanMode(planMode, operatorPlan, commerceProfile) {
  // Explicit plan mode passed in takes priority
  if (planMode && planMode !== 'none' && PLAN_FEE_DEFAULTS[planMode]) return planMode;

  // Try operator plan configuration
  if (operatorPlan) {
    const mode = operatorPlan.active_mode || operatorPlan.selected_mode;
    if (mode && mode !== 'none' && PLAN_FEE_DEFAULTS[mode]) return mode;
  }

  // Try commerce profile
  if (commerceProfile) {
    const pt = commerceProfile.plan_type;
    if (pt && PLAN_FEE_DEFAULTS[pt]) return pt;
  }

  // Default to marketplace_partner (most common / safest for fee recovery)
  return 'marketplace_partner';
}

/**
 * Convenience helper: is this payment method a manual (outside Stripe) collection?
 */
export function isManualPaymentMethod(paymentMethod) {
  return MANUAL_PAYMENT_METHODS.includes((paymentMethod || '').toLowerCase());
}

/**
 * Convenience helper: is this payment method Stripe/uRide-collected?
 */
export function isStripePaymentMethod(paymentMethod) {
  return STRIPE_PAYMENT_METHODS.includes((paymentMethod || '').toLowerCase());
}