import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CRITICAL = new Set(['rental_payment_failed','weekly_billing_failed','payment_authentication_required','chargeback_opened','chargeback_lost','payout_reversal','transfer_failed','subscription_payment_failed','dealer_membership_payment_failed','contactless_gps_payment_failed','bank_debit_reversal','refund_failed','payment_method_missing','unknown_payment_failed']);
const INFO = new Set(['payment_recovered','retry_successful','payout_completed','chargeback_won','subscription_renewed','dealer_membership_renewed','alert_resolved']);
const OPEN_STATUSES = ['new','notified','acknowledged','under_review','retry_scheduled','escalated'];

function normalizeBillingContext(value = '') {
  const context = String(value || '').toLowerCase();
  if (['rental_marketplace_payment','rental_payment','weekly_billing'].includes(context)) return context === 'weekly_billing' ? 'weekly_billing' : 'rental_payment';
  if (context === 'operator_subscription' || context === 'subscription') return 'subscription';
  if (context === 'dealer_network_membership' || context === 'dealer_network_transaction_fee' || context === 'dealer_network') return 'dealer_network';
  if (context === 'gps_contactless_subscription' || context === 'contactless_gps') return 'contactless_gps';
  if (context === 'chargeback') return 'chargeback';
  if (context === 'refund') return 'refund';
  if (context === 'payout') return 'payout';
  if (context === 'reversal') return 'reversal';
  return 'unknown';
}

function severityFor(alertType, severity) {
  if (severity) return severity;
  if (CRITICAL.has(alertType)) return 'critical';
  if (INFO.has(alertType)) return 'info';
  return 'warning';
}

function defaultAction(alertType) {
  const actions = {
    rental_payment_failed: 'Review payment, retry billing, contact renter, or move booking to review.',
    weekly_billing_failed: 'Review payment, retry billing, contact renter, or move booking to review.',
    payment_retry_scheduled: 'Monitor retry outcome and contact renter if another attempt fails.',
    payment_recovered: 'Confirm booking and payment records are healthy.',
    retry_successful: 'Confirm retry recovery and close related open alerts if appropriate.',
    chargeback_opened: 'Review dispute evidence, contact host, and prepare response before the deadline.',
    chargeback_lost: 'Review financial exposure and determine manual remediation.',
    chargeback_won: 'Confirm dispute outcome and release any manual follow-up if needed.',
    transfer_failed: 'Review Stripe transfer failure and contact host before retrying payout.',
    payout_reversal: 'Review reversal details and notify finance operations.',
    subscription_payment_failed: 'Contact operator and review subscription billing status. Do not suspend automatically.',
    dealer_membership_payment_failed: 'Contact host about Dealer Network membership payment. Do not activate fees automatically.',
    contactless_gps_payment_failed: 'Review contactless/GPS billing. Do not disable telematics automatically.',
    refund_recorded: 'Confirm refund record and downstream payout impact.',
    unknown_billing_context: 'Review Stripe event metadata and route manually.'
  };
  return actions[alertType] || 'Review this payment operations alert and take manual action if needed.';
}

function titleFor(alertType, fallback) {
  if (fallback) return fallback;
  return alertType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function safeNotification(base44, notification) {
  try { await base44.asServiceRole.entities.Notification.create(notification); return true; }
  catch (e) { console.error('[PaymentOperationalAlert][Notification]', e.message); return false; }
}

async function findDuplicate(base44, payload) {
  const checks = [];
  if (payload.stripe_event_type && payload.stripe_payment_intent_id) checks.push({ stripe_event_type: payload.stripe_event_type, stripe_payment_intent_id: payload.stripe_payment_intent_id });
  if (payload.stripe_event_type && payload.stripe_invoice_id) checks.push({ stripe_event_type: payload.stripe_event_type, stripe_invoice_id: payload.stripe_invoice_id });
  if (payload.stripe_event_type && payload.stripe_dispute_id) checks.push({ stripe_event_type: payload.stripe_event_type, stripe_dispute_id: payload.stripe_dispute_id });
  if (payload.alert_type && payload.related_entity_type && payload.related_entity_id) checks.push({ alert_type: payload.alert_type, related_entity_type: payload.related_entity_type, related_entity_id: payload.related_entity_id });
  for (const query of checks) {
    const records = await base44.asServiceRole.entities.PaymentOperationalAlert.filter(query, '-created_date', 20);
    const open = records.find(a => OPEN_STATUSES.includes(a.status));
    if (open) return open;
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const input = await req.json();
    const now = new Date().toISOString();
    const alertType = input.alert_type || 'unknown_billing_context';
    const severity = severityFor(alertType, input.severity);
    const billingContext = normalizeBillingContext(input.billing_context);
    const relatedEntityType = input.related_entity_type || (input.booking_id ? 'BookingRequest' : input.host_id ? 'Host' : 'PaymentOperations');
    const relatedEntityId = input.related_entity_id || input.booking_id || input.host_id || input.stripe_payment_intent_id || input.stripe_invoice_id || input.stripe_dispute_id || '';

    const payload = {
      ...input,
      alert_type: alertType,
      severity,
      status: input.status || 'new',
      billing_context: billingContext,
      related_entity_type: relatedEntityType,
      related_entity_id: relatedEntityId,
      title: titleFor(alertType, input.title),
      message: input.message || 'A payment operations issue requires review.',
      recommended_action: input.recommended_action || defaultAction(alertType),
      currency: input.currency || 'usd',
      requires_admin_action: input.requires_admin_action ?? true,
      requires_host_action: input.requires_host_action ?? !!input.host_id,
      requires_customer_action: input.requires_customer_action ?? ['rental_payment_failed','weekly_billing_failed','payment_authentication_required','payment_method_missing'].includes(alertType),
      audit_log: [{ action_type: 'created', actor_role: 'system', actor_id: input.source || 'payment_operations', timestamp: now, note: input.message || alertType, previous_status: '', new_status: input.status || 'new' }],
    };

    const duplicate = await findDuplicate(base44, payload);
    if (duplicate) return Response.json({ ok: true, duplicate: true, alert: duplicate });

    const alert = await base44.asServiceRole.entities.PaymentOperationalAlert.create(payload);
    let hostNotified = false;
    let customerNotified = false;
    let adminNotified = false;

    adminNotified = await safeNotification(base44, { user_email: 'admin', title: `Payment Ops: ${payload.title}`, body: payload.message, type: 'alert', action_link: '/admin/payment-alerts', booking_request_id: payload.booking_id || '' });
    if (payload.host_email && payload.requires_host_action) hostNotified = await safeNotification(base44, { user_email: payload.host_email, title: payload.title, body: payload.message, type: 'alert', action_link: '/host/payments', booking_request_id: payload.booking_id || '' });
    if (payload.renter_email && payload.requires_customer_action) customerNotified = await safeNotification(base44, { user_email: payload.renter_email, title: payload.title, body: payload.message, type: 'payment', action_link: '/my-bookings', booking_request_id: payload.booking_id || '' });

    await base44.asServiceRole.entities.PaymentOperationalAlert.update(alert.id, {
      status: 'notified',
      push_sent: adminNotified || hostNotified || customerNotified,
      admin_email_sent: false,
      host_email_sent: false,
      customer_email_sent: false,
      sms_sent: false,
      email_sent: false,
    });

    return Response.json({ ok: true, duplicate: false, alert: { ...alert, status: 'notified' } });
  } catch (error) {
    console.error('[PaymentOperationalAlert] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});