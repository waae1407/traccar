import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Recalculates health metrics for a SubscriptionAccount from its SubscriptionItems.
 * Called after any item status change.
 *
 * Input: { subscription_account_id }
 */

export async function recalcHealth(base44, accountId) {
  const items = await base44.asServiceRole.entities.SubscriptionItem.filter(
    { subscription_account_id: accountId }, '-updated_date', 50
  );
  const activeItems = items.filter(i => ['active', 'trialing'].includes(i.status));
  const pastDueItems = items.filter(i => i.status === 'past_due');
  const cancelledItems = items.filter(i => i.status === 'cancelled');

  // Include all non-cancelled items in MRR (checkout_started, incomplete, past_due all have billed amounts)
  const billedItems = items.filter(i => !['cancelled', 'paused'].includes(i.status));
  const monthlyTotal = billedItems.reduce((s, i) => s + (i.monthly_amount || 0), 0);
  const nextBilling = activeItems
    .filter(i => i.current_period_end)
    .sort((a, b) => new Date(a.current_period_end) - new Date(b.current_period_end))[0]?.current_period_end;

  let healthScore = 100;
  let healthStatus = 'healthy';
  if (pastDueItems.length === 1) { healthScore = 60; healthStatus = 'warning'; }
  if (pastDueItems.length > 1) { healthScore = 40; healthStatus = 'critical'; }
  if (activeItems.some(i => i.payment_status === 'failed')) { healthScore = 20; healthStatus = 'critical'; }
  if (!activeItems.length && cancelledItems.length > 0) { healthScore = 0; healthStatus = 'suspended'; }

  const status = pastDueItems.length > 0 ? 'past_due'
    : activeItems.some(i => i.status === 'trialing') ? 'trialing'
    : activeItems.length > 0 ? 'active'
    : cancelledItems.length > 0 ? 'cancelled'
    : 'no_payment_method';

  await base44.asServiceRole.entities.SubscriptionAccount.update(accountId, {
    monthly_total: Math.round(monthlyTotal * 100) / 100,
    active_item_count: activeItems.length,
    past_due_item_count: pastDueItems.length,
    cancelled_item_count: cancelledItems.length,
    next_billing_date: nextBilling || null,
    health_score: healthScore,
    health_status: healthStatus,
    status,
    updated_at: new Date().toISOString(),
  });

  return { accountId, health_score: healthScore, health_status: healthStatus, status, monthly_total: monthlyTotal };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });
    const { subscription_account_id } = await req.json();
    if (!subscription_account_id) return Response.json({ error: 'subscription_account_id required' }, { status: 400 });

    const result = await recalcHealth(base44, subscription_account_id);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});