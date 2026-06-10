/**
 * Smart logo home route helper.
 * Returns the correct "home" path based on user role and rental state.
 *
 * @param {object|null} user - current auth user (null = logged out)
 * @param {object|null} activeBooking - minimal booking record or null
 * @returns {string} - route path
 */

const ACTIVE_RENTAL_STATUSES = new Set([
  "approved", "active", "confirmed",
  "payment_due", "grace_period",
  "return_pending_host_review", "under_review",
]);

export function isActiveRental(booking) {
  return booking && ACTIVE_RENTAL_STATUSES.has(booking.booking_status);
}

export function getLogoHomeRoute(user, activeBooking = null) {
  if (!user) return "/";
  if (user.role === "admin") return "/admin/operations-center";
  if (user.role === "host") return "/host/dashboard";
  // customer
  if (isActiveRental(activeBooking)) return "/vehicle-command-center";
  return "/book-now";
}