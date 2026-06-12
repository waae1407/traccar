import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveOwnerType(record) {
  if (record.host_id) return 'host';
  if (record.customer_user_id) return 'customer';
  return 'guest';
}

function accountKeyForHost(hostId) { return `host:${hostId}`; }
function accountKeyForCustomer(email) { return `customer:${email}`; }

async function upsertSubscriptionAccount(base44, { ownerType, ownerId, ownerEmail, ownerName, hostId, customerUserId, stripeCustomerId, dryRun }) {
  const filter = hostId
    ? { host_id: hostId }
    : { customer_user_id: customerUserId || ownerEmail };

  const existing = ownerEmail
    ? (await base44.asServiceRole.entities.SubscriptionAccount.filter(
        hostId ? { host_id: hostId } : { owner_email: ownerEmail },
        '-updated_date', 1
      ))
    : [];

  const payload = {
    owner_type: ownerType,
    owner_id: ownerId || '',
    owner_email: ownerEmail || '',
    owner_name: ownerName || '',
    host_id: hostId || '',
    customer_user_id: customerUserId || '',
    stripe_customer_id: stripeCustomerId || '',
    updated_at: new Date().toISOString(),
  };

  if (existing[0]) {
    if (!dryRun) {
      await base44.asServiceRole.entities.SubscriptionAccount.update(existing[0].id, {
        ...payload,
        stripe_customer_id: stripeCustomerId || existing[0].stripe_customer_id || '',
      });
    }
    return { id: existing[0].id, action: 'updated' };
  }

  if (dryRun) return { id: `dry_run_${Date.now()}`, action: 'would_create' };
  const created = await base44.asServiceRole.entities.SubscriptionAccount.create({
    ...payload,
    created_at: new Date().toISOString(),
    health_score: 100,
    health_status: 'healthy',
    monthly_total: 0,
    active_item_count: 0,
    past_due_item_count: 0,
    cancelled_item_count: 0,
  });
  return { id: created.id, action: 'created' };
}

async function upsertSubscriptionItem(base44, { accountId, itemType, sourcEntity, sourceEntityId, payload, dryRun }) {
  const idempKey = `${sourcEntity}:${sourceEntityId}`;
  const existing = await base44.asServiceRole.entities.SubscriptionItem.filter(
    { idempotency_key: idempKey }, '-updated_date', 1
  );

  const fullPayload = {
    ...payload,
    subscription_account_id: accountId,
    item_type: itemType,
    source_entity: sourcEntity,
    source_entity_id: sourceEntityId,
    idempotency_key: idempKey,
    updated_at: new Date().toISOString(),
  };

  if (existing[0]) {
    if (!dryRun) await base44.asServiceRole.entities.SubscriptionItem.update(existing[0].id, fullPayload);
    return { id: existing[0].id, action: 'updated' };
  }

  if (dryRun) return { id: `dry_run_item_${Date.now()}`, action: 'would_create' };
  const created = await base44.asServiceRole.entities.SubscriptionItem.create({
    ...fullPayload,
    created_at: new Date().toISOString(),
  });
  return { id: created.id, action: 'created' };
}

async function recalculateAccountHealth(base44, accountId, dryRun) {
  if (dryRun) return;
  const items = await base44.asServiceRole.entities.SubscriptionItem.filter(
    { subscription_account_id: accountId }, '-updated_date', 50
  );
  const activeItems = items.filter(i => ['active', 'trialing'].includes(i.status));
  const pastDueItems = items.filter(i => i.status === 'past_due');
  const cancelledItems = items.filter(i => i.status === 'cancelled');
  const monthlyTotal = activeItems.reduce((s, i) => s + (i.monthly_amount || 0), 0);
  const nextBilling = activeItems
    .filter(i => i.current_period_end)
    .sort((a, b) => new Date(a.current_period_end) - new Date(b.current_period_end))[0]?.current_period_end;

  let healthScore = 100;
  let healthStatus = 'healthy';
  if (pastDueItems.length === 1) { healthScore = 60; healthStatus = 'warning'; }
  if (pastDueItems.length > 1) { healthScore = 40; healthStatus = 'critical'; }
  if (activeItems.some(i => i.payment_status === 'failed')) { healthScore = 20; healthStatus = 'critical'; }
  if (!activeItems.length && cancelledItems.length > 0) { healthScore = 0; healthStatus = 'suspended'; }

  const acctStatus = pastDueItems.length > 0 ? 'past_due'
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
    status: acctStatus,
    updated_at: new Date().toISOString(),
  });
}

// ── Main Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { dry_run = true, host_id_filter, limit = 500 } = await req.json().catch(() => ({}));
    const dryRun = dry_run === true || dry_run === 'true';

    const stats = {
      dry_run: dryRun,
      created_accounts: 0,
      updated_accounts: 0,
      created_items: 0,
      updated_items: 0,
      skipped: 0,
      warnings: [],
    };

    // ── 1. Migrate HostPlatformSubscription ───────────────────────────────────
    const hostSubs = host_id_filter
      ? await base44.asServiceRole.entities.HostPlatformSubscription.filter({ host_id: host_id_filter }, '-updated_date', limit)
      : await base44.asServiceRole.entities.HostPlatformSubscription.list('-updated_date', limit);

    for (const sub of hostSubs) {
      if (!sub.host_id) {
        stats.skipped++;
        stats.warnings.push(`HostPlatformSubscription ${sub.id} has no host_id — skipped`);
        continue;
      }

      // Resolve host email
      let ownerEmail = '';
      let ownerName = '';
      const hosts = await base44.asServiceRole.entities.Host.filter({ id: sub.host_id }, '-updated_date', 1);
      const host = hosts[0];
      if (host) { ownerEmail = host.email || ''; ownerName = host.full_name || host.business_name || ''; }
      else { stats.warnings.push(`Host ${sub.host_id} not found for HostPlatformSubscription ${sub.id}`); }

      const acctResult = await upsertSubscriptionAccount(base44, {
        ownerType: 'host',
        ownerId: host?.user_id || sub.host_id,
        ownerEmail,
        ownerName,
        hostId: sub.host_id,
        customerUserId: '',
        stripeCustomerId: sub.stripe_customer_id || '',
        dryRun,
      });
      if (acctResult.action === 'created' || acctResult.action === 'would_create') stats.created_accounts++;
      else stats.updated_accounts++;

      const itemResult = await upsertSubscriptionItem(base44, {
        accountId: acctResult.id,
        itemType: 'host_platform',
        sourcEntity: 'HostPlatformSubscription',
        sourceEntityId: sub.id,
        dryRun,
        payload: {
          owner_type: 'host',
          owner_id: host?.user_id || sub.host_id,
          host_id: sub.host_id,
          customer_user_id: sub.user_id || '',
          item_name: `uRide ${(sub.plan_mode || 'host_platform').replace(/_/g, ' ')}`,
          stripe_subscription_id: sub.stripe_subscription_id || '',
          stripe_price_id: sub.stripe_price_id || '',
          monthly_amount: sub.monthly_amount || 0,
          quantity: 1,
          status: sub.status || 'active',
          payment_status: sub.last_payment_status === 'paid' ? 'paid' : sub.last_payment_status === 'failed' ? 'failed' : 'paid',
          current_period_start: sub.current_period_start || null,
          current_period_end: sub.current_period_end || null,
          next_billing_date: sub.current_period_end || null,
          plan_code: sub.plan_mode || '',
          metadata: { billing_route: sub.billing_route, operator_plan_id: sub.operator_plan_id },
        },
      });
      if (itemResult.action === 'created' || itemResult.action === 'would_create') stats.created_items++;
      else stats.updated_items++;

      await recalculateAccountHealth(base44, acctResult.id, dryRun);
    }

    // ── 2. Migrate GPSSubscription ────────────────────────────────────────────
    const gpsSubs = host_id_filter
      ? await base44.asServiceRole.entities.GPSSubscription.filter({ host_id: host_id_filter }, '-updated_date', limit)
      : await base44.asServiceRole.entities.GPSSubscription.list('-updated_date', limit);

    for (const sub of gpsSubs) {
      const ownerEmail = sub.customer_email || '';
      const ownerName = sub.customer_name || '';
      const isHost = !!sub.host_id;

      const acctResult = await upsertSubscriptionAccount(base44, {
        ownerType: isHost ? 'host' : 'customer',
        ownerId: sub.customer_user_id || sub.host_id || '',
        ownerEmail,
        ownerName,
        hostId: sub.host_id || '',
        customerUserId: sub.customer_user_id || '',
        stripeCustomerId: sub.stripe_customer_id || '',
        dryRun,
      });
      if (acctResult.action === 'created' || acctResult.action === 'would_create') stats.created_accounts++;
      else stats.updated_accounts++;

      const itemResult = await upsertSubscriptionItem(base44, {
        accountId: acctResult.id,
        itemType: 'contactless360_gps',
        sourcEntity: 'GPSSubscription',
        sourceEntityId: sub.id,
        dryRun,
        payload: {
          owner_type: isHost ? 'host' : 'customer',
          owner_id: sub.customer_user_id || '',
          host_id: sub.host_id || '',
          customer_user_id: sub.customer_user_id || '',
          item_name: sub.plan_name || 'Contactless360 GPS',
          stripe_subscription_id: sub.stripe_subscription_id || '',
          monthly_amount: sub.monthly_price || 0,
          quantity: 1,
          status: sub.subscription_status || 'active',
          payment_status: sub.payment_status || 'paid',
          current_period_start: sub.current_period_start || null,
          current_period_end: sub.current_period_end || null,
          next_billing_date: sub.current_period_end || null,
          device_id: sub.device_id || '',
          gps_order_id: sub.order_id || '',
          metadata: {},
        },
      });
      if (itemResult.action === 'created' || itemResult.action === 'would_create') stats.created_items++;
      else stats.updated_items++;

      await recalculateAccountHealth(base44, acctResult.id, dryRun);
    }

    return Response.json({
      ok: true,
      ...stats,
      host_platform_subs_processed: hostSubs.length,
      gps_subs_processed: gpsSubs.length,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[migrateSubscriptionsToUnified]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});