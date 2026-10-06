import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import Stripe from 'npm:stripe@14.21.0';

const TRIAL_DAYS = 90;
const TRIAL_REMINDER_DAYS_BEFORE = 14;
const MONTHLY_PRICE = 14.99;
const PLAN_NAME = 'Contactless360 GPS Monthly';
const DEVICE_FEE = 100;
const RETURN_WINDOW_DAYS = 14;

/**
 * startGPSTrial — 90-day free GPS trial signup.
 *
 * Flow:
 *   1. Collect shipping info + card on file (SetupIntent, $0 auth)
 *   2. Create GPSOrder ($0, is_trial_order=true)
 *   3. Create Stripe subscription with trial_period_days=90
 *   4. Create GPSSubscription in 'trialing' state
 *
 * No charge during trial. Subscription auto-activates at day 90 unless canceled.
 * Cancel anytime → 14-day return window → $100 device fee if not returned.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Sign in required to start your free trial.' }, { status: 401 });

    const {
      customer_name,
      customer_email,
      customer_phone,
      shipping_address,
      billing_address,
      vehicle_use_type = 'personal',
      payment_method_id,
      stripe_customer_id,
    } = await req.json();

    if (!customer_name || !customer_email || !shipping_address) {
      return Response.json({ error: 'Name, email, and shipping address are required.' }, { status: 400 });
    }
    if (!payment_method_id) {
      return Response.json({ error: 'Payment method is required to start your free trial.' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    // ── 1. Get or create Stripe customer ──
    let stripeCustomerId = stripe_customer_id || '';
    if (stripeCustomerId) {
      try {
        await stripe.customers.retrieve(stripeCustomerId);
      } catch {
        stripeCustomerId = '';
      }
    }
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: customer_email.toLowerCase().trim(),
        name: customer_name,
        metadata: {
          user_id: user.id,
          trial_signup: 'true',
        },
      });
      stripeCustomerId = customer.id;
    }

    // ── 2. Attach payment method to customer ──
    try {
      await stripe.paymentMethods.attach(payment_method_id, { customer: stripeCustomerId });
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: payment_method_id },
      });
    } catch (_) { /* already attached is fine */ }

    // ── Stock check (trial ships 1 device) ──
    const trialProducts = await base44.asServiceRole.entities.GPSProduct.filter({ package_type: 'device_subscription' });
    const trialProduct = trialProducts[0];
    if (trialProduct && typeof trialProduct.inventory_count === 'number' && trialProduct.inventory_count < 1) {
      return Response.json({ error: 'Out of stock — GPS devices are temporarily unavailable. Please check back soon.', error_code: 'OUT_OF_STOCK' }, { status: 409 });
    }

    // ── 3. Create GPSOrder ($0, trial order) ──
    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const orderNum = `C360-TRIAL-${Date.now().toString(36).toUpperCase()}`;

    const order = await base44.asServiceRole.entities.GPSOrder.create({
      order_number: orderNum,
      customer_name,
      customer_email: customer_email.toLowerCase().trim(),
      customer_phone: customer_phone || '',
      shipping_address,
      billing_address: billing_address || shipping_address,
      package_type: 'device_subscription',
      quantity: 1,
      msrp_unit_price: 0,
      sale_unit_price: 0,
      unit_price: 0,
      discount_amount_per_unit: 0,
      total_discount_amount: 0,
      subtotal: 0,
      shipping_amount: 0,
      total_amount: 0,
      vehicle_use_type,
      payment_status: 'paid',
      order_status: 'processing',
      activation_status: 'not_started',
      customer_user_id: user.id,
      order_owner_type: 'customer',
      device_ids: [],
      refund_status: 'none',
      refund_amount: 0,
      monthly_subscription_price: MONTHLY_PRICE,
      is_trial_order: true,
      trial_end_at: trialEnd.toISOString(),
      stripe_customer_id: stripeCustomerId,
      stripe_payment_method_id: payment_method_id,
      paid_at: now.toISOString(),
    });

    // ── Decrement inventory (trial ships 1 device) ──
    if (trialProduct && typeof trialProduct.inventory_count === 'number') {
      await base44.asServiceRole.entities.GPSProduct.update(trialProduct.id, {
        inventory_count: Math.max(0, trialProduct.inventory_count - 1),
      }).catch(() => {});
    }

    // ── 4. Get or create Stripe Price (cached on GPSProduct) ──
    const products = await base44.asServiceRole.entities.GPSProduct.filter({ package_type: 'device_subscription' });
    const product = products[0];
    let price;
    if (product?.stripe_price_id) {
      try { price = await stripe.prices.retrieve(product.stripe_price_id); } catch (_) { price = null; }
    }
    if (!price) {
      price = await stripe.prices.create({
        unit_amount: Math.round(MONTHLY_PRICE * 100),
        currency: 'usd',
        recurring: { interval: 'month' },
        product_data: {
          name: PLAN_NAME,
          metadata: { source: 'trial_signup' },
        },
      });
      if (product) {
        await base44.asServiceRole.entities.GPSProduct.update(product.id, { stripe_price_id: price.id }).catch(() => {});
      }
    }

    // ── 5. Create Stripe subscription with 90-day trial ──
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: price.id }],
      trial_period_days: TRIAL_DAYS,
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      metadata: {
        billing_context: 'gps_contactless_trial',
        gps_order_id: order.id,
        customer_user_id: user.id,
        customer_email: customer_email.toLowerCase().trim(),
        trial_days: String(TRIAL_DAYS),
        device_fee: String(DEVICE_FEE),
        return_window_days: String(RETURN_WINDOW_DAYS),
      },
    });

    // ── 6. Create GPSSubscription record ──
    const periodStart = subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : now.toISOString();
    const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : trialEnd.toISOString();

    const sub = await base44.asServiceRole.entities.GPSSubscription.create({
      customer_user_id: user.id,
      host_id: '',
      device_id: '',
      order_id: order.id,
      plan_name: PLAN_NAME,
      billing_cycle: 'monthly',
      monthly_price: MONTHLY_PRICE,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: stripeCustomerId,
      stripe_payment_method_id: payment_method_id,
      subscription_status: 'trialing',
      payment_status: 'pending',
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      customer_email: customer_email.toLowerCase().trim(),
      customer_name: customer_name,
      trial_started_at: now.toISOString(),
      trial_end_at: trialEnd.toISOString(),
      device_fee_amount: DEVICE_FEE,
    });

    // ── 7. Dual-write SubscriptionItem ──
    const idempKey = `GPSSubscription:${sub.id}`;
    const acctRecords = await base44.asServiceRole.entities.SubscriptionAccount.filter({ owner_email: customer_email.toLowerCase().trim() }, '-updated_date', 1);
    let accountId = acctRecords[0]?.id;
    if (!accountId) {
      const newAcct = await base44.asServiceRole.entities.SubscriptionAccount.create({
        owner_type: 'customer',
        owner_email: customer_email.toLowerCase().trim(),
        owner_name: customer_name,
        owner_id: user.id,
        customer_user_id: user.id,
        stripe_customer_id: stripeCustomerId,
        health_score: 100,
        health_status: 'healthy',
        monthly_total: MONTHLY_PRICE,
        active_item_count: 1,
        past_due_item_count: 0,
        cancelled_item_count: 0,
        status: 'trialing',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
      accountId = newAcct.id;
    }
    const existingItems = await base44.asServiceRole.entities.SubscriptionItem.filter({ idempotency_key: idempKey }, '-updated_date', 1);
    const itemPayload = {
      subscription_account_id: accountId,
      item_type: 'contactless360_gps',
      source_entity: 'GPSSubscription',
      source_entity_id: sub.id,
      idempotency_key: idempKey,
      owner_type: 'customer',
      owner_id: user.id,
      customer_user_id: user.id,
      item_name: PLAN_NAME,
      stripe_subscription_id: subscription.id,
      monthly_amount: MONTHLY_PRICE,
      quantity: 1,
      status: 'trialing',
      payment_status: 'pending',
      current_period_start: periodStart,
      current_period_end: periodEnd,
      next_billing_date: periodEnd,
      updated_at: now.toISOString(),
    };
    if (existingItems[0]) {
      await base44.asServiceRole.entities.SubscriptionItem.update(existingItems[0].id, itemPayload);
    } else {
      await base44.asServiceRole.entities.SubscriptionItem.create({ ...itemPayload, created_at: now.toISOString() });
    }

    // ── 8. Welcome email ──
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: customer_email.toLowerCase().trim(),
        subject: '🎉 Your Contactless360 Free Trial Has Started!',
        body: `Hi ${customer_name},\n\nWelcome to Contactless360! Your 90-day free trial has started.\n\nHere's what happens next:\n• Your GPS device ships FREE within 1-2 business days\n• Full GPS tracking, alerts, and remote controls — all included\n• Your subscription of $${MONTHLY_PRICE}/mo starts automatically on ${trialEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}\n• Cancel anytime — if you cancel, return the device within 14 days (prepaid label provided) or a $${DEVICE_FEE} device fee applies\n\nNo charges during your trial. You're in control.\n\nQuestions? Just reply to this email.\n\nThe Contactless360 Team`,
        from_name: 'Contactless360 GPS',
      });
    } catch (e) {
      console.error('[startGPSTrial] welcome email failed:', e.message);
    }

    // ── 9. Audit ──
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'payment.submitted',
      actor_id: user.id,
      actor_email: customer_email.toLowerCase().trim(),
      actor_role: 'customer',
      target_entity: 'GPSOrder',
      target_id: order.id,
      target_label: orderNum,
      summary: `GPS trial started: ${orderNum} — 90-day free trial, $${MONTHLY_PRICE}/mo after`,
      metadata: {
        order_id: order.id,
        subscription_id: sub.id,
        stripe_subscription_id: subscription.id,
        trial_days: TRIAL_DAYS,
        trial_end: trialEnd.toISOString(),
        device_fee: DEVICE_FEE,
      },
      source: 'customer_app',
      event_status: 'success',
    }).catch(() => {});

    await base44.asServiceRole.entities.Notification.create({
      recipient_user_id: user.id,
      recipient_email: customer_email.toLowerCase().trim(),
      recipient_role: 'customer',
      title: '🎉 Free Trial Started — Device Shipping Soon',
      body: `Your 90-day Contactless360 free trial has started. Your device ships free within 1-2 business days. Subscription of $${MONTHLY_PRICE}/mo starts ${trialEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Cancel anytime.`,
      type: 'success',
      category: 'subscriptions',
      severity: 'info',
      source_function: 'startGPSTrial',
    }).catch(() => {});

    // ── 10. Notify all admins of new trial signup ──
    try {
      const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 100);
      const admins = allUsers.filter(u => u.role === 'admin');
      for (const admin of admins) {
        await base44.asServiceRole.entities.Notification.create({
          recipient_user_id: admin.id,
          recipient_email: admin.email,
          recipient_role: 'admin',
          title: '🎉 New GPS Trial Signup',
          body: `${customer_name} (${customer_email}) started a 90-day free trial. Order: ${orderNum}. $${MONTHLY_PRICE}/mo starts ${trialEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Ship to: ${shipping_address || 'N/A'}.`,
          type: 'success',
          category: 'subscriptions',
          severity: 'info',
          source_function: 'startGPSTrial',
          related_entity_type: 'GPSOrder',
          related_entity_id: order.id,
          metadata: { order_id: order.id, subscription_id: sub.id, customer_email },
        }).catch(() => {});
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: admin.email,
          subject: `🎉 New GPS Trial Signup — ${orderNum}`,
          body: `A new 90-day free trial has started and a device needs to be shipped.\n\nOrder: ${orderNum}\nCustomer: ${customer_name} (${customer_email})\nShip to: ${shipping_address || 'N/A'}\nSubscription: $${MONTHLY_PRICE}/mo starts ${trialEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}\n\nMark it shipped in the admin GPS Store once dispatched.`,
          from_name: 'Contactless360 GPS',
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[startGPSTrial] admin notification failed:', e.message);
    }

    return Response.json({
      success: true,
      order_id: order.id,
      order_number: orderNum,
      subscription_id: sub.id,
      stripe_subscription_id: subscription.id,
      trial_end: trialEnd.toISOString(),
      trial_days: TRIAL_DAYS,
      monthly_price: MONTHLY_PRICE,
      device_fee: DEVICE_FEE,
    });
  } catch (err) {
    console.error('[startGPSTrial]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});