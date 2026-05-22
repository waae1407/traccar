export const CONFIDENCE_RULES = [
  {
    confidence: "trusted",
    rule: "Stripe or verified external evidence exists, payment is successful, amount and booking align, and no blocking issues are present.",
  },
  {
    confidence: "partially_trusted",
    rule: "Payment likely happened, but source evidence is incomplete, manual, legacy, or backfilled.",
  },
  {
    confidence: "unresolved",
    rule: "Payment cannot be relied on for reporting because identity, source, booking state, or payout linkage is unclear.",
  },
  {
    confidence: "excluded",
    rule: "Failed, refunded, duplicate, test, or invalid rows should be excluded from authoritative revenue and payout calculations.",
  },
];

const PROBLEM_PAYMENT_STATUSES = new Set(["failed", "refunded"]);
const NON_STRIPE_METHODS = new Set(["zelle", "cash", "cashapp", "venmo", "check", "other"]);
const BLOCKING_ISSUES = new Set([
  "duplicate_risk",
  "booking_state_mismatch",
  "booking_paid_no_successful_paymentlog",
  "host_payout_without_source_paymentlog",
]);

export function scorePaymentConfidence(payment = {}, issueTypes = [], context = {}) {
  const issues = new Set(issueTypes);
  const factors = [];
  let score = 50;

  if (payment.status === "paid") { score += 10; factors.push("Payment status is paid."); }
  if (payment.stripe_payment_intent_id || payment.stripe_charge_id) { score += 25; factors.push("Stripe payment identifier exists."); }
  if (context.hasBooking) { score += 10; factors.push("Linked booking exists."); }
  if (context.amountMatches) { score += 10; factors.push("Payment amount matches expected booking amount."); }
  if (payment.external_reference) { score += 10; factors.push("External reference exists."); }
  if (payment.notes && NON_STRIPE_METHODS.has(payment.payment_method)) { score += 5; factors.push("Manual payment includes an admin/source note."); }

  if (PROBLEM_PAYMENT_STATUSES.has(payment.status) || issues.has("failed_or_refunded")) { score -= 80; factors.push("Payment is failed or refunded."); }
  if (issues.has("booking_state_mismatch")) { score -= 35; factors.push("Booking/payment state mismatch exists."); }
  if (issues.has("duplicate_risk")) { score -= 35; factors.push("Duplicate payment risk exists."); }
  if (issues.has("missing_stripe_id") && payment.payment_method === "stripe") { score -= 25; factors.push("Stripe payment is missing Stripe identifiers."); }
  if (issues.has("missing_customer_id")) { score -= 10; factors.push("Customer attribution is incomplete."); }
  if (issues.has("missing_host_payout")) { score -= 10; factors.push("No linked HostPayout exists."); }
  if (payment.source_type === "backfill" || payment.legacy_flag || payment.recorded_by === "backfill") { score -= 10; factors.push("Record is legacy/backfilled."); }
  if (NON_STRIPE_METHODS.has(payment.payment_method)) { score -= 5; factors.push("Payment method is manual/non-Stripe."); }

  score = Math.max(0, Math.min(100, score));

  let label = "unresolved";
  if (score >= 85 && ![...issues].some((issue) => BLOCKING_ISSUES.has(issue))) label = "trusted";
  else if (score >= 45 && !PROBLEM_PAYMENT_STATUSES.has(payment.status)) label = "partially_trusted";
  if (score < 30 || PROBLEM_PAYMENT_STATUSES.has(payment.status) || issues.has("failed_or_refunded")) label = "excluded";
  if ([...issues].some((issue) => BLOCKING_ISSUES.has(issue))) label = "unresolved";

  return { label, score, factors };
}

export function classifyPaymentConfidence(payment = {}, issueTypes = [], context = {}) {
  return scorePaymentConfidence(payment, issueTypes, context).label;
}

export function getRecommendedPaymentAction(row = {}) {
  const issueTypes = row.issueTypes || [];
  if (issueTypes.includes("booking_state_mismatch")) return "Admin review required: verify booking state history before using this payment for reporting or payouts.";
  if (issueTypes.includes("duplicate_risk")) return "Admin review required: confirm whether this is a duplicate before counting revenue or payout eligibility.";
  if (issueTypes.includes("missing_host_payout")) return "Payout backfill preview only: verify host payout eligibility and prior external payment before creating any payout record.";
  if (issueTypes.includes("missing_stripe_id")) return "Recover Stripe identifiers or verify this was not Stripe-sourced before marking trusted.";
  if (issueTypes.includes("manual_payment")) return "Verify manual receipt or external reference before upgrading confidence.";
  if (issueTypes.includes("backfill")) return "Review historical source evidence and label reporting treatment before promotion.";
  if (issueTypes.includes("missing_customer_id")) return "Map customer identity from booking/user records during future cleanup.";
  if (issueTypes.includes("amount_mismatch")) return "Review expected booking amount versus collected amount before reporting.";
  if (issueTypes.includes("booking_paid_no_successful_paymentlog")) return "Review booking payment state; do not treat as paid until a source payment is confirmed.";
  if (issueTypes.includes("host_payout_without_source_paymentlog")) return "Review payout source; link to payment evidence before authoritative payout reporting.";
  return "No cleanup action required.";
}