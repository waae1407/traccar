/**
 * Booking intent resolver for fleet map markers.
 *
 * Determines the "intent level" of a vehicle based on its booking activity:
 *   active_rental  → blue pulse    (customer has the car)
 *   starter_enforced    → red pulse (rental payment failed AND interrupt landed — car won't start)
 *   restriction_pending → red pulse (payment suspended, interrupt deferred until parked/heartbeat)
 *   confirmed      → blue ring     (paid, awaiting pickup)
 *   live_interest  → amber pulse   (customer in checkout flow right now)
 *   abandoned      → amber dashed  (started checkout but left >30 min ago)
 *   available      → green ring    (no booking activity)
 *
 * Priority: active_rental > confirmed > live_interest > abandoned > available
 */

const ACTIVE_RENTAL_STATUSES = new Set(["active", "checked_out", "return_required", "return_pending_host_review", "post_inspection_required", "overdue_return"]);
const CONFIRMED_STATUSES = new Set(["confirmed", "approved"]);
const LIVE_INTEREST_STATUSES = new Set(["draft", "pending_verification", "pending_contract", "pending_payment", "pending_review"]);
const PAYMENT_ISSUE_STATUSES = new Set(["payment_due", "grace_period", "suspended"]);

/**
 * Resolve which payment-family tag a payment-issue booking gets.
 *
 * Enforcement comes from the BOOKING's rental payment — never the device's
 * starter flag alone, since a starter can also be disabled by door-lock sync or
 * a manual toggle. A booking only reads "enforced" when its rental payment
 * failed AND the interrupt actually landed.
 */
function resolvePaymentIntent(booking) {
  const rentalPaymentFailed = booking.payment_status === "failed" || booking.payment_status === "overdue";
  if (!rentalPaymentFailed) return "payment_issue";
  if (booking.starter_disabled === true || booking.moovetrax_kill_active === true) return "starter_enforced";
  if (booking.starter_disable_pending === true) return "restriction_pending";
  return "payment_issue";
}

const FRESH_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours — still "live"
const ABANDONED_THRESHOLD_MS = 30 * 60 * 1000; // 30 min — then "abandoned"

export const INTENT_LEVELS = {
  active_rental:  { color: "#3B82F6", label: "Rented", pulse: true, priority: 5 },
  starter_enforced:    { color: "#EF4444", label: "Starter Enforced", pulse: true, priority: 4.6 },
  restriction_pending: { color: "#EF4444", label: "Restriction Pending", pulse: true, priority: 4.5 },
  payment_issue:  { color: "#EF4444", label: "Payment Due", pulse: true, priority: 4 },
  confirmed:      { color: "#3B82F6", label: "Confirmed", pulse: false, priority: 3 },
  live_interest:  { color: "#FF9F0A", label: "Pending", pulse: true, priority: 2 },
  maintenance:    { color: "#F59E0B", label: "Maintenance", pulse: false, priority: 1.5 },
  abandoned:      { color: "#FF9F0A", label: "Abandoned", pulse: false, dashed: true, priority: 1 },
  off_road:       { color: "#8E8E93", label: "Off Road", pulse: false, priority: 0.5 },
  available:      { color: "#22C55E", label: "Available", pulse: false, priority: 0 },
};

const CHECKOUT_STEPS = [
  "select_vehicle", "account", "profile", "verification",
  "terms", "contract", "payment", "confirmation",
];

export function getCheckoutStepProgress(checkoutStep) {
  const idx = CHECKOUT_STEPS.indexOf(checkoutStep);
  return { step: idx + 1, total: CHECKOUT_STEPS.length, label: checkoutStep };
}

/**
 * Build a map of vehicle_id → { intent, booking } from a list of bookings.
 * Only the highest-priority intent per vehicle is kept.
 */
export function computeBookingIntentByVehicle(bookings = []) {
  const map = {};
  const now = Date.now();

  for (const b of bookings) {
    if (!b.vehicle_id) continue;
    if (["cancelled", "rejected", "superseded_invalid", "completed"].includes(b.booking_status)) continue;

    const ageMs = b.created_date ? now - new Date(b.created_date).getTime() : 0;
    let intent = null;

    if (ACTIVE_RENTAL_STATUSES.has(b.booking_status)) {
      intent = "active_rental";
    } else if (PAYMENT_ISSUE_STATUSES.has(b.booking_status)) {
      intent = resolvePaymentIntent(b);
    } else if (CONFIRMED_STATUSES.has(b.booking_status)) {
      intent = "confirmed";
    } else if (LIVE_INTEREST_STATUSES.has(b.booking_status)) {
      if (b.abandoned_checkout || ageMs >= ABANDONED_THRESHOLD_MS) {
        // Started but went stale
        if (ageMs < 24 * 60 * 60 * 1000) intent = "abandoned"; // only show abandoned for 24h
      } else if (ageMs < FRESH_WINDOW_MS) {
        intent = "live_interest";
      }
    }

    if (!intent) continue;

    const priority = INTENT_LEVELS[intent].priority;
    const existing = map[b.vehicle_id];
    if (!existing || priority > INTENT_LEVELS[existing.intent].priority) {
      map[b.vehicle_id] = { intent, booking: b };
    }
  }

  return map;
}

/**
 * Count vehicles by intent level for filter chips.
 */
export function countByIntent(intentMap, vehicles) {
  const counts = { live_interest: 0, abandoned: 0, confirmed: 0, active_rental: 0, payment_issue: 0, starter_enforced: 0, restriction_pending: 0, maintenance: 0, off_road: 0 };
  for (const v of vehicles) {
    const entry = intentMap[v.id];
    if (entry && counts[entry.intent] !== undefined) counts[entry.intent]++;
  }
  return counts;
}