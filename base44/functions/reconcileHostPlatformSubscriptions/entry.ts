import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });
const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const BAD_STATUSES = new Set(['past_due', 'unpaid', 'incomplete']);

function toIso(value) {
  return value ? new Date(value * 1000).toISOString() : undefined;
}

function planPatchFor(mode, stripeStatus, now) {
  if (ACTIVE_STATUSES.has(stripeStatus)) {
    return {
      selected_mode: mode,
      active_mode: mode,
      status: 'active',
      marketplace_enabled: mode !== 'fleetos_professional',
      marketplace_fee_rate: mode === 'hybrid_growth' ? 0.04 : 0,
      monthly_subscription_amount: 29.99,
      platform_billing_route: mode === 'hybrid_growth' ? 'subscription_plus_marketplace' : 'subscription',
      payment_required: true,
      billing_activation_pending: false,
      last_payment_status: 'paid',
      activation_source: 'subscription_payment',
      last_updated_at: now
    };
  }
  if (BAD_STATUSES.has(stripeStatus)) {
    return { status: 'past_due', active_mode: 'none', billing_activation_pending: true, last_payment_status: 'past_due', last_updated_at: now };
  }
  if (['canceled', 'incomplete_expired', 'paused'].includes(stripeStatus)) {
    return { status: 'cancelled', active_mode: 'none', billing_activation_pending: true, last_payment_status: 'cancelled', cancelled_at: now, last_updated_at: now };
  }
  return { last_updated_at: now };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const now = new Date().toISOString();
    const records = await base44.asServiceRole.entities.HostPlatformSubscription.list('-updated_date', 500);
    const candidates = records.filter((r) => r.stripe_subscription_id && r.status !== 'not_required');
    const results = [];

    for (const record of candidates) {
      try {
        const sub = await stripe.subscriptions.retrieve(record.stripe_subscription_id);
        const stripeStatus = sub.status;
        const mode = sub.metadata?.plan_mode || record.plan_mode || 'fleetos_professional';
        const paymentStatus = ACTIVE_STATUSES.has(stripeStatus) ? 'paid' : BAD_STATUSES.has(stripeStatus) ? 'past_due' : ['canceled', 'incomplete_expired', 'paused'].includes(stripeStatus) ? 'cancelled' : record.last_payment_status;

        await base44.asServiceRole.entities.HostPlatformSubscription.update(record.id, {
          plan_mode: mode,
          billing_route: mode === 'hybrid_growth' ? 'subscription_plus_marketplace' : 'subscription',
          status: stripeStatus,
          monthly_amount: 29.99,
          currency: sub.currency || record.currency || 'usd',
          stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || record.stripe_customer_id || '',
          current_period_start: toIso(sub.current_period_start),
          current_period_end: toIso(sub.current_period_end),
          cancel_at_period_end: !!sub.cancel_at_period_end,
          cancelled_at: toIso(sub.canceled_at),
          last_payment_status: paymentStatus,
          source: 'system',
          last_updated_at: now,
          audit_log: [...(record.audit_log || []), { action: 'subscription_reconciled', status: stripeStatus, changed_by: user?.email || 'scheduled_reconciliation', changed_at: now, note: 'Synced from Stripe subscription status.' }]
        });

        if (record.operator_plan_id) {
          const plans = await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ id: record.operator_plan_id });
          const plan = plans[0];
          await base44.asServiceRole.entities.OperatorPlanConfiguration.update(record.operator_plan_id, {
            ...planPatchFor(mode, stripeStatus, now),
            status_audit_log: [...(plan?.status_audit_log || []), { from_status: plan?.status || 'unknown', to_status: ACTIVE_STATUSES.has(stripeStatus) ? 'active' : BAD_STATUSES.has(stripeStatus) ? 'past_due' : stripeStatus, changed_by: user?.email || 'scheduled_reconciliation', changed_at: now, reason: 'Stripe subscription reconciliation corrected local status.', source: 'system' }]
          });
        }

        if (BAD_STATUSES.has(stripeStatus)) {
          await base44.asServiceRole.functions.invoke('createPaymentOperationalAlert', {
            alert_type: 'subscription_past_due',
            severity: 'critical',
            billing_context: 'subscription',
            host_id: record.host_id || '',
            stripe_invoice_id: record.stripe_invoice_id || '',
            title: 'Platform subscription past due',
            message: `Stripe subscription ${record.stripe_subscription_id} is ${stripeStatus}. Local subscription status was reconciled.`,
            recommended_action: 'Contact host and update payment method before restoring paid-plan access.',
            financial_impact_amount: record.monthly_amount || 29.99,
            source: 'reconcileHostPlatformSubscriptions'
          });
        }

        results.push({ id: record.id, subscription: record.stripe_subscription_id, status: stripeStatus, ok: true });
      } catch (error) {
        results.push({ id: record.id, subscription: record.stripe_subscription_id, ok: false, error: error.message });
      }
    }

    return Response.json({ ok: true, checked: candidates.length, results });
  } catch (error) {
    console.error('[SubscriptionReconcile] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});