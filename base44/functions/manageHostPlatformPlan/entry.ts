import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });

const TRIAL_DAYS = 14;
const HOST_SUBSCRIPTION_CONTEXT = 'host_platform_subscription';

const PLAN_CONFIG = {
  marketplace_partner: { label: 'Marketplace Partner', monthlyAmount: 0, billingRoute: 'commission', marketplaceFeeRate: 0.08 },
  fleetos_professional: { label: 'FleetOS Professional', monthlyAmount: 29.99, billingRoute: 'subscription', marketplaceFeeRate: 0, productName: 'FleetOS Professional', lookupKey: 'uride_fleetos_professional_monthly_usd' },
  hybrid_growth: { label: 'Hybrid Growth', monthlyAmount: 29.99, billingRoute: 'subscription_plus_marketplace', marketplaceFeeRate: 0.04, productName: 'Hybrid Growth', lookupKey: 'uride_hybrid_growth_monthly_usd' }
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

function toIsoFromUnix(value) {
  return value ? new Date(value * 1000).toISOString() : undefined;
}

function paymentModeFields(plan, mode) {
  const isFleetOS = mode === 'fleetos_professional';
  const usesUridePayments = !isFleetOS;
  return {
    payment_mode: isFleetOS ? 'own_payments' : 'uride_payments',
    uses_uride_payments: usesUridePayments,
    uses_own_payments: !usesUridePayments,
    customer_payment_routing: isFleetOS ? 'host_external' : 'uride_checkout',
    stripe_connect_required: false,
    stripe_connect_optional: true,
    marketplace_enabled: !isFleetOS,
  };
}

function commercePayload(host, mode) {
  const isFleetOS = mode === 'fleetos_professional';
  const isHybrid = mode === 'hybrid_growth';
  const stripeReady = !!host?.stripe_onboarding_complete && !!host?.stripe_account_id;
  return {
    host_id: host.id,
    plan_type: mode,
    marketplace_enabled: !isFleetOS,
    marketplace_visibility: !isFleetOS,
    booking_enabled: true,
    online_payments_enabled: isFleetOS ? stripeReady : true,
    payment_processor: isFleetOS ? (stripeReady ? 'host_stripe' : 'reservation_only') : 'uride_stripe',
    commission_rate: isFleetOS ? 0 : isHybrid ? 0.04 : 0.08,
    subscription_rate: isFleetOS || isHybrid ? 29.99 : 0,
    stripe_account_id: host.stripe_account_id || '',
    host_checkout_enabled: isFleetOS && stripeReady,
    contract_owner: isFleetOS ? 'host' : 'uride',
    payment_owner: isFleetOS ? 'host' : 'uride'
  };
}

async function upsertCommerceProfile(base44, host, mode) {
  const existing = await base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id: host.id }, '-updated_date', 1);
  const payload = commercePayload(host, mode);
  if (existing?.[0]?.id) return base44.asServiceRole.entities.HostCommerceProfile.update(existing[0].id, payload);
  return base44.asServiceRole.entities.HostCommerceProfile.create(payload);
}

async function getOrCreateStripeCustomer(host, existingCustomerId) {
  if (existingCustomerId) return existingCustomerId;
  const customer = await stripe.customers.create({
    email: host.email,
    name: host.business_name || host.full_name || host.email,
    metadata: { host_id: host.id, user_id: host.user_id || '', billing_context: HOST_SUBSCRIPTION_CONTEXT, customer_role: 'host_subscription' }
  });
  return customer.id;
}

async function getOrCreateStripePrice(config, mode) {
  const existing = await stripe.prices.list({ lookup_keys: [config.lookupKey], active: true, limit: 1 });
  if (existing.data?.[0]) return existing.data[0];

  const product = await stripe.products.create({
    name: config.productName,
    metadata: { billing_context: HOST_SUBSCRIPTION_CONTEXT, plan_mode: mode }
  });

  return stripe.prices.create({
    currency: 'usd',
    unit_amount: Math.round(config.monthlyAmount * 100),
    recurring: { interval: 'month' },
    product: product.id,
    lookup_key: config.lookupKey,
    metadata: { billing_context: HOST_SUBSCRIPTION_CONTEXT, plan_mode: mode }
  });
}

async function findLatestSubscription(base44, hostId) {
  const records = await base44.asServiceRole.entities.HostPlatformSubscription.filter({ host_id: hostId }, '-updated_date', 20);
  return records[0] || null;
}

async function updateSubscriptionRecord(base44, existing, payload) {
  if (existing?.id) return base44.asServiceRole.entities.HostPlatformSubscription.update(existing.id, payload);
  return base44.asServiceRole.entities.HostPlatformSubscription.create(payload);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { host_id, plan_id, mode } = await req.json();
    if (!host_id || !mode) return Response.json({ error: 'Missing host_id or mode' }, { status: 400 });
    const config = PLAN_CONFIG[mode];
    if (!config) return Response.json({ error: 'Unsupported package mode' }, { status: 400 });

    const host = await base44.asServiceRole.entities.Host.get(host_id);
    if (!host) return Response.json({ error: 'Host not found' }, { status: 404 });
    const isOwner = host.email === user.email || host.user_id === user.id;
    if (!isOwner && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const plans = plan_id
      ? [await base44.asServiceRole.entities.OperatorPlanConfiguration.get(plan_id)]
      : await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id }, '-updated_date', 1);
    const plan = plans?.[0];
    if (!plan) return Response.json({ error: 'Operator plan not found' }, { status: 404 });

    const now = new Date().toISOString();
    const previousMode = plan.active_mode && plan.active_mode !== 'none' ? plan.active_mode : (plan.selected_mode || plan.recommended_mode || 'marketplace_partner');
    const existingSubscription = await findLatestSubscription(base44, host_id);
    const auditEntry = { from_status: plan.status || 'unknown', to_status: mode === 'marketplace_partner' ? 'active' : 'pending_payment', changed_by: user.email, changed_at: now, reason: `Host selected ${config.label}.`, source: 'host_edit' };

    if (mode === 'marketplace_partner') {
      if (existingSubscription?.stripe_subscription_id && ACTIVE_SUBSCRIPTION_STATUSES.has(existingSubscription.status)) {
        await stripe.subscriptions.update(existingSubscription.stripe_subscription_id, { cancel_at_period_end: true });
        await base44.asServiceRole.entities.HostPlatformSubscription.update(existingSubscription.id, {
          plan_mode: mode,
          billing_route: 'commission',
          status: 'canceling',
          subscription_status: 'canceling',
          cancel_at_period_end: true,
          last_payment_status: 'cancelled',
          source: 'package_change',
          last_updated_at: now,
          audit_log: [...(existingSubscription.audit_log || []), { action: 'cancel_at_period_end', status: 'canceling', changed_by: user.email, changed_at: now, note: 'Switched to Marketplace Partner; monthly subscription cancellation scheduled.' }]
        });
      }

      await base44.asServiceRole.entities.OperatorPlanConfiguration.update(plan.id, {
        selected_mode: mode,
        active_mode: mode,
        status: 'active',
        marketplace_enabled: true,
        marketplace_fee_rate: config.marketplaceFeeRate,
        monthly_subscription_amount: 0,
        platform_billing_route: config.billingRoute,
        payment_required: false,
        billing_activation_pending: false,
        last_payment_status: 'not_required',
        activation_source: 'host_edit',
        last_updated_at: now,
        ...paymentModeFields(plan, mode),
        status_audit_log: [...(plan.status_audit_log || []), { ...auditEntry, to_status: 'active' }]
      });

      await upsertCommerceProfile(base44, host, mode);
      await base44.asServiceRole.entities.OperatorRecommendationHistory.create({ host_id, user_id: user.id, previous_mode: plan.selected_mode || plan.active_mode || '', new_mode: mode, reason: 'Host changed package from Business Operations.', changed_by: user.email, changed_at: now, source: 'host_edit' });
      return Response.json({ ok: true, mode, status: 'active' });
    }

    if (existingSubscription?.stripe_subscription_id && ACTIVE_SUBSCRIPTION_STATUSES.has(existingSubscription.status)) {
      await stripe.subscriptions.update(existingSubscription.stripe_subscription_id, {
        cancel_at_period_end: false,
        metadata: { billing_context: HOST_SUBSCRIPTION_CONTEXT, host_id, user_id: user.id || '', operator_plan_id: plan.id, plan_mode: mode }
      });

      await base44.asServiceRole.entities.HostPlatformSubscription.update(existingSubscription.id, {
        operator_plan_id: plan.id,
        plan_mode: mode,
        billing_route: config.billingRoute,
        status: existingSubscription.status === 'trialing' ? 'trialing' : 'active',
        subscription_status: existingSubscription.status === 'trialing' ? 'trialing' : 'active',
        trial_active: existingSubscription.status === 'trialing',
        monthly_amount: config.monthlyAmount,
        cancel_at_period_end: false,
        source: 'package_change',
        last_updated_at: now,
        audit_log: [...(existingSubscription.audit_log || []), { action: 'package_reused_active_subscription', status: existingSubscription.status, changed_by: user.email, changed_at: now, note: `Reused or reactivated active subscription for ${config.label}.` }]
      });

      await base44.asServiceRole.entities.OperatorPlanConfiguration.update(plan.id, {
        selected_mode: mode,
        active_mode: mode,
        status: 'active',
        marketplace_fee_rate: config.marketplaceFeeRate,
        monthly_subscription_amount: config.monthlyAmount,
        platform_billing_route: config.billingRoute,
        payment_required: true,
        billing_activation_pending: false,
        last_payment_status: existingSubscription.status === 'trialing' ? 'pending' : 'paid',
        activation_source: 'subscription_payment',
        last_updated_at: now,
        ...paymentModeFields(plan, mode),
        status_audit_log: [...(plan.status_audit_log || []), { ...auditEntry, to_status: 'active', reason: `Host selected ${config.label}; active platform subscription reused.` }]
      });

      await upsertCommerceProfile(base44, host, mode);
      await base44.asServiceRole.entities.OperatorRecommendationHistory.create({ host_id, user_id: user.id, previous_mode: plan.selected_mode || plan.active_mode || '', new_mode: mode, reason: 'Host changed package and reused active subscription.', changed_by: user.email, changed_at: now, source: 'host_edit' });
      return Response.json({ ok: true, mode, status: 'active', reused_subscription: true });
    }

    await base44.asServiceRole.entities.OperatorPlanConfiguration.update(plan.id, {
      selected_mode: mode,
      active_mode: 'none',
      status: 'pending_payment',
      marketplace_fee_rate: config.marketplaceFeeRate,
      monthly_subscription_amount: config.monthlyAmount,
      platform_billing_route: config.billingRoute,
      payment_required: true,
      billing_activation_pending: true,
      last_payment_status: 'pending',
      activation_source: 'subscription_payment',
      last_updated_at: now,
      ...paymentModeFields(plan, mode),
      status_audit_log: [...(plan.status_audit_log || []), auditEntry]
    });

    const stripeCustomerId = await getOrCreateStripeCustomer(host, existingSubscription?.stripe_customer_id);
    const stripePrice = await getOrCreateStripePrice(config, mode);
    const origin = req.headers.get('origin') || 'https://uridehub.com';
    const subscriptionMetadata = { billing_context: HOST_SUBSCRIPTION_CONTEXT, host_id, user_id: user.id || '', operator_plan_id: plan.id, plan_mode: mode, trial_days: String(TRIAL_DAYS) };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      payment_method_collection: 'always',
      line_items: [{ quantity: 1, price: stripePrice.id }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: subscriptionMetadata
      },
      metadata: subscriptionMetadata,
      success_url: `${origin}/host/business-operations?platform_subscription_return=1`,
      cancel_url: `${origin}/host/business-operations?platform_subscription_cancel=1`
    });

    await updateSubscriptionRecord(base44, existingSubscription, {
      host_id,
      user_id: user.id || host.user_id || '',
      operator_plan_id: plan.id,
      plan_mode: mode,
      billing_route: config.billingRoute,
      status: 'checkout_started',
      subscription_status: 'checkout_started',
      trial_active: false,
      trial_days: TRIAL_DAYS,
      monthly_amount: config.monthlyAmount,
      currency: 'usd',
      stripe_customer_id: stripeCustomerId,
      stripe_checkout_session_id: session.id,
      stripe_product_id: typeof stripePrice.product === 'string' ? stripePrice.product : stripePrice.product?.id || '',
      stripe_price_id: stripePrice.id,
      last_payment_status: 'pending',
      source: 'package_change',
      last_updated_at: now,
      audit_log: [...(existingSubscription?.audit_log || []), { action: 'checkout_started', status: 'checkout_started', changed_by: user.email, changed_at: now, note: `Stripe subscription checkout opened for ${config.label}.` }]
    });

    if (previousMode === 'fleetos_professional' && mode === 'hybrid_growth') {
      await upsertCommerceProfile(base44, host, 'fleetos_professional');
    } else if (mode !== 'hybrid_growth') {
      await upsertCommerceProfile(base44, host, mode);
    }
    await base44.asServiceRole.entities.OperatorRecommendationHistory.create({ host_id, user_id: user.id, previous_mode: plan.selected_mode || plan.active_mode || '', new_mode: mode, reason: 'Host changed package and platform subscription checkout was started.', changed_by: user.email, changed_at: now, source: 'host_edit' });

    return Response.json({ ok: true, mode, status: 'checkout_started', url: session.url });
  } catch (error) {
    console.error('[ManageHostPlatformPlan] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});