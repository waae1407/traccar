import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

async function logEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: data.actor_id || 'system',
      actor_email: data.actor_email || 'system',
      actor_role: data.actor_role || 'automation',
      target_entity: data.target_entity || '',
      target_id: data.target_id || '',
      target_label: data.target_label || '',
      host_id: data.host_id || '',
      booking_id: data.booking_id || '',
      vehicle_id: data.vehicle_id || '',
      customer_id: data.customer_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: data.source || 'webhook',
      user_email: data.actor_email || 'system',
      event_title: data.summary || data.event_type,
      event_description: data.summary || '',
      event_status: 'success',
    });
  } catch (e) {
    console.error('[AuditLog]', e.message);
  }
}

function generatePaymentDedupeKey({ sourceType = 'unknown', bookingId = '', weekNumber = '', amount = '', paidAt = '', paymentIntentId = '', externalReference = '', paymentMethod = '' }) {
  if (paymentIntentId) return `payment:stripe:${paymentIntentId}`;
  const paidDate = paidAt ? String(paidAt).slice(0, 10) : 'no-date';
  return `payment:${sourceType}:${bookingId}:week:${weekNumber}:amount:${amount}:date:${paidDate}:method:${paymentMethod || 'other'}:ref:${externalReference || 'none'}`;
}

function classifyPaymentSource({ sourceType, paymentIntentId, recordedBy } = {}) {
  if (sourceType) return sourceType;
  if (paymentIntentId) return recordedBy === 'stripe_webhook' ? 'stripe_webhook' : 'scheduled_billing';
  return 'unknown';
}

function classifyPaymentConfidence({ paymentIntentId } = {}) {
  return paymentIntentId ? 'trusted' : 'unresolved';
}

function getBillingContext(metadata = {}) {
  return metadata.billing_context || (metadata.booking_request_id ? 'rental_marketplace_payment' : 'unknown');
}

async function createPaymentAlert(base44, payload) {
  try {
    await base44.asServiceRole.functions.invoke('createPaymentOperationalAlert', payload);
  } catch (e) {
    console.error('[PaymentOperationalAlert]', e.message);
  }
}

async function alreadyProcessedInitialPayout(base44, { paymentIntentId, bookingRequestId, periodStart, periodEnd }) {
  const paymentLogs = paymentIntentId ? await base44.asServiceRole.entities.PaymentLog.filter({ stripe_payment_intent_id: paymentIntentId }) : [];
  const payouts = bookingRequestId ? await base44.asServiceRole.entities.HostPayout.filter({ booking_request_id: bookingRequestId }) : [];
  const duplicatePayout = payouts.some((p) =>
    p.stripe_payment_intent_id === paymentIntentId ||
    (p.status === 'paid' && p.period_start === periodStart && p.period_end === periodEnd && !!p.stripe_transfer_id)
  );
  return paymentLogs.length > 0 || duplicatePayout;
}

async function applyReceivableOffset(base44, hostId, amount, now) {
  const receivables = await base44.asServiceRole.entities.HostReceivable.filter({ host_id: hostId });
  let remainingOffset = Math.max(0, amount);
  let totalOffset = 0;
  for (const rec of receivables.filter((r) => ['open', 'partially_recovered'].includes(r.status) && r.offset_from_future_payouts !== false && (r.remaining_amount || 0) > 0)) {
    if (remainingOffset <= 0) break;
    const offset = Math.min(remainingOffset, rec.remaining_amount || 0);
    const newRemaining = Math.round(((rec.remaining_amount || 0) - offset) * 100) / 100;
    const recovered = Math.round(((rec.recovered_amount || 0) + offset) * 100) / 100;
    await base44.asServiceRole.entities.HostReceivable.update(rec.id, {
      remaining_amount: newRemaining,
      recovered_amount: recovered,
      status: newRemaining <= 0 ? 'recovered' : 'partially_recovered',
      last_recovery_at: now,
      audit_log: [...(rec.audit_log || []), { action: 'future_payout_offset', amount: offset, changed_at: now, note: 'Automatically offset from host payout.' }]
    });
    totalOffset += offset;
    remainingOffset -= offset;
  }
  return Math.round(totalOffset * 100) / 100;
}

function toIsoFromUnix(value) {
  return value ? new Date(value * 1000).toISOString() : undefined;
}

function isHostSubscriptionContext(context) {
  return context === 'host_platform_subscription' || context === 'operator_subscription';
}

function isGPSOrderContext(context) {
  return context === 'contactless_gps_order';
}

function isGPSSubscriptionContext(context) {
  return context === 'gps_contactless_subscription';
}

// ── Unified Subscription Dual-Write Helpers ──────────────────────────────────

function billingContextToItemType(context) {
  if (isHostSubscriptionContext(context)) return 'host_platform';
  if (isGPSSubscriptionContext(context)) return 'contactless360_gps';
  return null;
}

async function dualWriteSubscriptionItem(base44, { stripeSubscriptionId, status, paymentStatus, periodStart, periodEnd, metadata = {} }) {
  // Find the SubscriptionItem by stripe_subscription_id
  const items = await base44.asServiceRole.entities.SubscriptionItem.filter(
    { stripe_subscription_id: stripeSubscriptionId }, '-updated_date', 1
  );
  if (!items[0]) return; // Not yet migrated — skip dual-write silently

  const item = items[0];
  const now = new Date().toISOString();
  await base44.asServiceRole.entities.SubscriptionItem.update(item.id, {
    status: status || item.status,
    payment_status: paymentStatus || item.payment_status,
    current_period_start: periodStart || item.current_period_start,
    current_period_end: periodEnd || item.current_period_end,
    next_billing_date: periodEnd || item.next_billing_date,
    updated_at: now,
  });

  // Recalculate account health
  if (item.subscription_account_id) {
    const accounts = await base44.asServiceRole.entities.SubscriptionAccount.filter(
      { id: item.subscription_account_id }, '-updated_date', 1
    );
    const acct = accounts[0];
    if (acct) {
      const allItems = await base44.asServiceRole.entities.SubscriptionItem.filter(
        { subscription_account_id: acct.id }, '-updated_date', 50
      );
      const activeItems = allItems.filter(i => ['active', 'trialing'].includes(i.status));
      const pastDueItems = allItems.filter(i => i.status === 'past_due');
      const cancelledItems = allItems.filter(i => i.status === 'cancelled');
      const billedItems = allItems.filter(i => !['cancelled', 'paused'].includes(i.status));
      const monthlyTotal = billedItems.reduce((s, i) => s + (i.monthly_amount || 0), 0);
      let healthScore = 100; let healthStatus = 'healthy';
      if (pastDueItems.length === 1) { healthScore = 60; healthStatus = 'warning'; }
      if (pastDueItems.length > 1) { healthScore = 40; healthStatus = 'critical'; }
      if (activeItems.some(i => i.payment_status === 'failed')) { healthScore = 20; healthStatus = 'critical'; }
      if (!activeItems.length && cancelledItems.length > 0) { healthScore = 0; healthStatus = 'suspended'; }
      const acctStatus = pastDueItems.length > 0 ? 'past_due' : activeItems.some(i => i.status === 'trialing') ? 'trialing' : activeItems.length > 0 ? 'active' : cancelledItems.length > 0 ? 'cancelled' : 'no_payment_method';
      const lastPaymentAt = paymentStatus === 'paid' ? now : acct.last_payment_at;
      const lastFailedAt = paymentStatus === 'failed' ? now : acct.last_failed_payment_at;
      await base44.asServiceRole.entities.SubscriptionAccount.update(acct.id, {
        monthly_total: Math.round(monthlyTotal * 100) / 100,
        active_item_count: activeItems.length,
        past_due_item_count: pastDueItems.length,
        cancelled_item_count: cancelledItems.length,
        health_score: healthScore,
        health_status: healthStatus,
        status: acctStatus,
        last_payment_at: lastPaymentAt || acct.last_payment_at,
        last_failed_payment_at: lastFailedAt || acct.last_failed_payment_at,
        updated_at: now,
      });
    }
  }
}

async function dualWriteSubscriptionAlert(base44, { stripeSubscriptionId, alertType, severity, message, recommendedAction, amountAtRisk = 0, stripeInvoiceId = '' }) {
  const items = await base44.asServiceRole.entities.SubscriptionItem.filter(
    { stripe_subscription_id: stripeSubscriptionId }, '-updated_date', 1
  );
  if (!items[0]) return;
  const item = items[0];
  const now = new Date().toISOString();
  // Dedup: check if open alert of same type already exists
  const existing = await base44.asServiceRole.entities.SubscriptionAlert.filter(
    { subscription_item_id: item.id, alert_type: alertType, status: 'open' }, '-created_at', 1
  );
  if (existing[0]) return; // already open
  await base44.asServiceRole.entities.SubscriptionAlert.create({
    subscription_account_id: item.subscription_account_id || '',
    subscription_item_id: item.id,
    owner_type: item.owner_type || 'host',
    host_id: item.host_id || '',
    customer_user_id: item.customer_user_id || '',
    alert_type: alertType,
    severity,
    status: 'open',
    amount_at_risk: amountAtRisk,
    message,
    recommended_action: recommendedAction || '',
    stripe_subscription_id: stripeSubscriptionId,
    stripe_invoice_id: stripeInvoiceId,
    created_at: now,
  });
}

async function resolveSubscriptionAlerts(base44, stripeSubscriptionId) {
  const items = await base44.asServiceRole.entities.SubscriptionItem.filter(
    { stripe_subscription_id: stripeSubscriptionId }, '-updated_date', 1
  );
  if (!items[0]) return;
  const openAlerts = await base44.asServiceRole.entities.SubscriptionAlert.filter(
    { subscription_item_id: items[0].id, status: 'open' }, '-created_at', 20
  );
  const now = new Date().toISOString();
  for (const alert of openAlerts) {
    await base44.asServiceRole.entities.SubscriptionAlert.update(alert.id, { status: 'resolved', resolved_at: now });
  }
}

async function handleGPSOrderPaid(base44, pi) {
  const orderId = pi.metadata?.gps_order_id;
  if (!orderId) return;
  const now = new Date().toISOString();
  const orders = await base44.asServiceRole.entities.GPSOrder.filter({ id: orderId });
  const order = orders[0];
  if (!order) return;
  // Persist Stripe customer ID + payment method from the PaymentIntent so subscription can reuse them
  const stripeCustomerId = (typeof pi.customer === 'string' ? pi.customer : pi.customer?.id) || order.stripe_customer_id || '';
  const stripePaymentMethodId = (typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id) || '';
  // Attach the payment method as default for the customer so subscriptions can charge it
  if (stripeCustomerId && stripePaymentMethodId) {
    try {
      await stripe.paymentMethods.attach(stripePaymentMethodId, { customer: stripeCustomerId });
      await stripe.customers.update(stripeCustomerId, { invoice_settings: { default_payment_method: stripePaymentMethodId } });
    } catch (_) { /* already attached is fine */ }
  }
  await base44.asServiceRole.entities.GPSOrder.update(orderId, {
    payment_status: 'paid',
    order_status: 'paid',
    paid_at: now,
    stripe_payment_intent_id: pi.id,
    stripe_customer_id: stripeCustomerId,
    stripe_payment_method_id: stripePaymentMethodId,
  });
  await base44.asServiceRole.entities.Notification.create({
    user_email: order.customer_email,
    title: '✅ GPS Order Payment Confirmed',
    body: `Your Contactless360 GPS order (${order.order_number}) has been paid. Your device will ship within 1–2 business days.`,
    type: 'system',
  }).catch(() => {});
  await logEvent(base44, {
    event_type: 'payment.succeeded',
    actor_id: 'stripe_webhook',
    actor_email: 'stripe@stripe.com',
    actor_role: 'stripe',
    target_entity: 'GPSOrder',
    target_id: orderId,
    host_id: order.host_id || '',
    summary: `GPS order payment confirmed: ${order.order_number} — $${(pi.amount / 100).toFixed(2)}`,
    metadata: { payment_intent_id: pi.id, order_number: order.order_number, amount: pi.amount / 100 },
    source: 'webhook',
    event_status: 'success',
  });
}

async function handleGPSOrderFailed(base44, pi) {
  const orderId = pi.metadata?.gps_order_id;
  if (!orderId) return;
  const orders = await base44.asServiceRole.entities.GPSOrder.filter({ id: orderId });
  const order = orders[0];
  if (!order) return;
  await base44.asServiceRole.entities.GPSOrder.update(orderId, {
    payment_status: 'failed',
    order_status: 'payment_failed',
  });
  await base44.asServiceRole.entities.Notification.create({
    user_email: order.customer_email,
    title: '⚠️ GPS Order Payment Failed',
    body: `Payment for your Contactless360 GPS order (${order.order_number}) could not be processed. Please update your payment method and try again.`,
    type: 'payment',
  }).catch(() => {});
  await logEvent(base44, {
    event_type: 'payment.failed',
    actor_id: 'stripe_webhook',
    actor_email: 'stripe@stripe.com',
    actor_role: 'stripe',
    target_entity: 'GPSOrder',
    target_id: orderId,
    host_id: order.host_id || '',
    summary: `GPS order payment failed: ${order.order_number}`,
    metadata: { payment_intent_id: pi.id, reason: pi.last_payment_error?.message },
    source: 'webhook',
    event_status: 'error',
  });
}

async function handleGPSSubscriptionUpdate(base44, { invoice, subscription, statusOverride, paymentStatus }) {
  const meta = subscription?.metadata || invoice?.metadata || {};
  const subscriptionId = subscription?.id || (typeof invoice?.subscription === 'string' ? invoice.subscription : invoice?.subscription?.id);
  if (!subscriptionId) return;

  const records = await base44.asServiceRole.entities.GPSSubscription.filter({ stripe_subscription_id: subscriptionId });
  const existing = records[0];
  if (!existing) return;

  const newSubStatus = statusOverride || subscription?.status || existing.subscription_status;
  const newPayStatus = paymentStatus || existing.payment_status;
  const now = new Date().toISOString();

  await base44.asServiceRole.entities.GPSSubscription.update(existing.id, {
    subscription_status: newSubStatus,
    payment_status: newPayStatus,
    current_period_start: subscription?.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : existing.current_period_start,
    current_period_end: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : existing.current_period_end,
    cancel_at_period_end: subscription?.cancel_at_period_end ?? existing.cancel_at_period_end,
  });

  // Flag device if past_due or cancelled
  if (['past_due', 'unpaid', 'cancelled', 'canceled'].includes(newSubStatus) && existing.device_id) {
    await base44.asServiceRole.entities.TelematicsDevice.update(existing.device_id, {
      subscription_status: newSubStatus === 'cancelled' || newSubStatus === 'canceled' ? 'cancelled' : 'past_due',
    }).catch(() => {});
  }

  // Notify customer on failure or cancellation
  if (newPayStatus === 'failed' || ['past_due', 'cancelled', 'canceled'].includes(newSubStatus)) {
    await base44.asServiceRole.entities.Notification.create({
      user_email: existing.customer_email,
      title: newSubStatus === 'cancelled' || newSubStatus === 'canceled' ? '🔴 GPS Subscription Cancelled' : '⚠️ GPS Subscription Payment Failed',
      body: newSubStatus === 'cancelled' || newSubStatus === 'canceled'
        ? 'Your Contactless360 GPS subscription has been cancelled. Device monitoring will stop.'
        : 'Your GPS subscription payment failed. Please update your payment method to keep your device active.',
      type: 'payment',
    }).catch(() => {});
  }

  await logEvent(base44, {
    event_type: newPayStatus === 'failed' ? 'payment.failed' : ['cancelled', 'canceled'].includes(newSubStatus) ? 'booking.cancelled' : 'payment.succeeded',
    actor_id: 'stripe_webhook',
    actor_email: 'stripe@stripe.com',
    actor_role: 'stripe',
    target_entity: 'GPSSubscription',
    target_id: existing.id,
    summary: `GPS subscription updated: ${subscriptionId} — ${newSubStatus} / ${newPayStatus}`,
    metadata: { stripe_subscription_id: subscriptionId, subscription_status: newSubStatus, payment_status: newPayStatus },
    source: 'webhook',
    event_status: newPayStatus === 'paid' ? 'success' : 'warning',
  });
}

function addDaysIso(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function planFieldsForSubscription(mode, stripeStatus = 'active') {
  const isHybrid = mode === 'hybrid_growth';
  const isFleetOS = mode === 'fleetos_professional';
  return {
    selected_mode: mode,
    active_mode: mode,
    status: 'active',
    marketplace_enabled: !isFleetOS,
    marketplace_fee_rate: isHybrid ? 0.05 : 0,
    monthly_subscription_amount: 29.99,
    platform_billing_route: isHybrid ? 'subscription_plus_marketplace' : 'subscription',
    payment_required: true,
    billing_activation_pending: false,
    last_payment_status: stripeStatus === 'trialing' ? 'pending' : 'paid',
    subscription_payment_succeeded_at: stripeStatus === 'trialing' ? undefined : new Date().toISOString(),
    last_updated_at: new Date().toISOString()
  };
}

async function updateOperatorSubscriptionFromStripe(base44, { subscription, session, invoice, statusOverride, paymentStatus }) {
  const metadata = subscription?.metadata || session?.metadata || {};
  const subscriptionId = subscription?.id
    || (typeof session?.subscription === 'string' ? session.subscription : session?.subscription?.id)
    || (typeof invoice?.subscription === 'string' ? invoice.subscription : invoice?.subscription?.id);
  const hostId = metadata.host_id;
  const planId = metadata.operator_plan_id;
  const mode = metadata.plan_mode || 'fleetos_professional';
  if (!subscriptionId && !session?.id) return;

  let records = subscriptionId ? await base44.asServiceRole.entities.HostPlatformSubscription.filter({ stripe_subscription_id: subscriptionId }, '-updated_date', 1) : [];
  if (!records.length && session?.id) records = await base44.asServiceRole.entities.HostPlatformSubscription.filter({ stripe_checkout_session_id: session.id }, '-updated_date', 1);
  if (!records.length && hostId) records = await base44.asServiceRole.entities.HostPlatformSubscription.filter({ host_id: hostId }, '-updated_date', 1);
  const existing = records[0];

  const status = statusOverride || subscription?.status || existing?.status || 'active';
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const isTrialing = status === 'trialing';
  const isPastDue = ['past_due', 'unpaid', 'incomplete'].includes(status);
  const graceEndsAt = isPastDue ? (existing?.billing_grace_ends_at || addDaysIso(nowDate, 7)) : undefined;
  const subscriptionItem = subscription?.items?.data?.[0];
  const payload = {
    host_id: hostId || existing?.host_id || '',
    user_id: metadata.user_id || existing?.user_id || '',
    operator_plan_id: planId || existing?.operator_plan_id || '',
    plan_mode: mode,
    billing_route: mode === 'hybrid_growth' ? 'subscription_plus_marketplace' : 'subscription',
    status,
    subscription_status: status,
    trial_active: isTrialing,
    trial_days: Number(metadata.trial_days || existing?.trial_days || 14),
    trial_start_date: toIsoFromUnix(subscription?.trial_start) || existing?.trial_start_date,
    trial_end_date: toIsoFromUnix(subscription?.trial_end) || existing?.trial_end_date,
    monthly_amount: 29.99,
    currency: subscription?.currency || invoice?.currency || existing?.currency || 'usd',
    stripe_customer_id: subscription?.customer || session?.customer || invoice?.customer || existing?.stripe_customer_id || '',
    stripe_subscription_id: subscriptionId || existing?.stripe_subscription_id || '',
    stripe_checkout_session_id: session?.id || existing?.stripe_checkout_session_id || '',
    stripe_product_id: typeof subscriptionItem?.price?.product === 'string' ? subscriptionItem.price.product : subscriptionItem?.price?.product?.id || existing?.stripe_product_id || '',
    stripe_price_id: subscriptionItem?.price?.id || existing?.stripe_price_id || '',
    stripe_invoice_id: invoice?.id || existing?.stripe_invoice_id || '',
    current_period_start: toIsoFromUnix(subscription?.current_period_start) || existing?.current_period_start,
    current_period_end: toIsoFromUnix(subscription?.current_period_end) || existing?.current_period_end,
    cancel_at_period_end: !!subscription?.cancel_at_period_end,
    cancelled_at: toIsoFromUnix(subscription?.canceled_at) || existing?.cancelled_at,
    billing_grace_ends_at: isPastDue ? graceEndsAt : undefined,
    last_payment_status: paymentStatus || (status === 'active' ? 'paid' : status === 'trialing' ? 'pending' : status === 'past_due' ? 'past_due' : existing?.last_payment_status || 'pending'),
    last_payment_at: paymentStatus === 'paid' ? now : existing?.last_payment_at,
    last_payment_failed_at: paymentStatus === 'failed' ? now : existing?.last_payment_failed_at,
    source: 'webhook',
    last_updated_at: now,
    audit_log: [...(existing?.audit_log || []), { action: 'stripe_webhook_update', status, changed_by: 'stripe_webhook', changed_at: now, note: invoice?.id || session?.id || subscriptionId || 'Stripe subscription update' }]
  };

  if (existing?.id) await base44.asServiceRole.entities.HostPlatformSubscription.update(existing.id, payload);
  else await base44.asServiceRole.entities.HostPlatformSubscription.create(payload);

  const resolvedPlanId = planId || existing?.operator_plan_id;
  if (resolvedPlanId && ['active', 'trialing'].includes(status)) {
    const plans = await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ id: resolvedPlanId });
    const plan = plans[0];
    await base44.asServiceRole.entities.OperatorPlanConfiguration.update(resolvedPlanId, {
    ...planFieldsForSubscription(mode, status),
      status_audit_log: [...(plan?.status_audit_log || []), { from_status: plan?.status || 'pending_payment', to_status: 'active', changed_by: 'stripe_webhook', changed_at: now, reason: 'Platform subscription payment confirmed by Stripe.', source: 'webhook' }]
    });
  } else if (resolvedPlanId && ['past_due', 'unpaid', 'incomplete'].includes(status)) {
    await base44.asServiceRole.entities.OperatorPlanConfiguration.update(resolvedPlanId, { status: 'past_due', billing_activation_pending: true, last_payment_status: paymentStatus === 'failed' ? 'failed' : 'past_due', last_updated_at: now });
  } else if (resolvedPlanId && ['canceled', 'incomplete_expired'].includes(status)) {
    await base44.asServiceRole.entities.OperatorPlanConfiguration.update(resolvedPlanId, { status: 'cancelled', active_mode: 'none', billing_activation_pending: true, last_payment_status: 'cancelled', cancelled_at: now, last_updated_at: now });
  }

  if (hostId) {
    const commerceProfiles = await base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id: hostId }, '-updated_date', 1);
    const hosts = await base44.asServiceRole.entities.Host.filter({ id: hostId }, '-updated_date', 1);
    const host = hosts[0];
    if (commerceProfiles?.[0]?.id && host) {
      const disabled = ['canceled', 'cancelled', 'incomplete_expired', 'expired'].includes(status);
      if (!disabled) {
        // Full commerce profile sync on activation/trial — fixes plan_type mismatch
        const isFleetOS = mode === 'fleetos_professional';
        const isHybrid = mode === 'hybrid_growth';
        const stripeReady = !!host.stripe_onboarding_complete && !!host.stripe_account_id;
        await base44.asServiceRole.entities.HostCommerceProfile.update(commerceProfiles[0].id, {
          plan_type: mode,
          marketplace_enabled: !isFleetOS,
          marketplace_visibility: !isFleetOS,
          booking_enabled: true,
          online_payments_enabled: isFleetOS ? stripeReady : true,
          payment_processor: isFleetOS ? (stripeReady ? 'host_stripe' : 'reservation_only') : 'uride_stripe',
          commission_rate: isFleetOS ? 0 : isHybrid ? 0.05 : 0.08,
          subscription_rate: isFleetOS || isHybrid ? 29.99 : 0,
          host_checkout_enabled: isFleetOS && stripeReady,
          contract_owner: isFleetOS ? 'host' : 'uride',
          payment_owner: isFleetOS ? 'host' : 'uride',
        });
      } else {
        await base44.asServiceRole.entities.HostCommerceProfile.update(commerceProfiles[0].id, {
          booking_enabled: false,
          marketplace_visibility: false,
          marketplace_enabled: false,
        });
      }
    }
  }
}

function alertTypeForInvoiceFailure(context) {
  if (isHostSubscriptionContext(context)) return 'subscription_payment_failed';
  if (context === 'dealer_network_membership') return 'dealer_membership_payment_failed';
  if (context === 'contactless_gps' || context === 'gps_contactless_subscription') return 'contactless_gps_payment_failed';
  return 'unknown_payment_failed';
}

async function resolveMarketplaceFee(base44, booking = {}) {
  const bookingSource = booking.booking_source || 'marketplace';
  let operatorMode = 'marketplace_partner';
  let fallbackUsed = true;
  let reason = 'Default marketplace fallback rate.';

  if (!['marketplace', 'direct', 'admin_created', 'imported', 'dealer_network'].includes(bookingSource)) {
    reason = 'Unknown booking source treated as marketplace for legacy safety.';
  }

  if (booking.host_id) {
    const plans = await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id: booking.host_id });
    const plan = plans[0];
    if (plan) {
      operatorMode = plan.active_mode && plan.active_mode !== 'none' ? plan.active_mode : (plan.selected_mode || plan.recommended_mode || operatorMode);
      fallbackUsed = false;
      reason = 'Resolved from OperatorPlanConfiguration.';
    }
  }

  let feeRate = 0;
  if (bookingSource === 'marketplace') {
    feeRate = operatorMode === 'hybrid_growth' ? 0.05 : operatorMode === 'fleetos_professional' ? 0 : 0.08;
  } else {
    feeRate = 0;
    reason = fallbackUsed ? 'Non-marketplace booking source uses no marketplace fee fallback.' : 'Non-marketplace booking source uses no marketplace fee.';
  }

  await logEvent(base44, {
    event_type: 'billing.fee_rate_calculated',
    actor_id: 'billing_context_router',
    actor_email: 'system',
    actor_role: 'automation',
    target_entity: 'BookingRequest',
    target_id: booking.id || '',
    host_id: booking.host_id || '',
    booking_id: booking.id || '',
    summary: `Marketplace fee resolved: ${(feeRate * 100).toFixed(0)}% for ${operatorMode}`,
    metadata: { host_id: booking.host_id || '', booking_id: booking.id || '', operator_mode: operatorMode, booking_source: bookingSource, fee_rate_used: feeRate, fallback_used: fallbackUsed, reason },
    source: 'billing_readiness',
  });

  return { feeRate, operatorMode, bookingSource, fallbackUsed, reason };
}

Deno.serve(async (req) => {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    return Response.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  const base44 = createClientFromRequest(req);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (isHostSubscriptionContext(session.metadata?.billing_context)) {
          const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
          const subscription = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null;
          await updateOperatorSubscriptionFromStripe(base44, { subscription, session, statusOverride: subscription?.status || 'active', paymentStatus: subscription?.status === 'trialing' ? 'pending' : 'paid' });
        } else if (isGPSOrderContext(session.metadata?.billing_context)) {
          // GPS checkout session completed — mark order paid
          const fakePI = { id: session.payment_intent || session.id, amount: session.amount_total || 0, metadata: session.metadata, currency: session.currency || 'usd' };
          await handleGPSOrderPaid(base44, fakePI);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        if (isHostSubscriptionContext(subscription.metadata?.billing_context)) {
          await updateOperatorSubscriptionFromStripe(base44, { subscription, statusOverride: subscription.status });
        } else if (isGPSSubscriptionContext(subscription.metadata?.billing_context)) {
          await handleGPSSubscriptionUpdate(base44, { subscription, statusOverride: subscription.status });
        }
        // Dual-write to unified SubscriptionItem
        await dualWriteSubscriptionItem(base44, {
          stripeSubscriptionId: subscription.id,
          status: subscription.status,
          paymentStatus: subscription.status === 'active' ? 'paid' : subscription.status === 'trialing' ? 'paid' : subscription.status === 'past_due' ? 'past_due' : undefined,
          periodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : undefined,
          periodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : undefined,
        }).catch(e => console.error('[DualWrite subscription.updated]', e.message));
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        if (isHostSubscriptionContext(subscription.metadata?.billing_context)) {
          await updateOperatorSubscriptionFromStripe(base44, { subscription, statusOverride: 'canceled', paymentStatus: 'cancelled' });
        } else if (isGPSSubscriptionContext(subscription.metadata?.billing_context)) {
          await handleGPSSubscriptionUpdate(base44, { subscription, statusOverride: 'cancelled', paymentStatus: 'cancelled' });
        }
        // Dual-write cancellation
        await dualWriteSubscriptionItem(base44, { stripeSubscriptionId: subscription.id, status: 'cancelled', paymentStatus: 'cancelled' }).catch(e => console.error('[DualWrite subscription.deleted]', e.message));
        await dualWriteSubscriptionAlert(base44, { stripeSubscriptionId: subscription.id, alertType: 'subscription_cancelled', severity: 'warning', message: `Subscription ${subscription.id} was cancelled.`, recommendedAction: 'Contact customer to reactivate.' }).catch(() => {});
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const billingContext = getBillingContext(invoice.metadata || {});
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        const subscription = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null;
        if (isHostSubscriptionContext(subscription?.metadata?.billing_context)) {
          await updateOperatorSubscriptionFromStripe(base44, { subscription, invoice, statusOverride: subscription.status, paymentStatus: 'paid' });
        } else if (isGPSSubscriptionContext(subscription?.metadata?.billing_context)) {
          await handleGPSSubscriptionUpdate(base44, { subscription, invoice, statusOverride: 'active', paymentStatus: 'paid' });
        }
        // Dual-write: mark item active + paid, resolve alerts
        if (subscriptionId) {
          await dualWriteSubscriptionItem(base44, {
            stripeSubscriptionId: subscriptionId,
            status: subscription?.status || 'active',
            paymentStatus: 'paid',
            periodStart: subscription?.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : undefined,
            periodEnd: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : undefined,
          }).catch(e => console.error('[DualWrite invoice.payment_succeeded]', e.message));
          await resolveSubscriptionAlerts(base44, subscriptionId).catch(() => {});
        }
        break;
      }

      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const billingContext = getBillingContext(pi.metadata || {});

        // GPS order payment
        if (isGPSOrderContext(billingContext)) {
          await handleGPSOrderPaid(base44, pi);
          break;
        }

        if (!['rental_marketplace_payment', 'fleetos_host_direct_payment', 'payment_recovery_customer_self_service'].includes(billingContext)) {
          console.log(`[Webhook] Recognized non-rental billing context ${billingContext}; no live subscription/dealer/GPS billing action taken.`);
          await logEvent(base44, { event_type: 'billing.context_ignored', actor_id: 'stripe_webhook', actor_email: 'stripe@stripe.com', actor_role: 'stripe', summary: `Ignored non-rental payment_intent.succeeded context: ${billingContext}`, metadata: { billing_context: billingContext, payment_intent_id: pi.id }, source: 'webhook' });
          break;
        }
        const bookingRequestId = pi.metadata?.booking_request_id;
        if (billingContext === 'payment_recovery_customer_self_service') {
          if (bookingRequestId) {
            const records = await base44.asServiceRole.entities.BookingRequest.filter({ id: bookingRequestId });
            const booking = records[0];
            if (booking) {
              const chargeData = pi.charges?.data?.[0];
              const receiptUrl = chargeData?.receipt_url || '';
              const chargeId = chargeData?.id || '';
              const balanceTransactionId = typeof chargeData?.balance_transaction === 'string' ? chargeData.balance_transaction : chargeData?.balance_transaction?.id || '';
              const grossAmount = pi.amount / 100;
              const paidAt = new Date().toISOString();
              const paymentWeekNumber = (booking.billing_week_number || 1) + 1;
              const dedupeKey = generatePaymentDedupeKey({ sourceType: 'grace_retry', bookingId: bookingRequestId, weekNumber: paymentWeekNumber, amount: grossAmount, paidAt, paymentIntentId: pi.id, paymentMethod: 'stripe' });

              await base44.asServiceRole.entities.BookingRequest.update(bookingRequestId, {
                payment_status: 'paid',
                stripe_payment_intent_id: pi.id,
                stripe_payment_method_id: pi.payment_method || booking.stripe_payment_method_id || '',
                stripe_customer_id: pi.customer || booking.stripe_customer_id || '',
                receipt_url: receiptUrl || null,
                payment_failure_attempts: 0,
                payment_failure_reason: null,
                last_payment_failure_at: null,
                last_retry_at: null,
                payment_failure_started_at: null,
                starter_disable_scheduled_at: null
              });

              await base44.asServiceRole.functions.invoke('autoApproveBooking', { booking_request_id: bookingRequestId, source: 'customer_self_service_payment_recovery' }).catch((error) => console.error('[AutoApproveRecovery]', error.message));

              const existingPaymentLogs = await base44.asServiceRole.entities.PaymentLog.filter({ stripe_payment_intent_id: pi.id });
              if (existingPaymentLogs.length === 0 && grossAmount > 0) {
                await base44.asServiceRole.entities.PaymentLog.create({
                  booking_request_id: bookingRequestId,
                  host_id: booking.host_id || pi.metadata?.host_id || '',
                  customer_email: booking.user_email,
                  customer_name: booking.customer_full_name || '',
                  vehicle_id: booking.vehicle_id,
                  vehicle_name: booking.vehicle_name || '',
                  week_number: paymentWeekNumber,
                  billing_period_start: paidAt.slice(0, 10),
                  billing_period_end: booking.next_billing_date || '',
                  amount: grossAmount,
                  currency: pi.currency || 'usd',
                  payment_method: 'stripe',
                  source_type: 'grace_retry',
                  source_confidence: classifyPaymentConfidence({ paymentIntentId: pi.id }),
                  legacy_flag: false,
                  external_reconcilable: true,
                  dedupe_key: dedupeKey,
                  stripe_payment_intent_id: pi.id,
                  stripe_charge_id: chargeId,
                  stripe_customer_id: pi.customer || booking.stripe_customer_id || '',
                  stripe_payment_method_id: pi.payment_method || booking.stripe_payment_method_id || '',
                  stripe_balance_transaction_id: balanceTransactionId,
                  stripe_receipt_url: receiptUrl,
                  receipt_url: receiptUrl,
                  status: 'paid',
                  recorded_by: 'customer_self_service_recovery',
                  paid_at: paidAt,
                });
              }

              await logEvent(base44, {
                event_type: 'payment.recovery_succeeded',
                actor_id: 'stripe_webhook',
                actor_email: 'stripe@stripe.com',
                actor_role: 'stripe',
                target_entity: 'BookingRequest',
                target_id: bookingRequestId,
                booking_id: bookingRequestId,
                vehicle_id: booking.vehicle_id || '',
                host_id: booking.host_id || '',
                customer_id: booking.user_email || '',
                summary: `Customer self-service payment recovery succeeded for booking ${bookingRequestId}`,
                metadata: { payment_intent_id: pi.id, amount: grossAmount, billing_context: billingContext, payout_isolated: true },
                source: 'webhook',
              });
            }
          }
          break;
        }
        if (billingContext === 'fleetos_host_direct_payment') {
          if (bookingRequestId) {
            const records = await base44.asServiceRole.entities.BookingRequest.filter({ id: bookingRequestId });
            const booking = records[0];
            if (booking) {
              await base44.asServiceRole.entities.BookingRequest.update(bookingRequestId, {
                payment_status: 'paid',
                stripe_payment_intent_id: pi.id,
                stripe_payment_method_id: pi.payment_method || booking.stripe_payment_method_id || '',
                stripe_customer_id: pi.customer || booking.stripe_customer_id || ''
              });
              await base44.asServiceRole.functions.invoke('autoApproveBooking', { booking_request_id: bookingRequestId, source: 'stripe_webhook_host_stripe' }).catch((error) => console.error('[AutoApprove]', error.message));
            }
          }
          break;
        }
        const chargeData = pi.charges?.data?.[0];
        const receiptUrl = chargeData?.receipt_url;
        const chargeId = chargeData?.id;
        const balanceTransactionId = typeof chargeData?.balance_transaction === 'string' ? chargeData.balance_transaction : chargeData?.balance_transaction?.id;

        if (bookingRequestId) {
          const records = await base44.asServiceRole.entities.BookingRequest.filter({ id: bookingRequestId });
          const booking = records[0];
          if (booking) {
            await base44.asServiceRole.entities.BookingRequest.update(bookingRequestId, {
              payment_status: 'paid',
              stripe_payment_intent_id: pi.id,
              stripe_payment_method_id: pi.payment_method || booking.stripe_payment_method_id || '',
              stripe_customer_id: pi.customer || booking.stripe_customer_id || '',
              receipt_url: receiptUrl || null,
            });

            await base44.asServiceRole.functions.invoke('autoApproveBooking', { booking_request_id: bookingRequestId, source: 'stripe_webhook' }).catch((error) => console.error('[AutoApprove]', error.message));

            const grossAmount = pi.amount / 100;
            let resolvedHostId = booking.host_id || '';
            let resolvedVehicleName = booking.vehicle_name || '';

            if (booking.vehicle_id && grossAmount > 0) {
              const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
              const vehicle = vehicles[0];

              if (vehicle?.host_id) {
                resolvedHostId = resolvedHostId || vehicle.host_id;
                resolvedVehicleName = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || resolvedVehicleName;
                const hosts = await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id });
                const host = hosts[0];

                if (host?.stripe_account_id && host?.stripe_onboarding_complete) {
                  const { feeRate: commissionRate } = await resolveMarketplaceFee(base44, { ...booking, host_id: host.id });

                  let stripeFeeAmount = 0;
                  let stripeEffectiveRate = 0;
                  if (chargeId) {
                    const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
                    if (charge.balance_transaction?.fee) {
                      stripeFeeAmount = charge.balance_transaction.fee / 100;
                      stripeEffectiveRate = (stripeFeeAmount / grossAmount) * 100;
                    }
                  }

                  const periodStart = booking.start_date || new Date().toISOString().slice(0, 10);
                  const periodEnd = booking.end_date || new Date().toISOString().slice(0, 10);
                  const alreadyProcessed = await alreadyProcessedInitialPayout(base44, { paymentIntentId: pi.id, bookingRequestId, periodStart, periodEnd });
                  if (alreadyProcessed) {
                    await logEvent(base44, { event_type: 'payment.retry_deferred', actor_id: 'stripe_webhook', actor_email: 'stripe@stripe.com', actor_role: 'stripe', target_entity: 'BookingRequest', target_id: bookingRequestId, booking_id: bookingRequestId, host_id: host.id, summary: `Duplicate Stripe webhook ignored before transfer for booking ${bookingRequestId}`, metadata: { payment_intent_id: pi.id, idempotency_guard: 'initial_checkout_transfer' }, source: 'webhook', event_status: 'warning' });
                    break;
                  }

                  const baseAmount = Math.max(0, Number(booking.total_due_now || booking.weekly_rate || (grossAmount - stripeFeeAmount) || 0));
                  const uridePlatformFee = Math.round(baseAmount * commissionRate * 100) / 100;
                  const receivableOffset = await applyReceivableOffset(base44, host.id, Math.max(0, baseAmount - uridePlatformFee), new Date().toISOString());
                  const netHostPayout = Math.round((baseAmount - uridePlatformFee - receivableOffset) * 100) / 100;
                  const hostTransferAmount = Math.round(netHostPayout * 100);

                  const transfer = hostTransferAmount > 0 ? await stripe.transfers.create({
                    amount: hostTransferAmount,
                    currency: 'usd',
                    destination: host.stripe_account_id,
                    description: `UrideHub payout — ${host.full_name} — booking ${bookingRequestId}`,
                    metadata: { host_id: host.id, booking_request_id: bookingRequestId, payment_intent_id: pi.id, platform: 'uride' },
                  }) : { id: '' };

                  const vehicleName = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : null;

                  await base44.asServiceRole.entities.HostPayout.create({
                    host_id: host.id,
                    host_email: host.email,
                    host_name: host.full_name,
                    booking_request_id: bookingRequestId,
                    vehicle_name: vehicleName,
                    period_start: periodStart,
                    period_end: periodEnd,
                    gross_booking_amount: grossAmount,
                    stripe_fee_amount: stripeFeeAmount,
                    stripe_effective_rate: Math.round(stripeEffectiveRate * 100) / 100,
                    uride_platform_fee_amount: uridePlatformFee,
                    uride_platform_fee_rate: commissionRate,
                    receivable_offset_amount: receivableOffset,
                    net_host_payout: netHostPayout,
                    gross_collected: grossAmount,
                    platform_fee: uridePlatformFee,
                    net_payout: netHostPayout,
                    status: 'paid',
                    stripe_payment_intent_id: pi.id,
                    stripe_charge_id: chargeId || '',
                    stripe_transfer_id: transfer.id,
                    payout_date: new Date().toISOString().slice(0, 10),
                    booking_count: 1,
                    vehicle_count: 1,
                  });

                  await base44.asServiceRole.entities.Host.update(host.id, {
                    total_earnings: (host.total_earnings || 0) + grossAmount,
                    total_payouts: (host.total_payouts || 0) + netHostPayout,
                  });

                  const feeLabel = `${(commissionRate * 100).toFixed(0)}% Uride Platform Fee`;
                  await base44.asServiceRole.entities.Notification.create({
                    user_email: host.email,
                    title: `💰 Payout Sent — $${netHostPayout.toLocaleString()}`,
                    body: `Payment received: $${grossAmount}. After ${feeLabel} ($${uridePlatformFee}), Stripe processing ($${stripeFeeAmount.toFixed(2)}), and receivable offsets ($${receivableOffset.toFixed(2)}), your net payout of $${netHostPayout} is on its way. Arrives within 2 business days.`,
                    type: 'payment',
                  });

                  console.log(`[AutoPayout] ✓ Transfer ${transfer.id} — $${netHostPayout} to ${host.stripe_account_id} for booking ${bookingRequestId}`);

                  await logEvent(base44, {
                    event_type: 'payout.sent',
                    actor_id: 'stripe_webhook',
                    actor_email: 'stripe@stripe.com',
                    actor_role: 'stripe',
                    target_entity: 'HostPayout',
                    host_id: host.id,
                    booking_id: bookingRequestId,
                    vehicle_id: booking.vehicle_id || '',
                    summary: `Payout $${netHostPayout} sent to ${host.full_name} for booking ${bookingRequestId}`,
                    metadata: { transfer_id: transfer.id, gross: grossAmount, base_amount: baseAmount, stripe_fee: stripeFeeAmount, platform_fee: uridePlatformFee, receivable_offset: receivableOffset, net: netHostPayout },
                    source: 'webhook',
                  });
                } else {
                  console.log(`[AutoPayout] Host ${vehicle.host_id} not eligible for auto-payout (no Stripe account or onboarding incomplete)`);
                }
              }
            }

            const existingPaymentLogs = await base44.asServiceRole.entities.PaymentLog.filter({ stripe_payment_intent_id: pi.id });
            if (existingPaymentLogs.length === 0 && grossAmount > 0) {
              const weekNumber = booking.billing_week_number || Number(pi.metadata?.week_number) || 1;
              const paidAt = new Date().toISOString();
              const sourceType = classifyPaymentSource({ paymentIntentId: pi.id, recordedBy: 'stripe_webhook' });
              const dedupeKey = generatePaymentDedupeKey({ sourceType, bookingId: bookingRequestId, weekNumber, amount: grossAmount, paidAt, paymentIntentId: pi.id, paymentMethod: 'stripe' });
              const paymentLog = await base44.asServiceRole.entities.PaymentLog.create({
                booking_request_id: bookingRequestId,
                host_id: resolvedHostId,
                customer_email: booking.user_email,
                customer_name: booking.customer_full_name || '',
                vehicle_id: booking.vehicle_id,
                vehicle_name: resolvedVehicleName,
                week_number: weekNumber,
                billing_period_start: booking.start_date || '',
                billing_period_end: booking.end_date || '',
                amount: grossAmount,
                currency: pi.currency || 'usd',
                payment_method: 'stripe',
                source_type: sourceType,
                source_confidence: classifyPaymentConfidence({ paymentIntentId: pi.id }),
                legacy_flag: false,
                external_reconcilable: true,
                dedupe_key: dedupeKey,
                stripe_payment_intent_id: pi.id,
                stripe_charge_id: chargeId || '',
                stripe_customer_id: pi.customer || booking.stripe_customer_id || '',
                stripe_payment_method_id: pi.payment_method || booking.stripe_payment_method_id || '',
                stripe_balance_transaction_id: balanceTransactionId || '',
                stripe_receipt_url: receiptUrl || '',
                receipt_url: receiptUrl || '',
                status: 'paid',
                recorded_by: 'stripe_webhook',
                paid_at: paidAt,
              });
              await logEvent(base44, {
                event_type: 'payment.logged',
                actor_id: 'stripe_webhook',
                actor_email: 'stripe@stripe.com',
                actor_role: 'stripe',
                target_entity: 'PaymentLog',
                target_id: paymentLog.id,
                booking_id: bookingRequestId,
                vehicle_id: booking.vehicle_id || '',
                host_id: resolvedHostId,
                customer_id: booking.user_email || '',
                summary: `Hardened PaymentLog created for booking ${bookingRequestId}`,
                metadata: { payment_log_id: paymentLog.id, dedupe_key: dedupeKey, source_type: sourceType },
                source: 'webhook',
              });
            }

            await logEvent(base44, {
              event_type: 'payment.succeeded',
              actor_id: 'stripe_webhook',
              actor_email: 'stripe@stripe.com',
              actor_role: 'stripe',
              target_entity: 'BookingRequest',
              target_id: bookingRequestId,
              booking_id: bookingRequestId,
              vehicle_id: booking.vehicle_id || '',
              host_id: resolvedHostId,
              customer_id: booking.user_email || '',
              summary: `Payment $${grossAmount} received for booking ${bookingRequestId}`,
              metadata: { payment_intent_id: pi.id, amount: pi.amount / 100, receipt_url: receiptUrl },
              source: 'webhook',
            });
          }
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const billingContext = getBillingContext(pi.metadata || {});

        // GPS order failure
        if (isGPSOrderContext(billingContext)) {
          await handleGPSOrderFailed(base44, pi);
          break;
        }

        if (billingContext !== 'rental_marketplace_payment') {
          console.log(`[Webhook] Recognized non-rental failed payment context ${billingContext}; no rental failure action taken.`);
          await createPaymentAlert(base44, { alert_type: alertTypeForInvoiceFailure(billingContext), severity: 'critical', billing_context: billingContext, stripe_event_type: event.type, stripe_payment_intent_id: pi.id, renter_email: pi.metadata?.user_email || '', title: 'Non-rental payment failed', message: `A ${billingContext} payment failed. No automatic suspension or billing activation was performed.`, recommended_action: 'Review the billing issue and contact the operator if needed.', financial_impact_amount: (pi.amount || 0) / 100, currency: pi.currency || 'usd', requires_customer_action: false, source: 'stripe_webhook' });
          await logEvent(base44, { event_type: 'billing.context_ignored', actor_id: 'stripe_webhook', actor_email: 'stripe@stripe.com', actor_role: 'stripe', summary: `Ignored non-rental payment_intent.payment_failed context: ${billingContext}`, metadata: { billing_context: billingContext, payment_intent_id: pi.id }, source: 'webhook' });
          break;
        }
        const bookingRequestId = pi.metadata?.booking_request_id;
        if (bookingRequestId) {
          const failedBookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: bookingRequestId });
          const failedBooking = failedBookings[0];
          let failedHostEmail = '';
          if (failedBooking?.host_id) {
            const failedHosts = await base44.asServiceRole.entities.Host.filter({ id: failedBooking.host_id });
            failedHostEmail = failedHosts[0]?.email || '';
          }
          await createPaymentAlert(base44, { alert_type: 'rental_payment_failed', severity: 'critical', billing_context: 'rental_payment', booking_id: bookingRequestId, host_id: failedBooking?.host_id || '', customer_id: failedBooking?.user_id || '', vehicle_id: failedBooking?.vehicle_id || '', renter_email: failedBooking?.user_email || pi.metadata?.user_email || '', host_email: failedHostEmail, stripe_event_type: event.type, stripe_payment_intent_id: pi.id, related_entity_type: 'BookingRequest', related_entity_id: bookingRequestId, title: 'Rental payment failed', message: `Payment failed for booking ${bookingRequestId}: ${pi.last_payment_error?.message || 'unknown reason'}`, financial_impact_amount: (pi.amount || 0) / 100, currency: pi.currency || 'usd', source: 'stripe_webhook' });
          await base44.asServiceRole.entities.BookingRequest.update(bookingRequestId, {
            payment_status: 'failed',
            stripe_payment_intent_id: pi.id,
          });
          await base44.asServiceRole.entities.Notification.create({
            title: 'Payment Failed',
            body: `Payment failed for booking ${bookingRequestId}. Reason: ${pi.last_payment_error?.message || 'Unknown'}`,
            type: 'payment',
            booking_request_id: bookingRequestId,
            user_email: pi.metadata?.user_email || '',
          });
          await logEvent(base44, {
            event_type: 'payment.failed',
            actor_id: 'stripe_webhook',
            actor_email: 'stripe@stripe.com',
            actor_role: 'stripe',
            target_entity: 'BookingRequest',
            target_id: bookingRequestId,
            booking_id: bookingRequestId,
            customer_id: pi.metadata?.user_email || '',
            summary: `Payment failed for booking ${bookingRequestId}: ${pi.last_payment_error?.message || 'unknown reason'}`,
            metadata: { payment_intent_id: pi.id, reason: pi.last_payment_error?.message },
            source: 'webhook',
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        let billingContext = getBillingContext(invoice.metadata || {});
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
        const subscription = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null;
        if (isHostSubscriptionContext(subscription?.metadata?.billing_context)) {
          billingContext = subscription.metadata.billing_context;
          await updateOperatorSubscriptionFromStripe(base44, { subscription, invoice, statusOverride: subscription.status || 'past_due', paymentStatus: 'failed' });
        } else if (isGPSSubscriptionContext(subscription?.metadata?.billing_context)) {
          billingContext = subscription.metadata.billing_context;
          await handleGPSSubscriptionUpdate(base44, { subscription, invoice, statusOverride: 'past_due', paymentStatus: 'failed' });
        }
        await createPaymentAlert(base44, { alert_type: alertTypeForInvoiceFailure(billingContext), severity: 'critical', billing_context: billingContext, stripe_event_type: event.type, stripe_invoice_id: invoice.id, host_id: subscription?.metadata?.host_id || '', title: 'Invoice payment failed', message: `Invoice payment failed for ${billingContext}. No automatic suspension or subscription activation occurred.`, recommended_action: 'Review billing issue and contact the operator/customer as appropriate.', financial_impact_amount: (invoice.amount_due || 0) / 100, currency: invoice.currency || 'usd', requires_customer_action: false, source: 'stripe_webhook' });
        // Dual-write: mark item past_due + create SubscriptionAlert
        if (subscriptionId) {
          await dualWriteSubscriptionItem(base44, { stripeSubscriptionId: subscriptionId, status: 'past_due', paymentStatus: 'failed' }).catch(e => console.error('[DualWrite invoice.payment_failed]', e.message));
          const itemType = billingContextToItemType(subscription?.metadata?.billing_context || billingContext);
          const alertType = itemType === 'contactless360_gps' ? 'gps_active_unpaid' : 'platform_plan_unpaid';
          await dualWriteSubscriptionAlert(base44, { stripeSubscriptionId: subscriptionId, alertType, severity: 'critical', message: `Invoice payment failed — $${((invoice.amount_due||0)/100).toFixed(2)} past due.`, recommendedAction: 'Update payment method to restore service.', amountAtRisk: (invoice.amount_due || 0) / 100, stripeInvoiceId: invoice.id }).catch(() => {});
        }
        break;
      }

      case 'invoice.payment_action_required': {
        const invoice = event.data.object;
        const billingContext = getBillingContext(invoice.metadata || {});
        await createPaymentAlert(base44, { alert_type: 'payment_authentication_required', severity: billingContext === 'rental_marketplace_payment' ? 'critical' : 'warning', billing_context: billingContext, stripe_event_type: event.type, stripe_invoice_id: invoice.id, title: 'Payment authentication required', message: `Payment authentication is required for ${billingContext}.`, recommended_action: 'Prompt the payer to authenticate payment or update payment method.', financial_impact_amount: (invoice.amount_due || 0) / 100, currency: invoice.currency || 'usd', source: 'stripe_webhook' });
        break;
      }

      case 'transfer.failed': {
        const transfer = event.data.object;
        await createPaymentAlert(base44, { alert_type: 'transfer_failed', severity: 'critical', billing_context: 'payout', stripe_event_type: event.type, stripe_transfer_id: transfer.id, host_id: transfer.metadata?.host_id || '', booking_id: transfer.metadata?.booking_id || transfer.metadata?.booking_request_id || '', related_entity_type: 'StripeTransfer', related_entity_id: transfer.id, title: 'Stripe transfer failed', message: `Stripe transfer ${transfer.id} failed.`, recommended_action: 'Review payout destination and contact host before retrying payout.', financial_impact_amount: (transfer.amount || 0) / 100, currency: transfer.currency || 'usd', source: 'stripe_webhook' });
        break;
      }

      case 'payout.failed':
      case 'payout.canceled': {
        const payout = event.data.object;
        await createPaymentAlert(base44, { alert_type: 'payout_reversal', severity: 'critical', billing_context: 'payout', stripe_event_type: event.type, stripe_payout_id: payout.id, related_entity_type: 'StripePayout', related_entity_id: payout.id, title: 'Stripe payout issue', message: `Stripe payout event ${event.type} received for ${payout.id}.`, recommended_action: 'Review payout issue in Stripe and notify finance operations.', financial_impact_amount: (payout.amount || 0) / 100, currency: payout.currency || 'usd', source: 'stripe_webhook' });
        break;
      }

      case 'setup_intent.succeeded': {
        const si = event.data.object;
        const customerId = si.customer;
        if (customerId && si.payment_method) {
          await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: si.payment_method },
          });
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        const billingContext = getBillingContext(charge.metadata || {});
        if (billingContext !== 'rental_marketplace_payment') {
          console.log(`[Webhook] Recognized non-rental refund context ${billingContext}; no rental refund action taken.`);
          await logEvent(base44, { event_type: 'billing.context_ignored', actor_id: 'stripe_webhook', actor_email: 'stripe@stripe.com', actor_role: 'stripe', summary: `Ignored non-rental charge.refunded context: ${billingContext}`, metadata: { billing_context: billingContext, charge_id: charge.id }, source: 'webhook' });
          break;
        }
        const bookingRequestId = charge.metadata?.booking_request_id;
        await createPaymentAlert(base44, { alert_type: 'refund_recorded', severity: charge.amount_refunded > 0 ? 'warning' : 'info', billing_context: 'refund', booking_id: bookingRequestId || '', stripe_event_type: event.type, stripe_charge_id: charge.id, related_entity_type: bookingRequestId ? 'BookingRequest' : 'StripeCharge', related_entity_id: bookingRequestId || charge.id, title: 'Refund recorded', message: `Stripe refund recorded for ${bookingRequestId || charge.id}.`, recommended_action: 'Review refund and payout impact if needed.', financial_impact_amount: (charge.amount_refunded || 0) / 100, currency: charge.currency || 'usd', source: 'stripe_webhook' });
        if (bookingRequestId) {
          await base44.asServiceRole.entities.BookingRequest.update(bookingRequestId, {
            payment_status: 'refunded',
          });

          // H2 FIX: Create PaymentLog for refund so it appears in reconciliation
          const refundedAmount = (charge.amount_refunded || 0) / 100;
          if (refundedAmount > 0) {
            const refundedAt = new Date().toISOString();
            const existingRefundLog = await base44.asServiceRole.entities.PaymentLog.filter({ dedupe_key: `refund:${charge.id}` });
            if (existingRefundLog.length === 0) {
              const bookingRec = (await base44.asServiceRole.entities.BookingRequest.filter({ id: bookingRequestId }))[0];
              await base44.asServiceRole.entities.PaymentLog.create({
                booking_request_id: bookingRequestId,
                host_id: bookingRec?.host_id || charge.metadata?.host_id || '',
                customer_email: bookingRec?.user_email || '',
                customer_name: bookingRec?.customer_full_name || '',
                vehicle_id: bookingRec?.vehicle_id || '',
                vehicle_name: bookingRec?.vehicle_name || '',
                week_number: bookingRec?.billing_week_number || 0,
                billing_period_start: refundedAt.slice(0, 10),
                billing_period_end: refundedAt.slice(0, 10),
                amount: refundedAmount,
                currency: charge.currency || 'usd',
                payment_method: 'stripe',
                source_type: 'refund',
                source_confidence: 'trusted',
                legacy_flag: false,
                external_reconcilable: true,
                dedupe_key: `refund:${charge.id}`,
                stripe_payment_intent_id: charge.payment_intent || '',
                stripe_charge_id: charge.id,
                stripe_customer_id: charge.customer || bookingRec?.stripe_customer_id || '',
                status: 'refunded',
                recorded_by: 'stripe_webhook',
                notes: `Stripe refund: ${charge.id}`,
                paid_at: refundedAt,
              });
            }
          }

          await logEvent(base44, {
            event_type: 'payment.refunded',
            actor_id: 'stripe_webhook',
            actor_email: 'stripe@stripe.com',
            actor_role: 'stripe',
            target_entity: 'BookingRequest',
            target_id: bookingRequestId,
            booking_id: bookingRequestId,
            summary: `Refund processed for booking ${bookingRequestId}`,
            metadata: { charge_id: charge.id, amount_refunded: charge.amount_refunded / 100 },
            source: 'webhook',
          });
        }
        break;
      }

      case 'account.updated': {
        const account = event.data.object;
        if (account.metadata?.host_id) {
          const onboardingComplete = account.details_submitted && account.charges_enabled && account.payouts_enabled;
          const hosts = await base44.asServiceRole.entities.Host.filter({ id: account.metadata.host_id });
          if (hosts[0] && onboardingComplete && !hosts[0].stripe_onboarding_complete) {
            await base44.asServiceRole.entities.Host.update(account.metadata.host_id, {
              stripe_onboarding_complete: true,
            });
            await base44.asServiceRole.entities.Notification.create({
              user_email: hosts[0].email,
              title: '✅ Stripe Payouts Activated!',
              body: 'Your Stripe Connect account is verified. You\'ll now automatically receive payouts after each rental. Uride Platform Fee is 8% — you keep 92% before Stripe processing.',
              type: 'system',
            });
            await logEvent(base44, {
              event_type: 'host.stripe_connected',
              actor_id: 'stripe_webhook',
              actor_email: 'stripe@stripe.com',
              actor_role: 'stripe',
              target_entity: 'Host',
              target_id: account.metadata.host_id,
              host_id: account.metadata.host_id,
              summary: `Host ${hosts[0].email} completed Stripe Connect onboarding`,
              metadata: { stripe_account_id: account.id },
              source: 'webhook',
            });
            console.log(`[Webhook] Host ${account.metadata.host_id} Stripe onboarding complete`);
          }
        }
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object;
        const stripeDisputeId = dispute.id;
        await createPaymentAlert(base44, { alert_type: 'chargeback_opened', severity: 'critical', billing_context: 'chargeback', stripe_event_type: event.type, stripe_dispute_id: stripeDisputeId, stripe_payment_intent_id: dispute.payment_intent || '', related_entity_type: 'StripeDispute', related_entity_id: stripeDisputeId, title: 'Chargeback opened', message: `Stripe chargeback opened for $${((dispute.amount || 0) / 100).toFixed(2)}.`, recommended_action: 'Review dispute evidence, contact host, and prepare response before the deadline.', financial_impact_amount: (dispute.amount || 0) / 100, currency: dispute.currency || 'usd', source: 'stripe_webhook' });

        // Idempotency: skip if already processed
        const existingDisputes = await base44.asServiceRole.entities.Dispute.filter({ stripe_dispute_id: stripeDisputeId });
        if (existingDisputes.length > 0) {
          console.log(`[Webhook] Duplicate dispute event for ${stripeDisputeId} — skipping`);
          break;
        }

        // Find the booking via payment_intent
        const paymentIntentId = dispute.payment_intent;
        let booking = null;
        if (paymentIntentId) {
          const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ stripe_payment_intent_id: paymentIntentId });
          booking = bookings[0];
        }

        const dueBy = dispute.evidence_details?.due_by
          ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
          : null;

        // Create Dispute record
        const disputeRecord = await base44.asServiceRole.entities.Dispute.create({
          booking_request_id: booking?.id || '',
          vehicle_id: booking?.vehicle_id || '',
          vehicle_name: booking?.vehicle_name || '',
          host_id: booking?.host_id || '',
          customer_email: booking?.user_email || '',
          dispute_type: 'chargeback',
          opened_by: 'stripe',
          status: 'chargeback',
          description: `Stripe chargeback received: ${dispute.reason || 'unknown reason'} — $${(dispute.amount / 100).toFixed(2)}`,
          stripe_dispute_id: stripeDisputeId,
          stripe_dispute_status: dispute.status,
          stripe_dispute_amount: dispute.amount / 100,
          due_by: dueBy,
        });

        if (booking) {
          // Mark booking under review
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            booking_status: 'under_review',
          });

          // Hold any unpaid/pending payouts for this booking
          const payouts = await base44.asServiceRole.entities.HostPayout.filter({ booking_request_id: booking.id });
          for (const payout of payouts) {
            if (['pending', 'processing'].includes(payout.status)) {
              await base44.asServiceRole.entities.HostPayout.update(payout.id, {
                status: 'held',
                hold_reason: 'chargeback',
                hold_notes: `Stripe chargeback ${stripeDisputeId} — $${(dispute.amount / 100).toFixed(2)}`,
                held_at: new Date().toISOString(),
                held_by: 'stripe_webhook',
              });
              console.log(`[Webhook] Payout ${payout.id} held for chargeback ${stripeDisputeId}`);
            } else if (payout.status === 'paid') {
              const now = new Date().toISOString();
              const liabilityAmount = Math.min(Number(payout.net_host_payout || payout.net_payout || 0), Number(dispute.amount || 0) / 100);
              if (liabilityAmount > 0) {
                await base44.asServiceRole.entities.HostReceivable.create({
                  host_id: booking.host_id || payout.host_id || '',
                  booking_request_id: booking.id,
                  host_payout_id: payout.id,
                  dispute_id: disputeRecord.id,
                  stripe_dispute_id: stripeDisputeId,
                  stripe_payment_intent_id: paymentIntentId || '',
                  receivable_type: 'chargeback_recovery',
                  status: 'open',
                  original_amount: liabilityAmount,
                  remaining_amount: liabilityAmount,
                  recovered_amount: 0,
                  currency: dispute.currency || 'usd',
                  liability_reason: 'Customer chargeback after host payout was already paid; future payouts will be offset until recovered.',
                  offset_from_future_payouts: true,
                  created_at: now,
                  notes: `Created automatically for Stripe dispute ${stripeDisputeId}.`,
                  audit_log: [{ action: 'chargeback_liability_created', amount: liabilityAmount, changed_at: now, note: 'Host payout already paid before chargeback.' }]
                });
              }
              await base44.asServiceRole.entities.HostPayout.update(payout.id, {
                hold_notes: `⚠️ CHARGEBACK ALERT: ${stripeDisputeId} — payout already sent; host receivable created for future payout offset.`,
              });
            }
          }

          // Increment customer chargeback count
          if (booking.user_email) {
            const customers = await base44.asServiceRole.entities.Customer.filter({ email: booking.user_email });
            if (customers[0]) {
              await base44.asServiceRole.entities.Customer.update(customers[0].id, {
                chargeback_count: (customers[0].chargeback_count || 0) + 1,
              });
            }
          }
        }

        if (booking?.host_id) {
          await createPaymentAlert(base44, { alert_type: 'chargeback_opened', severity: 'critical', billing_context: 'chargeback', booking_id: booking.id, host_id: booking.host_id, customer_id: booking.user_id || '', vehicle_id: booking.vehicle_id || '', renter_email: booking.user_email || '', stripe_event_type: event.type, stripe_dispute_id: stripeDisputeId, stripe_payment_intent_id: paymentIntentId || '', related_entity_type: 'Dispute', related_entity_id: disputeRecord.id, title: 'Chargeback liability recorded', message: `Chargeback opened after payment. Pending payouts were held and any paid host payout created a receivable for future payout offset.`, recommended_action: 'Review dispute evidence and host receivable recovery before releasing future payouts.', financial_impact_amount: (dispute.amount || 0) / 100, currency: dispute.currency || 'usd', requires_admin_action: true, requires_host_action: true, source: 'stripe_webhook' });
        }

        await logEvent(base44, {
          event_type: 'dispute.chargeback_received',
          actor_id: 'stripe_webhook',
          actor_email: 'stripe@stripe.com',
          actor_role: 'stripe',
          target_entity: 'Dispute',
          target_id: disputeRecord.id,
          booking_id: booking?.id || '',
          vehicle_id: booking?.vehicle_id || '',
          host_id: booking?.host_id || '',
          customer_id: booking?.user_email || '',
          summary: `CHARGEBACK received: $${(dispute.amount / 100).toFixed(2)} — ${dispute.reason || 'unknown'} — due ${dueBy ? new Date(dueBy).toLocaleDateString() : 'unknown'}`,
          metadata: { stripe_dispute_id: stripeDisputeId, amount: dispute.amount / 100, reason: dispute.reason, due_by: dueBy, stripe_status: dispute.status },
          source: 'webhook',
        });

        console.log(`[Webhook] ⚠️ CHARGEBACK: ${stripeDisputeId} — $${(dispute.amount / 100).toFixed(2)} — Due: ${dueBy}`);
        break;
      }

      case 'charge.dispute.updated': {
        const dispute = event.data.object;
        const existing = await base44.asServiceRole.entities.Dispute.filter({ stripe_dispute_id: dispute.id });
        if (existing[0]) {
          await base44.asServiceRole.entities.Dispute.update(existing[0].id, {
            stripe_dispute_status: dispute.status,
          });
        }
        console.log(`[Webhook] Dispute updated: ${dispute.id} → ${dispute.status}`);
        break;
      }

      case 'charge.dispute.closed': {
        const dispute = event.data.object;
        const existing = await base44.asServiceRole.entities.Dispute.filter({ stripe_dispute_id: dispute.id });
        if (existing[0]) {
          const won = dispute.status === 'won';
          const newStatus = won ? 'resolved_host_favor' : 'resolved_customer_favor';
          await base44.asServiceRole.entities.Dispute.update(existing[0].id, {
            stripe_dispute_status: dispute.status,
            status: newStatus,
            resolved_at: new Date().toISOString(),
            resolved_by: 'stripe',
          });

          // If won, release held payout
          if (won && existing[0].booking_request_id) {
            const payouts = await base44.asServiceRole.entities.HostPayout.filter({ booking_request_id: existing[0].booking_request_id });
            for (const payout of payouts) {
              if (payout.status === 'held' && payout.hold_reason === 'chargeback') {
                await base44.asServiceRole.entities.HostPayout.update(payout.id, {
                  status: 'pending',
                  released_at: new Date().toISOString(),
                  hold_notes: (payout.hold_notes || '') + ' — Released: dispute won',
                });
              }
            }
          }

          await logEvent(base44, {
            event_type: 'dispute.resolved',
            actor_id: 'stripe_webhook',
            actor_email: 'stripe@stripe.com',
            actor_role: 'stripe',
            target_entity: 'Dispute',
            target_id: existing[0].id,
            booking_id: existing[0].booking_request_id || '',
            summary: `Dispute ${dispute.id} closed: ${dispute.status} — ${won ? 'payout hold released' : 'customer wins'}`,
            metadata: { stripe_dispute_id: dispute.id, outcome: dispute.status },
            source: 'webhook',
          });
        }
        await createPaymentAlert(base44, { alert_type: dispute.status === 'won' ? 'chargeback_won' : 'chargeback_lost', severity: dispute.status === 'won' ? 'info' : 'critical', billing_context: 'chargeback', stripe_event_type: event.type, stripe_dispute_id: dispute.id, stripe_payment_intent_id: dispute.payment_intent || '', related_entity_type: 'StripeDispute', related_entity_id: dispute.id, title: dispute.status === 'won' ? 'Chargeback won' : 'Chargeback lost', message: `Stripe dispute ${dispute.id} closed with status ${dispute.status}.`, recommended_action: dispute.status === 'won' ? 'Confirm dispute outcome and close related operational alerts.' : 'Review financial exposure and determine manual remediation.', financial_impact_amount: (dispute.amount || 0) / 100, currency: dispute.currency || 'usd', source: 'stripe_webhook' });
        console.log(`[Webhook] Dispute closed: ${dispute.id} → ${dispute.status}`);
        break;
      }

      default:
        break;
    }

    return Response.json({ received: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});