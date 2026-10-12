/**
 * Booking intent resolver for fleet map markers.
 *
 * Determines the "intent level" of a vehicle based on its booking activity:
 *   active_rental  → green pulse   (customer has the car)
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

const FRESH_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours — still "live"
const ABANDONED_THRESHOLD_MS = 30 * 60 * 1000; // 30 min — then "abandoned"

export const INTENT_LEVELS = {
  active_rental: { color: "#22C55E", label: "Rented", pulse: true, priority: 4 },
  confirmed:     { color: "#3B82F6", label: "Confirmed", pulse: false, priority: 3 },
  live_interest: { color: "#FF9F0A", label: "Pending", pulse: true, priority: 2 },
  abandoned:     { color: "#FF9F0A", label: "Abandoned", pulse: false, dashed: true, priority: 1 },
  available:     { color: "#22C55E", label: "Available", pulse: false, priority: 0 },
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
  const counts = { live_interest: 0, abandoned: 0, confirmed: 0, active_rental: 0 };
  for (const v of vehicles) {
    const entry = intentMap[v.id];
    if (entry && counts[entry.intent] !== undefined) counts[entry.intent]++;
  }
  return counts;
}