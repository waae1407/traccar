/**
 * Display Formatters — converts internal backend terms to business-friendly language.
 * Use these everywhere in the UI. Never render raw internal keys directly.
 */

// ── Activity / Event types ───────────────────────────────────────────────────
const EVENT_TYPE_LABELS = {
  // Payments
  'payment.succeeded': 'Payment received',
  'payment.failed': 'Payment failed',
  'payment.retry': 'Payment retry attempted',
  'payment.retry_failed': 'Payment retry failed',
  'payment.retry_deferred': 'Payment retry deferred',
  'payment.logged': 'Payment recorded',
  'payment.refunded': 'Payment refunded',
  'payment.starter_disabled': 'Vehicle access restricted',
  'payment.starter_disable_pending_vehicle_running': 'Vehicle restriction pending',
  'payment.no_device_starter_disable_not_sent': 'No vehicle device — restriction not sent',
  'payment.final_reminder_sent': 'Final payment reminder sent',
  'payment_received': 'Payment received',
  'payment_submitted': 'Payment submitted',
  'payment_overdue': 'Payment overdue',
  'payment_due_soon': 'Payment due soon',
  // Bookings
  'booking.activated': 'Booking activated',
  'booking.approved': 'Booking approved',
  'booking.cancelled': 'Booking cancelled',
  'booking.completed': 'Booking completed',
  'booking.submitted': 'Booking submitted',
  'booking.status_changed': 'Booking status updated',
  'booking.suspended': 'Account suspended',
  'booking.rejected': 'Booking rejected',
  'booking_started': 'Booking started',
  'booking_confirmed': 'Booking confirmed',
  'booking_active': 'Rental active',
  'booking_completed': 'Rental completed',
  // Admin
  'admin.override': 'Admin action taken',
  'admin.note_added': 'Note added',
  'admin.payout_held': 'Payout held',
  'admin_manual_payment_restored_booking': 'Account restored to good standing',
  // GPS / Telematics
  'gps.kill_sent': 'Vehicle restriction sent',
  'gps.kill_confirmed': 'Vehicle restriction confirmed',
  'gps.kill_failed': 'Vehicle restriction failed',
  'gps.reinstate_sent': 'Vehicle access restored',
  'gps.reinstate_confirmed': 'Vehicle access confirmed',
  'gps.command_sent': 'Vehicle action sent',
  'gps.command_failed': 'Vehicle action failed',
  'gps.device_offline': 'GPS device offline',
  'gps.device_online': 'GPS device online',
  // Compliance
  'compliance.doc_uploaded': 'Compliance document uploaded',
  'compliance.approved': 'Compliance approved',
  'compliance.expired': 'Compliance expired',
  'compliance.booking_blocked': 'Booking blocked — compliance required',
  'compliance.reminder_sent': 'Compliance reminder sent',
  // Verification
  'id_uploaded': 'ID uploaded',
  'verification_submitted': 'Verification submitted',
  'verification_verified': 'Identity verified',
  // Contracts
  'contract_generated': 'Contract generated',
  'contract_signed': 'Contract signed',
  // Payouts
  'payout.created': 'Payout created',
  'payout.sent': 'Payout sent',
  'payout.held': 'Payout held',
  'payout.released': 'Payout released',
  'payout.failed': 'Payout failed',
  // Disputes
  'dispute.opened': 'Dispute opened',
  'dispute.resolved': 'Dispute resolved',
  'dispute.chargeback_received': 'Chargeback received',
  // Misc
  'account_created': 'Account created',
  'profile_updated': 'Profile updated',
  'under_review': 'Under review',
  'billing.fee_rate_calculated': 'Billing fee calculated',
  'email_delivery_failed': 'Notification delivery issue',
};

export function formatActivityMessage(eventTypeOrSummary, summary) {
  // If we have a summary, sanitize it first
  const raw = summary || eventTypeOrSummary || '';
  const sanitized = sanitizeInternalText(raw);
  if (sanitized && sanitized !== raw) return sanitized;
  // Try label lookup
  const label = EVENT_TYPE_LABELS[eventTypeOrSummary];
  if (label) return label;
  // Fallback: humanize the raw key
  return humanizeKey(eventTypeOrSummary);
}

// ── Alert types ──────────────────────────────────────────────────────────────
const ALERT_TYPE_LABELS = {
  'rental_payment_failed': 'Payment failed',
  'weekly_billing_failed': 'Weekly payment failed',
  'payment_authentication_required': 'Payment authentication required',
  'chargeback_opened': 'Chargeback opened',
  'chargeback_lost': 'Chargeback lost',
  'payout_reversal': 'Payout reversed',
  'transfer_failed': 'Transfer failed',
  'subscription_payment_failed': 'Subscription payment failed',
  'payment_retry_scheduled': 'Payment retry scheduled',
  'payment_recovered': 'Payment recovered',
  'retry_successful': 'Retry successful',
  'payout_completed': 'Payout completed',
  'chargeback_won': 'Chargeback won',
  'subscription_renewed': 'Subscription renewed',
  'alert_resolved': 'Alert resolved',
  'refund_recorded': 'Refund recorded',
  'unknown_payment_failed': 'Payment failed',
  'unknown_billing_context': 'Billing issue',
  'fleetos_manual_payment_required': 'Manual payment required',
  'provider_health_warning': 'GPS system warning',
  'qa_failure': 'Device installation issue',
};

export function formatAlertType(alertType) {
  return ALERT_TYPE_LABELS[alertType] || humanizeKey(alertType);
}

// ── Payment source types ─────────────────────────────────────────────────────
const PAYMENT_SOURCE_LABELS = {
  'stripe_webhook': 'Automatic payment',
  'scheduled_billing': 'Weekly billing',
  'grace_retry': 'Payment retry',
  'admin_manual': 'Manual payment',
  'admin_charge': 'Admin charge',
  'backfill': 'Historical record',
  'manual_import': 'Imported record',
  'unknown': 'Payment',
};

export function formatPaymentSource(sourceType) {
  return PAYMENT_SOURCE_LABELS[sourceType] || 'Payment';
}

// ── Vehicle / telematics command types ───────────────────────────────────────
const COMMAND_TYPE_LABELS = {
  'locate': 'Locate vehicle',
  'lock': 'Lock vehicle',
  'unlock': 'Unlock vehicle',
  'horn': 'Sound horn',
  'lights': 'Flash lights',
  'horn_lights': 'Sound horn & flash lights',
  'alarm_pulse': 'Sound alarm',
  'disable_starter': 'Vehicle start restriction',
  'restore_starter': 'Vehicle access restored',
  'status': 'Check vehicle status',
};

export function formatVehicleAction(commandType) {
  return COMMAND_TYPE_LABELS[commandType] || humanizeKey(commandType);
}

// ── Command status labels ────────────────────────────────────────────────────
const COMMAND_STATUS_LABELS = {
  'queued': 'Queued',
  'sending': 'Sending',
  'sent': 'Sent',
  'delivered': 'Delivered',
  'acknowledged': 'Acknowledged',
  'executed': 'Completed',
  'confirmed': 'Confirmed',
  'failed': 'Failed',
  'expired': 'Expired',
  'blocked': 'Blocked',
};

export function formatCommandStatus(status) {
  return COMMAND_STATUS_LABELS[status] || humanizeKey(status);
}

// ── Technical references (payment IDs, etc.) ────────────────────────────────
export function formatPaymentReference(id, role = 'customer') {
  if (!id) return '—';
  if (role === 'customer') return 'Payment reference available';
  if (role === 'host') return `Payment ref …${String(id).slice(-6)}`;
  // admin
  return `…${String(id).slice(-8)}`;
}

export function formatTechnicalReference(value, role = 'customer') {
  if (!value) return '—';
  if (role === 'customer') return 'Reference on file';
  if (role === 'host') return `…${String(value).slice(-6)}`;
  return `…${String(value).slice(-8)}`;
}

// ── GPS / provider labels ────────────────────────────────────────────────────
export function formatGpsProvider(providerKey, role = 'customer') {
  if (role === 'admin') return providerKey || 'GPS provider';
  return 'GPS device';
}

export function formatOnlineStatus(status, lastSeenAt) {
  if (!status || status === 'unknown') {
    if (!lastSeenAt) return 'Status unknown';
    const ageMs = Date.now() - new Date(lastSeenAt).getTime();
    if (ageMs < 10 * 60 * 1000) return 'Recently active';
    if (ageMs < 60 * 60 * 1000) return 'Last seen recently';
    return 'Offline';
  }
  if (status === 'online') return 'Online';
  if (status === 'offline') return 'Offline';
  return 'Status unknown';
}

export function formatGpsFreshnessLabel(lastSeenAt) {
  if (!lastSeenAt) return 'No GPS data';
  const ageMs = Date.now() - new Date(lastSeenAt).getTime();
  if (ageMs < 10 * 60 * 1000) return 'Live';
  if (ageMs < 60 * 60 * 1000) return 'Recently seen';
  return `Last seen ${Math.round(ageMs / (60 * 60 * 1000))}h ago`;
}

// ── Starter / vehicle access flags ──────────────────────────────────────────
export function formatStarterStatus(booking) {
  if (!booking) return null;
  if (booking.starter_disable_pending) return 'Vehicle restriction pending';
  if (booking.starter_disabled || booking.moovetrax_kill_active) return 'Vehicle access restricted';
  return null;
}

// ── Billing context ──────────────────────────────────────────────────────────
const BILLING_CONTEXT_LABELS = {
  'rental_payment': 'Rental payment',
  'weekly_billing': 'Weekly billing',
  'payout': 'Payout',
  'subscription': 'Subscription',
  'dealer_network': 'Dealer network',
  'contactless_gps': 'GPS subscription',
  'chargeback': 'Chargeback',
  'reversal': 'Payment reversal',
  'refund': 'Refund',
  'unknown': 'Payment',
  'fleetos_payment_recovery': 'Payment recovery',
  'fleetos_host_direct_payment': 'Direct payment',
};

export function formatBillingContext(context) {
  return BILLING_CONTEXT_LABELS[context] || humanizeKey(context);
}

// ── Sanitize stored text that may contain internal terms ────────────────────
const SANITIZE_REPLACEMENTS = [
  [/Admin forensic correction:\s*/gi, ''],
  [/moovetrax_kill_active cleared/gi, 'vehicle access restored'],
  [/moovetrax_kill_active (has been )?(enabled|set|activated)/gi, 'vehicle access restricted'],
  [/moovetrax_kill_active/gi, 'vehicle access restriction'],
  [/starter_disable_pending/gi, 'vehicle restriction pending'],
  [/starter_disabled/gi, 'vehicle start restricted'],
  [/Manual PaymentLog created/gi, 'Manual payment recorded'],
  [/PaymentLog/gi, 'Payment record'],
  [/BookingRequest/gi, 'Booking'],
  [/ActivityEvent/gi, 'Activity'],
  [/TelematicsCommand/gi, 'Vehicle action'],
  [/TelematicsEvent/gi, 'Vehicle update'],
  [/HostPayout/gi, 'Payout'],
  [/HostReceivable/gi, 'Outstanding balance'],
  [/PaymentOperationalAlert/gi, 'Payment alert'],
  [/sendTelematicsCommand\s*(restore_starter)/gi, 'Vehicle access restored'],
  [/sendTelematicsCommand\s*(disable_starter)/gi, 'Vehicle access restricted'],
  [/sendTelematicsCommand/gi, 'Remote vehicle action'],
  [/processWeeklyBilling/gi, 'Weekly billing'],
  [/processGracePeriod/gi, 'Payment recovery process'],
  [/stripeWebhook/gi, 'Payment update'],
  [/adminPaymentAction/gi, 'Admin payment action'],
  [/record_manual_payment/gi, 'Manual payment recorded'],
  [/admin_manual_payment_restored_booking/gi, 'Account restored to good standing'],
  [/no_telematics_device_restore_not_required/gi, 'No vehicle device action required'],
  [/no_telematics_device_starter_disable_not_sent/gi, 'Vehicle device not available; restriction was not sent'],
  [/booking restored to active\/paid/gi, 'account restored to good standing'],
  [/\bTraccar\b/gi, 'GPS system'],
  [/\bMooveTrax\b/gi, 'GPS device'],
  [/\bmoovetrax\b/gi, 'GPS device'],
  [/payment_intent/gi, 'payment reference'],
  [/stripe_charge_id/gi, 'payment reference'],
  [/dedupe_key/gi, 'internal reference'],
  [/\bwebhook\b/gi, 'payment update'],
  [/raw payload/gi, 'system data'],
  [/provider response/gi, 'system response'],
  [/\bapi\b/gi, 'system'],
  [/\bentity\b/gi, 'record'],
  [/\bfunction\b/gi, 'process'],
  [/\bdatabase\b/gi, 'system'],
];

export function sanitizeInternalText(text) {
  if (!text) return text;
  let result = String(text);
  for (const [pattern, replacement] of SANITIZE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  // Capitalize first letter after sanitization
  return result.charAt(0).toUpperCase() + result.slice(1);
}

// ── Generic key humanizer ────────────────────────────────────────────────────
function humanizeKey(key) {
  if (!key) return '—';
  return String(key)
    .replace(/[._]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}