import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });

const PLAN_CONFIG = {
  marketplace_partner: { label: 'Marketplace Partner', monthlyAmount: 0, billingRoute: 'commission', marketplaceFeeRate: 0.08 },
  fleetos_professional: { label: 'FleetOS Professional', monthlyAmount: 29.99, billingRoute: 'subscription', marketplaceFeeRate: 0 },
  hybrid_growth: { label: 'Hybrid Growth', monthlyAmount: 29.99, billingRoute: 'subscription_plus_marketplace', marketplaceFeeRate: 0.04 }
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

function toIsoFromUnix(value) {
  return value ? new Date(value * 1000).toISOString() : undefined;
}

function paymentModeFields(plan, mode) {
  const usesUridePayments = !!plan?.uses_uride_payments;
  return {
    payment_mode: plan?.payment_mode || (usesUridePayments ? 'uride_payments' : 'own_payments'),
    uses_uride_payments: usesUridePayments,
    uses_own_payments: !usesUridePayments,
    customer_payment_routing: usesUridePayments ? 'uride_checkout' : 'host_external',
    stripe_connect_required: false,
    stripe_connect_optional: true,
    marketplace_enabled: mode !== 'fleetos_professional',
  };
}

async function getOrCreateStripeCustomer(host, existingCustomerId) {
  if (existingCustomerId) return existingCustomerId;
  const customer = await stripe.customers.create({
    email: host.email,
    name: host.business_name || host.full_name || host.email,
    metadata: { host_id: host.id, user_id: host.user_id || '', billing_context: 'operator_subscription' }
  });
  return customer.id;
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
    const existingSubscription = await findLatestSubscription(base44, host_id);
    const auditEntry = { from_status: plan.status || 'unknown', to_status: mode === 'marketplace_partner' ? 'active' : 'pending_payment', changed_by: user.email, changed_at: now, reason: `Host selected ${config.label}.`, source: 'host_edit' };

    if (mode === 'marketplace_partner') {
      if (existingSubscription?.stripe_subscription_id && ACTIVE_SUBSCRIPTION_STATUSES.has(existingSubscription.status)) {
        await stripe.subscriptions.update(existingSubscription.stripe_subscription_id, { cancel_at_period_end: true });
        await base44.asServiceRole.entities.HostPlatformSubscription.update(existingSubscription.id, {
          plan_mode: mode,
          billing_route: 'commission',
          status: 'canceling',
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

      await base44.asServiceRole.entities.OperatorRecommendationHistory.create({ host_id, user_id: user.id, previous_mode: plan.selected_mode || plan.active_mode || '', new_mode: mode, reason: 'Host changed package from Business Operations.', changed_by: user.email, changed_at: now, source: 'host_edit' });
      return Response.json({ ok: true, mode, status: 'active' });
    }

    if (existingSubscription?.stripe_subscription_id && ACTIVE_SUBSCRIPTION_STATUSES.has(existingSubscription.status)) {
      await stripe.subscriptions.update(existingSubscription.stripe_subscription_id, {
        cancel_at_period_end: false,
        metadata: { billing_context: 'operator_subscription', host_id, user_id: user.id || '', operator_plan_id: plan.id, plan_mode: mode }
      });

      await base44.asServiceRole.entities.HostPlatformSubscription.update(existingSubscription.id, {
        operator_plan_id: plan.id,
        plan_mode: mode,
        billing_route: config.billingRoute,
        status: existingSubscription.status === 'trialing' ? 'trialing' : 'active',
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
        last_payment_status: 'paid',
        activation_source: 'subscription_payment',
        last_updated_at: now,
        ...paymentModeFields(plan, mode),
        status_audit_log: [...(plan.status_audit_log || []), { ...auditEntry, to_status: 'active', reason: `Host selected ${config.label}; active platform subscription reused.` }]
      });

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
    const origin = req.headers.get('origin') || 'https://uridehub.com';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(config.monthlyAmount * 100),
          recurring: { interval: 'month' },
          product_data: { name: `uRide ${config.label}`, metadata: { billing_context: 'operator_subscription', plan_mode: mode } }
        }
      }],
      subscription_data: {
        metadata: { billing_context: 'operator_subscription', host_id, user_id: user.id || '', operator_plan_id: plan.id, plan_mode: mode }
      },
      metadata: { billing_context: 'operator_subscription', host_id, user_id: user.id || '', operator_plan_id: plan.id, plan_mode: mode },
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
      monthly_amount: config.monthlyAmount,
      currency: 'usd',
      stripe_customer_id: stripeCustomerId,
      stripe_checkout_session_id: session.id,
      last_payment_status: 'pending',
      source: 'package_change',
      last_updated_at: now,
      audit_log: [...(existingSubscription?.audit_log || []), { action: 'checkout_started', status: 'checkout_started', changed_by: user.email, changed_at: now, note: `Stripe subscription checkout opened for ${config.label}.` }]
    });

    await base44.asServiceRole.entities.OperatorRecommendationHistory.create({ host_id, user_id: user.id, previous_mode: plan.selected_mode || plan.active_mode || '', new_mode: mode, reason: 'Host changed package and platform subscription checkout was started.', changed_by: user.email, changed_at: now, source: 'host_edit' });

    return Response.json({ ok: true, mode, status: 'checkout_started', url: session.url });
  } catch (error) {
    console.error('[ManageHostPlatformPlan] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});