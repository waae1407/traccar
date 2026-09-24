import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import Stripe from 'npm:stripe@14.21.0';

const TRIAL_MONTHLY_PRICE = 14.99;
const PLAN_NAME = 'Contactless360 GPS Monthly';

/**
 * activateGPSTrial — In-context GPS subscription activation.
 *
 * action: 'prepare'  → Creates Stripe SetupIntent, returns client_secret for Stripe Elements
 * action: 'confirm'  → Takes payment_method_id, creates Stripe subscription, activates GPSSubscription
 *
 * Works for both:
 *   - Converting an existing trialing subscription to paid
 *   - Creating a new subscription from scratch (no prior trial)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { device_id, action, payment_method_id, stripe_customer_id } = await req.json();
    if (!device_id) return Response.json({ error: 'device_id is required' }, { status: 400 });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    // Load device
    let device = null;
    try {
      const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: device_id }, '-created_date', 1);
      device = devices[0];
    } catch (_) { /* invalid ID format */ }
    if (!device) return Response.json({ error: 'Device not found' }, { status: 404 });

    // Find existing subscription for this device
    const existingSubs = await base44.asServiceRole.entities.GPSSubscription.filter({ device_id }, '-created_date', 5);
    let sub = existingSubs.find(s => ['trialing', 'active', 'past_due', 'control_disabled'].includes(s.subscription_status)) || existingSubs[0];

    // ── PREPARE: Create SetupIntent for payment collection ──
    if (action === 'prepare') {
      let stripeCustomerId = stripe_customer_id || sub?.stripe_customer_id || '';
      if (stripeCustomerId) {
        try {
          await stripe.customers.retrieve(stripeCustomerId);
        } catch {
          stripeCustomerId = '';
        }
      }
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.full_name,
          metadata: { user_id: user.id, device_id },
        });
        stripeCustomerId = customer.id;
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        automatic_payment_methods: { enabled: true },
      });

      return Response.json({
        client_secret: setupIntent.client_secret,
        setup_intent_id: setupIntent.id,
        stripe_customer_id: stripeCustomerId,
        publishable_key: Deno.env.get('STRIPE_PUBLISHABLE_KEY'),
      });
    }

    // ── CONFIRM: Create or reuse Stripe subscription with payment method ──
    if (action === 'confirm') {
      if (!payment_method_id) return Response.json({ error: 'payment_method_id is required for confirm' }, { status: 400 });

      let stripeCustomerId = stripe_customer_id || sub?.stripe_customer_id || '';
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.full_name,
          metadata: { user_id: user.id, device_id },
        });
        stripeCustomerId = customer.id;
      }

      // Attach payment method to customer
      try {
        await stripe.paymentMethods.attach(payment_method_id, { customer: stripeCustomerId });
        await stripe.customers.update(stripeCustomerId, { invoice_settings: { default_payment_method: payment_method_id } });
      } catch (_) { /* already attached is fine */ }

      // Reuse existing Stripe subscription if one already exists for this GPSSubscription
      let subscription;
      let price;
      if (sub?.stripe_subscription_id) {
        try {
          subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
          // Ensure the default payment method is updated on the existing subscription
          subscription = await stripe.subscriptions.update(sub.stripe_subscription_id, {
            default_payment_method: payment_method_id,
            metadata: {
              billing_context: 'gps_contactless_subscription',
              device_id,
              host_id: device.host_id || '',
              customer_user_id: user.id,
              customer_email: user.email,
              source: 'trial_activation',
            },
          });
        } catch (_) {
          subscription = null; // fall through to create
        }
      }
      if (!subscription) {
        // Reuse cached Stripe price if available, otherwise create and cache it
        const products = await base44.asServiceRole.entities.GPSProduct.filter({ package_type: 'device_subscription' });
        const product = products[0];
        let price;
        if (product?.stripe_price_id) {
          try { price = await stripe.prices.retrieve(product.stripe_price_id); } catch (_) { price = null; }
        }
        if (!price) {
          price = await stripe.prices.create({
            unit_amount: Math.round(TRIAL_MONTHLY_PRICE * 100),
            currency: 'usd',
            recurring: { interval: 'month' },
            product_data: {
              name: PLAN_NAME,
              metadata: { source: 'trial_activation' },
            },
          });
          if (product) {
            await base44.asServiceRole.entities.GPSProduct.update(product.id, { stripe_price_id: price.id }).catch(() => {});
          }
        }
        subscription = await stripe.subscriptions.create({
          customer: stripeCustomerId,
          items: [{ price: price.id }],
          payment_behavior: 'default_incomplete',
          payment_settings: { save_default_payment_method: 'on_subscription' },
          expand: ['latest_invoice.payment_intent'],
          metadata: {
            billing_context: 'gps_contactless_subscription',
            device_id,
            host_id: device.host_id || '',
            customer_user_id: user.id,
            customer_email: user.email,
            source: 'trial_activation',
          },
        });
      }

      const now = new Date().toISOString();
      const periodStart = subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : now;
      const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;
      const newStatus = subscription.status === 'active' ? 'active' : 'trialing';

      // Update or create GPSSubscription record
      if (sub) {
        await base44.asServiceRole.entities.GPSSubscription.update(sub.id, {
          subscription_status: newStatus,
          payment_status: subscription.status === 'active' ? 'paid' : 'pending',
          stripe_subscription_id: subscription.id,
          stripe_customer_id: stripeCustomerId,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          past_due_since: null,
          dunning_email_count: 0,
          control_disabled_at: null,
          reactivated_at: now,
        });
      } else {
        sub = await base44.asServiceRole.entities.GPSSubscription.create({
          customer_user_id: user.id,
          host_id: device.host_id || '',
          device_id,
          plan_name: PLAN_NAME,
          billing_cycle: 'monthly',
          monthly_price: TRIAL_MONTHLY_PRICE,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: stripeCustomerId,
          subscription_status: newStatus,
          payment_status: subscription.status === 'active' ? 'paid' : 'pending',
          current_period_start: periodStart,
          current_period_end: periodEnd,
          customer_email: user.email,
          customer_name: user.full_name || '',
        });
      }

      // Update device
      await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
        subscription_status: 'active',
        controls_enabled: true,
      });

      // Dual-write SubscriptionItem
      const idempKey = `GPSSubscription:${sub.id}`;
      const existingItems = await base44.asServiceRole.entities.SubscriptionItem.filter({ idempotency_key: idempKey }, '-updated_date', 1);
      let acctRecords = await base44.asServiceRole.entities.SubscriptionAccount.filter({ owner_email: user.email }, '-updated_date', 1);
      let accountId = acctRecords[0]?.id;
      if (!accountId) {
        const newAcct = await base44.asServiceRole.entities.SubscriptionAccount.create({
          owner_type: device.host_id ? 'host' : 'customer',
          owner_email: user.email,
          owner_name: user.full_name || '',
          owner_id: user.id,
          host_id: device.host_id || '',
          customer_user_id: user.id,
          stripe_customer_id: stripeCustomerId,
          health_score: 100,
          health_status: 'healthy',
          monthly_total: TRIAL_MONTHLY_PRICE,
          active_item_count: 1,
          past_due_item_count: 0,
          cancelled_item_count: 0,
          status: 'healthy',
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
        owner_type: device.host_id ? 'host' : 'customer',
        owner_id: user.id,
        host_id: device.host_id || '',
        customer_user_id: user.id,
        item_name: PLAN_NAME,
        stripe_subscription_id: subscription.id,
        monthly_amount: TRIAL_MONTHLY_PRICE,
        quantity: 1,
        status: subscription.status || 'active',
        payment_status: subscription.status === 'active' ? 'paid' : 'pending',
        current_period_start: periodStart,
        current_period_end: periodEnd,
        next_billing_date: periodEnd,
        device_id,
        updated_at: now,
      };
      if (existingItems[0]) {
        await base44.asServiceRole.entities.SubscriptionItem.update(existingItems[0].id, itemPayload);
      } else {
        await base44.asServiceRole.entities.SubscriptionItem.create({ ...itemPayload, created_at: now });
      }

      // Notify
      await base44.asServiceRole.entities.Notification.create({
        recipient_user_id: user.id,
        recipient_email: user.email,
        recipient_role: device.host_id ? 'host' : 'customer',
        title: '✅ GPS Subscription Activated',
        body: `Your Contactless360 GPS subscription ($${TRIAL_MONTHLY_PRICE}/mo) is now active. All features unlocked.`,
        type: 'success',
        category: 'subscriptions',
        severity: 'info',
        source_function: 'activateGPSTrial',
      }).catch(() => {});

      // Audit
      await base44.asServiceRole.entities.ActivityEvent.create({
        event_type: 'payment.succeeded',
        actor_id: user.id,
        actor_email: user.email,
        actor_role: device.host_id ? 'host' : 'customer',
        target_entity: 'GPSSubscription',
        target_id: sub.id,
        host_id: device.host_id || '',
        summary: `GPS trial activated: ${subscription.id} — $${TRIAL_MONTHLY_PRICE}/mo`,
        metadata: { stripe_subscription_id: subscription.id, device_id },
        source: device.host_id ? 'host_portal' : 'customer_app',
        event_status: 'success',
      }).catch(() => {});

      return Response.json({ success: true, subscription_id: sub.id, stripe_subscription_id: subscription.id, status: subscription.status });
    }

    return Response.json({ error: 'Invalid action. Use prepare or confirm.' }, { status: 400 });
  } catch (err) {
    console.error('[activateGPSTrial]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});