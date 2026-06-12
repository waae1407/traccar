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

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: price.id }],
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