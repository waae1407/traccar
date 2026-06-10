/**
 * Converts internal booking status strings into customer-friendly labels.
 * Use this wherever booking_status or payment_status is shown to customers.
 */

const BOOKING_STATUS_LABELS = {
  draft:                      "Booking Started",
  pending_verification:       "Identity Verification",
  pending_contract:           "Sign Contract",
  pending_payment:            "Payment Required",
  pending_review:             "Under Review",
  approved:                   "Approved",
  confirmed:                  "Confirmed",
  active:                     "Active Rental",
  payment_due:                "Payment Required",
  grace_period:               "Payment Overdue — Act Now",
  suspended:                  "Vehicle Access Restricted",
  under_review:               "Under Review",
  cancellation_requested:     "Cancellation Pending",
  return_pending_host_review: "Return Under Review",
  completed:                  "Completed",
  cancelled:                  "Cancelled",
  rejected:                   "Not Approved",
  more_info_requested:        "More Info Needed",
};

const PAYMENT_STATUS_LABELS = {
  unpaid:   "Not Paid",
  pending:  "Processing",
  paid:     "Paid",
  failed:   "Payment Failed",
  overdue:  "Overdue",
  due_soon: "Due Soon",
  refunded: "Refunded",
};

/**
 * @param {string} status - raw booking_status value
 * @param {string} [fallback] - optional custom fallback
 * @returns {string}
 */
export function friendlyBookingStatus(status, fallback) {
  return BOOKING_STATUS_LABELS[status] || fallback || status || "—";
}

/**
 * @param {string} status - raw payment_status value
 * @param {string} [fallback] - optional custom fallback
 * @returns {string}
 */
export function friendlyPaymentStatus(status, fallback) {
  return PAYMENT_STATUS_LABELS[status] || fallback || status || "—";
}