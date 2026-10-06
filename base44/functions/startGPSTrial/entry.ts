import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import Stripe from 'npm:stripe@14.21.0';

const TRIAL_DAYS = 30;
const MONTHLY_PRICE = 14.99;
const PLAN_NAME = 'Contactless360 GPS Monthly';
const DEVICE_FEE = 100;
const RETURN_WINDOW_DAYS = 14;

/**
 * startGPSTrial — 30-day free GPS trial signup.
 *
 * NEW FLOW (backorder-aware):
 *   1. Collect shipping info + card on file (SetupIntent, $0 auth)
 *   2. Create GPSOrder ($0, is_trial_order=true) — allows inventory_count=0 (backorder)
 *   3. Create GPSSubscription in 'pending_activation' state (NOT trialing)
 *   4. Do NOT create Stripe subscription yet — card is on file only
 *   5. Trial clock does NOT start here — it starts when the device goes online
 *
 * The Stripe subscription is created later by activatePendingTrials when the
 * device first reports online (or as a fallback when the activation deadline passes).
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
      backorder_acknowledged = false,
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

    // ── Stock check — allow backorder for trials ──
    const trialProducts = await base44.asServiceRole.entities.GPSProduct.filter({ package_type: 'device_subscription' });
    const trialProduct = trialProducts[0];
    const stockAvailable = trialProduct && typeof trialProduct.inventory_count === 'number' && trialProduct.inventory_count >= 1;
    const isBackordered = !stockAvailable;

    // If backordered, customer must have acknowledged the backorder terms
    if (isBackordered && !backorder_acknowledged) {
      return Response.json({
        error: 'This product is currently backordered. You must acknowledge the backorder terms to proceed.',
        error_code: 'BACKORDER_ACKNOWLEDGEMENT_REQUIRED',
      }, { status: 400 });
    }

    // ── 3. Create GPSOrder ($0, trial order) ──
    const now = new Date();
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
      order_status: isBackordered ? 'processing' : 'processing',
      activation_status: 'not_started',
      customer_user_id: user.id,
      order_owner_type: 'customer',
      device_ids: [],
      refund_status: 'none',
      refund_amount: 0,
      monthly_subscription_price: MONTHLY_PRICE,
      is_trial_order: true,
      is_backordered: isBackordered,
      backorder_acknowledged_at: isBackordered ? now.toISOString() : undefined,
      stripe_customer_id: stripeCustomerId,
      stripe_payment_method_id: payment_method_id,
      paid_at: now.toISOString(),
    });

    // ── Decrement inventory only if in stock (backorder decrements at ship time) ──
    if (stockAvailable) {
      await base44.asServiceRole.entities.GPSProduct.update(trialProduct.id, {
        inventory_count: Math.max(0, trialProduct.inventory_count - 1),
      }).catch(() => {});
    }

    // ── 4. Create GPSSubscription in 'pending_activation' state ──
    // No Stripe subscription yet — created when device comes online.
    // trial_started_at and trial_end_at are intentionally NOT set.
    const sub = await base44.asServiceRole.entities.GPSSubscription.create({
      customer_user_id: user.id,
      host_id: '',
      device_id: '',
      order_id: order.id,
      plan_name: PLAN_NAME,
      billing_cycle: 'monthly',
      monthly_price: MONTHLY_PRICE,
      stripe_subscription_id: '',
      stripe_customer_id: stripeCustomerId,
      stripe_payment_method_id: payment_method_id,
      subscription_status: 'pending_activation',
      payment_status: 'pending',
      current_period_start: now.toISOString(),
      current_period_end: '',
      cancel_at_period_end: false,
      customer_email: customer_email.toLowerCase().trim(),
      customer_name: customer_name,
      device_fee_amount: DEVICE_FEE,
      is_backordered: isBackordered,
    });

    // ── 5. Dual-write SubscriptionItem ──
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
        monthly_total: 0,
        active_item_count: 0,
        past_due_item_count: 0,
        cancelled_item_count: 0,
        status: 'pending_activation',
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
      stripe_subscription_id: '',
      monthly_amount: MONTHLY_PRICE,
      quantity: 1,
      status: 'pending_activation',
      payment_status: 'pending',
      current_period_start: now.toISOString(),
      current_period_end: '',
      next_billing_date: '',
      updated_at: now.toISOString(),
    };
    if (existingItems[0]) {
      await base44.asServiceRole.entities.SubscriptionItem.update(existingItems[0].id, itemPayload);
    } else {
      await base44.asServiceRole.entities.SubscriptionItem.create({ ...itemPayload, created_at: now.toISOString() });
    }

    // ── 6. Welcome email ──
    const shippingTimeframe = isBackordered ? 'approximately 2 weeks (backorder)' : '1-2 business days';
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: customer_email.toLowerCase().trim(),
        subject: '🎉 Your Contactless360 Trial Is Confirmed!',
        body: `Hi ${customer_name},\n\nWelcome to Contactless360! Your free trial is confirmed.\n\nHere's what happens next:\n• Your GPS device ships FREE within ${shippingTimeframe}\n• Your 30-day free trial starts automatically the moment your device goes online for the first time\n• Full GPS tracking, alerts, and remote controls — all included\n• After your 30-day trial, your subscription of $${MONTHLY_PRICE}/mo starts automatically\n• Cancel anytime — if you cancel, return the device within ${RETURN_WINDOW_DAYS} days (prepaid label provided) or a $${DEVICE_FEE} device fee applies\n\nNo charges during your trial. You're in control.\n\nQuestions? Just reply to this email.\n\nThe Contactless360 Team`,
        from_name: 'Contactless360 GPS',
      });
    } catch (e) {
      console.error('[startGPSTrial] welcome email failed:', e.message);
    }

    // ── 7. Audit ──
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'payment.submitted',
      actor_id: user.id,
      actor_email: customer_email.toLowerCase().trim(),
      actor_role: 'customer',
      target_entity: 'GPSOrder',
      target_id: order.id,
      target_label: orderNum,
      summary: `GPS trial signup: ${orderNum} — pending activation, ${isBackordered ? 'BACKORDERED' : 'in stock'}, trial starts when device goes online`,
      metadata: {
        order_id: order.id,
        subscription_id: sub.id,
        trial_days: TRIAL_DAYS,
        device_fee: DEVICE_FEE,
        is_backordered: isBackordered,
      },
      source: 'customer_app',
      event_status: 'success',
    }).catch(() => {});

    await base44.asServiceRole.entities.Notification.create({
      recipient_user_id: user.id,
      recipient_email: customer_email.toLowerCase().trim(),
      recipient_role: 'customer',
      title: '🎉 Trial Confirmed — Device Shipping Soon',
      body: `Your Contactless360 trial is confirmed. Your device ships within ${shippingTimeframe}. Your 30-day trial starts automatically when your device goes online. $${MONTHLY_PRICE}/mo after trial. Cancel anytime.`,
      type: 'success',
      category: 'subscriptions',
      severity: 'info',
      source_function: 'startGPSTrial',
    }).catch(() => {});

    // ── 8. Notify all admins of new trial signup ──
    try {
      const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 100);
      const admins = allUsers.filter(u => u.role === 'admin');
      for (const admin of admins) {
        await base44.asServiceRole.entities.Notification.create({
          recipient_user_id: admin.id,
          recipient_email: admin.email,
          recipient_role: 'admin',
          title: `🎉 New GPS Trial Signup${isBackordered ? ' (BACKORDER)' : ''}`,
          body: `${customer_name} (${customer_email}) signed up for a 30-day free trial. Order: ${orderNum}. ${isBackordered ? 'BACKORDERED — ship when restocked.' : 'In stock — ship within 1-2 days.'} Trial starts when device goes online. Ship to: ${shipping_address || 'N/A'}.`,
          type: 'success',
          category: 'subscriptions',
          severity: isBackordered ? 'warning' : 'info',
          source_function: 'startGPSTrial',
          related_entity_type: 'GPSOrder',
          related_entity_id: order.id,
          metadata: { order_id: order.id, subscription_id: sub.id, customer_email, is_backordered: isBackordered },
        }).catch(() => {});
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: admin.email,
          subject: `🎉 New GPS Trial Signup — ${orderNum}${isBackordered ? ' [BACKORDER]' : ''}`,
          body: `A new 30-day free trial signup needs a device shipment.\n\nOrder: ${orderNum}\nCustomer: ${customer_name} (${customer_email})\nShip to: ${shipping_address || 'N/A'}\n${isBackordered ? 'STATUS: BACKORDERED — ship when inventory is restocked.\n' : 'STATUS: In stock — ship within 1-2 business days.\n'}Trial starts when device goes online. $${MONTHLY_PRICE}/mo after 30-day trial.\n\nMark it shipped in the admin GPS Store once dispatched.`,
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
      trial_days: TRIAL_DAYS,
      monthly_price: MONTHLY_PRICE,
      device_fee: DEVICE_FEE,
      is_backordered: isBackordered,
      message: isBackordered
        ? 'Trial confirmed. Device ships in ~2 weeks. Trial starts when device goes online.'
        : 'Trial confirmed. Device ships in 1-2 business days. Trial starts when device goes online.',
    });
  } catch (err) {
    console.error('[startGPSTrial]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});