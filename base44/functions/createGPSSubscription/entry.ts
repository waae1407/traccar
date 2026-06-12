import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    const { order_id, device_id, monthly_price, plan_name, stripe_customer_id } = await req.json();

    if (!order_id || !monthly_price) {
      return Response.json({ error: 'order_id and monthly_price are required.' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    // Load the order
    const orders = await base44.asServiceRole.entities.GPSOrder.filter({ id: order_id });
    const order = orders[0];
    if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 });
    if (order.payment_status !== 'paid') return Response.json({ error: 'Order must be paid before creating subscription.' }, { status: 400 });

    // Get or create Stripe customer
    let stripeCustomerId = stripe_customer_id || order.stripe_customer_id || '';
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: order.customer_email,
        name: order.customer_name,
        metadata: {
          host_id: order.host_id || '',
          customer_user_id: order.customer_user_id || '',
          gps_order_id: order_id,
        },
      });
      stripeCustomerId = customer.id;
    }
    // Attach and set default payment method if available (from the original checkout PI)
    const paymentMethodId = order.stripe_payment_method_id || '';
    if (paymentMethodId && stripeCustomerId) {
      try {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
        await stripe.customers.update(stripeCustomerId, { invoice_settings: { default_payment_method: paymentMethodId } });
      } catch (_) { /* already attached is fine */ }
    }

    // Create Stripe price on the fly (inline)
    const price = await stripe.prices.create({
      unit_amount: Math.round(monthly_price * 100),
      currency: 'usd',
      recurring: { interval: 'month' },
      product_data: {
        name: plan_name || `Contactless360 GPS Subscription`,
        metadata: { package_type: order.package_type || '' },
      },
    });

    // Create subscription — use default_incomplete so it succeeds even without default PM attached yet
    // The webhook (invoice.payment_succeeded) will activate it once the payment method is confirmed
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: price.id }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        billing_context: 'gps_contactless_subscription',
        gps_order_id: order_id,
        device_id: device_id || '',
        host_id: order.host_id || '',
        customer_user_id: order.customer_user_id || '',
        customer_email: order.customer_email,
      },
    });

    // Create GPSSubscription record
    const sub = await base44.asServiceRole.entities.GPSSubscription.create({
      customer_user_id: order.customer_user_id || '',
      host_id: order.host_id || '',
      device_id: device_id || '',
      order_id,
      plan_name: plan_name || 'Contactless360 GPS',
      monthly_price,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: stripeCustomerId,
      subscription_status: subscription.status,
      payment_status: subscription.status === 'active' ? 'paid' : 'pending',
      current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
      current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
      cancel_at_period_end: false,
      customer_email: order.customer_email,
      customer_name: order.customer_name,
    });

    // Update order with stripe customer
    await base44.asServiceRole.entities.GPSOrder.update(order_id, {
      stripe_customer_id: stripeCustomerId,
    });

    // Dual-write: create/update unified SubscriptionItem
    const now = new Date().toISOString();
    const idempKey = `GPSSubscription:${sub.id}`;
    const existingItems = await base44.asServiceRole.entities.SubscriptionItem.filter({ idempotency_key: idempKey }, '-updated_date', 1);
    // Find or create SubscriptionAccount
    let acctRecords = order.customer_user_id
      ? await base44.asServiceRole.entities.SubscriptionAccount.filter({ customer_user_id: order.customer_user_id }, '-updated_date', 1)
      : [];
    if (!acctRecords.length) {
      acctRecords = await base44.asServiceRole.entities.SubscriptionAccount.filter({ owner_email: order.customer_email }, '-updated_date', 1);
    }
    let accountId = acctRecords[0]?.id;
    if (!accountId) {
      const newAcct = await base44.asServiceRole.entities.SubscriptionAccount.create({
        owner_type: order.host_id ? 'host' : 'customer',
        owner_email: order.customer_email,
        owner_name: order.customer_name || '',
        owner_id: order.customer_user_id || '',
        host_id: order.host_id || '',
        customer_user_id: order.customer_user_id || '',
        stripe_customer_id: stripeCustomerId,
        health_score: 100,
        health_status: 'healthy',
        monthly_total: monthly_price,
        active_item_count: 0,
        past_due_item_count: 0,
        cancelled_item_count: 0,
        status: 'no_payment_method',
        created_at: now,
        updated_at: now,
      });
      accountId = newAcct.id;
    }
    const itemPayload = {
      subscription_account_id: accountId,
      item_type: 'contactless360_gps',
      source_entity: 'GPSSubscription',
      source_entity_id: sub.id,
      idempotency_key: idempKey,
      owner_type: order.host_id ? 'host' : 'customer',
      owner_id: order.customer_user_id || '',
      host_id: order.host_id || '',
      customer_user_id: order.customer_user_id || '',
      item_name: plan_name || 'Contactless360 GPS',
      stripe_subscription_id: subscription.id,
      monthly_amount: monthly_price,
      quantity: 1,
      status: subscription.status || 'incomplete',
      payment_status: subscription.status === 'active' ? 'paid' : 'pending',
      current_period_start: sub.current_period_start || null,
      current_period_end: sub.current_period_end || null,
      next_billing_date: sub.current_period_end || null,
      device_id: device_id || '',
      gps_order_id: order_id,
      updated_at: now,
    };
    if (existingItems[0]) {
      await base44.asServiceRole.entities.SubscriptionItem.update(existingItems[0].id, itemPayload);
    } else {
      await base44.asServiceRole.entities.SubscriptionItem.create({ ...itemPayload, created_at: now });
    }

    // Notify
    await base44.asServiceRole.entities.Notification.create({
      user_email: order.customer_email,
      title: '✅ GPS Subscription Active',
      body: `Your Contactless360 GPS subscription ($${monthly_price}/mo) is now active. Device tracking is live.`,
      type: 'system',
    }).catch(() => {});

    // Audit log
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'payment.succeeded',
      actor_id: order.customer_user_id || 'system',
      actor_email: order.customer_email,
      actor_role: 'system',
      target_entity: 'GPSSubscription',
      target_id: sub.id,
      host_id: order.host_id || '',
      summary: `GPS subscription created: ${subscription.id} — $${monthly_price}/mo`,
      metadata: { stripe_subscription_id: subscription.id, order_id, device_id: device_id || '' },
      source: 'system',
      event_status: 'success',
    }).catch(() => {});

    return Response.json({ success: true, subscription_id: sub.id, stripe_subscription_id: subscription.id, status: subscription.status });
  } catch (err) {
    console.error('[createGPSSubscription]', err.message);
    return Response.json({ error: err.message, subscription_failed: true }, { status: 500 });
  }
});