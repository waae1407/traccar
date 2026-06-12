import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

/**
 * Canonical Stripe Customer Resolver.
 * Ensures one Stripe customer per paying identity — prevents fragmentation.
 *
 * Input: { owner_type, owner_email, owner_name, host_id, customer_user_id }
 * Output: { stripe_customer_id, subscription_account_id, is_new }
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    const { owner_type = 'customer', owner_email, owner_name, host_id, customer_user_id, metadata = {} } = await req.json();
    if (!owner_email) return Response.json({ error: 'owner_email is required' }, { status: 400 });

    const now = new Date().toISOString();

    // ── Step 1: Check SubscriptionAccount ────────────────────────────────────
    let acctRecords = [];
    if (owner_type === 'host' && host_id) {
      acctRecords = await base44.asServiceRole.entities.SubscriptionAccount.filter({ host_id }, '-updated_date', 1);
    } else if (customer_user_id) {
      acctRecords = await base44.asServiceRole.entities.SubscriptionAccount.filter({ customer_user_id }, '-updated_date', 1);
    }
    if (!acctRecords.length) {
      acctRecords = await base44.asServiceRole.entities.SubscriptionAccount.filter({ owner_email }, '-updated_date', 1);
    }

    const existingAccount = acctRecords[0];
    if (existingAccount?.stripe_customer_id) {
      return Response.json({ stripe_customer_id: existingAccount.stripe_customer_id, subscription_account_id: existingAccount.id, is_new: false });
    }

    // ── Step 2: Check legacy entities ────────────────────────────────────────
    let stripeCustomerId = '';

    if (owner_type === 'host' && host_id) {
      const hostSubs = await base44.asServiceRole.entities.HostPlatformSubscription.filter({ host_id }, '-updated_date', 1);
      if (hostSubs[0]?.stripe_customer_id) stripeCustomerId = hostSubs[0].stripe_customer_id;
    }

    if (!stripeCustomerId) {
      const gpsOrders = await base44.asServiceRole.entities.GPSOrder.filter({ customer_email: owner_email }, '-updated_date', 1);
      if (gpsOrders[0]?.stripe_customer_id) stripeCustomerId = gpsOrders[0].stripe_customer_id;
    }

    // ── Step 3: Search Stripe by email ────────────────────────────────────────
    if (!stripeCustomerId) {
      const search = await stripe.customers.list({ email: owner_email, limit: 1 });
      if (search.data[0]) stripeCustomerId = search.data[0].id;
    }

    // ── Step 4: Create new Stripe customer ────────────────────────────────────
    let isNew = false;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: owner_email,
        name: owner_name || owner_email,
        metadata: {
          owner_type,
          host_id: host_id || '',
          customer_user_id: customer_user_id || '',
          ...metadata,
        },
      });
      stripeCustomerId = customer.id;
      isNew = true;
    }

    // ── Step 5: Persist to SubscriptionAccount ────────────────────────────────
    const accountPayload = {
      owner_type,
      owner_email,
      owner_name: owner_name || '',
      host_id: host_id || '',
      customer_user_id: customer_user_id || '',
      stripe_customer_id: stripeCustomerId,
      updated_at: now,
    };

    let accountId;
    if (existingAccount) {
      await base44.asServiceRole.entities.SubscriptionAccount.update(existingAccount.id, accountPayload);
      accountId = existingAccount.id;
    } else {
      const created = await base44.asServiceRole.entities.SubscriptionAccount.create({
        ...accountPayload,
        created_at: now,
        health_score: 100,
        health_status: 'healthy',
        monthly_total: 0,
        active_item_count: 0,
        past_due_item_count: 0,
        cancelled_item_count: 0,
        status: 'no_payment_method',
      });
      accountId = created.id;
    }

    return Response.json({ stripe_customer_id: stripeCustomerId, subscription_account_id: accountId, is_new: isNew });
  } catch (err) {
    console.error('[getOrCreateStripeCustomerForOwner]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});