import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import Stripe from 'npm:stripe@14.21.0';

const TRIAL_DAYS = 90;
const MONTHLY_PRICE = 14.99;
const PLAN_NAME = 'Contactless360 GPS Monthly';
const DEVICE_FEE = 100;
const RETURN_WINDOW_DAYS = 14;

/**
 * activatePendingTrials — Starts 90-day trials for pending_activation subscriptions.
 *
 * Two triggers:
 *   1. Device online: A pending_activation subscription with a linked device that has
 *      reported online (online_status='online', last_seen_at within 24h). Trial starts NOW.
 *   2. Fallback: A pending_activation subscription past its trial_activation_deadline
 *      (shipped_at + 21 days). Trial starts from shipped_at to avoid infinite free ride.
 *
 * For each match: creates the Stripe subscription with trial_period_days=90, sets
 * trial_started_at/trial_end_at, updates GPSSubscription to 'trialing', and notifies
 * the customer.
 *
 * Triggered by: cron (every 15 min) or admin.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const cronSecret = url.searchParams.get('secret');
    const isCron = cronSecret === Deno.env.get('CRON_SECRET');

    if (!isCron) {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const now = new Date();
    const results = {
      trials_started_device_online: 0,
      trials_started_fallback: 0,
      errors: [],
      skipped: [],
    };

    // ── Load all pending_activation subscriptions ──
    const pendingSubs = await base44.asServiceRole.entities.GPSSubscription.filter({
      subscription_status: 'pending_activation',
    }, '-created_date', 500);

    // ── Get or create cached Stripe Price ──
    let cachedPriceId = '';
    const products = await base44.asServiceRole.entities.GPSProduct.filter({ package_type: 'device_subscription' });
    const product = products[0];
    if (product?.stripe_price_id) {
      try {
        const priceCheck = await stripe.prices.retrieve(product.stripe_price_id);
        cachedPriceId = priceCheck.id;
      } catch (_) { /* recreate below */ }
    }
    if (!cachedPriceId) {
      const price = await stripe.prices.create({
        unit_amount: Math.round(MONTHLY_PRICE * 100),
        currency: 'usd',
        recurring: { interval: 'month' },
        product_data: {
          name: PLAN_NAME,
          metadata: { source: 'activatePendingTrials' },
        },
      });
      cachedPriceId = price.id;
      if (product) {
        await base44.asServiceRole.entities.GPSProduct.update(product.id, { stripe_price_id: price.id }).catch(() => {});
      }
    }

    for (const sub of pendingSubs) {
      try {
        // ── Must have a linked device to start via "device online" ──
        let device = null;
        if (sub.device_id) {
          const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: sub.device_id }, '-created_date', 1);
          device = devices[0];
        }

        // ── Check if device is online ──
        const deviceOnline = device && device.online_status === 'online' &&
          device.last_seen_at &&
          (now.getTime() - new Date(device.last_seen_at).getTime() < 24 * 60 * 60 * 1000);

        // ── Check fallback: past activation deadline ──
        let fallbackDue = false;
        let fallbackStartDate = null;
        if (sub.trial_activation_deadline && now.getTime() >= new Date(sub.trial_activation_deadline).getTime()) {
          fallbackDue = true;
          // Fallback starts from ship date if available, otherwise from deadline
          const orderSubs = await base44.asServiceRole.entities.GPSOrder.filter({ id: sub.order_id }, '-created_date', 1);
          const order = orderSubs[0];
          if (order?.shipped_at) {
            fallbackStartDate = new Date(order.shipped_at);
          } else {
            fallbackStartDate = new Date(sub.trial_activation_deadline);
          }
        }

        // ── Skip if neither condition met ──
        if (!deviceOnline && !fallbackDue) {
          results.skipped.push({ sub_id: sub.id, reason: 'not_eligible' });
          continue;
        }

        // ── Determine trial start ──
        const trialStart = deviceOnline ? now : fallbackStartDate;
        const trialEnd = new Date(trialStart.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
        const startSource = deviceOnline ? 'device_online' : 'fallback_ship_date';

        // ── Create Stripe subscription with 90-day trial ──
        let stripeSubscriptionId = '';
        if (sub.stripe_customer_id && sub.stripe_payment_method_id) {
          try {
            const subscription = await stripe.subscriptions.create({
              customer: sub.stripe_customer_id,
              items: [{ price: cachedPriceId }],
              trial_period_days: TRIAL_DAYS,
              payment_behavior: 'default_incomplete',
              payment_settings: {
                save_default_payment_method: 'on_subscription',
              },
              metadata: {
                billing_context: 'gps_contactless_trial',
                gps_subscription_id: sub.id,
                customer_user_id: sub.customer_user_id || '',
                customer_email: sub.customer_email,
                trial_days: String(TRIAL_DAYS),
                device_fee: String(DEVICE_FEE),
                return_window_days: String(RETURN_WINDOW_DAYS),
                trial_start_source: startSource,
              },
            });
            stripeSubscriptionId = subscription.id;

            // If fallback, the Stripe trial already started at signup time.
            // We need to adjust the Stripe trial_end to match our calculated trialEnd.
            if (fallbackDue && subscription.trial_end) {
              const stripeTrialEnd = subscription.trial_end * 1000;
              const desiredTrialEnd = trialEnd.getTime();
              if (Math.abs(stripeTrialEnd - desiredTrialEnd) > 60 * 1000) {
                try {
                  await stripe.subscriptions.update(subscription.id, {
                    trial_end: Math.floor(desiredTrialEnd / 1000),
                  });
                } catch (e) {
                  results.errors.push(`Stripe trial_end update for ${sub.customer_email}: ${e.message}`);
                }
              }
            }
          } catch (e) {
            results.errors.push(`Stripe subscription creation for ${sub.customer_email}: ${e.message}`);
            continue;
          }
        } else {
          results.errors.push(`Missing Stripe customer/payment method for ${sub.customer_email}`);
          continue;
        }

        // ── Update GPSSubscription ──
        await base44.asServiceRole.entities.GPSSubscription.update(sub.id, {
          subscription_status: 'trialing',
          trial_started_at: trialStart.toISOString(),
          trial_end_at: trialEnd.toISOString(),
          trial_start_source: startSource,
          device_first_online_at: deviceOnline ? now.toISOString() : (sub.device_first_online_at || undefined),
          stripe_subscription_id: stripeSubscriptionId,
          current_period_start: trialStart.toISOString(),
          current_period_end: trialEnd.toISOString(),
          payment_status: 'pending',
        });

        // ── Update GPSOrder trial_end_at ──
        if (sub.order_id) {
          await base44.asServiceRole.entities.GPSOrder.update(sub.order_id, {
            trial_end_at: trialEnd.toISOString(),
          }).catch(() => {});
        }

        // ── Update SubscriptionItem ──
        const idempKey = `GPSSubscription:${sub.id}`;
        const existingItems = await base44.asServiceRole.entities.SubscriptionItem.filter({ idempotency_key: idempKey }, '-updated_date', 1);
        if (existingItems[0]) {
          await base44.asServiceRole.entities.SubscriptionItem.update(existingItems[0].id, {
            status: 'trialing',
            stripe_subscription_id: stripeSubscriptionId,
            current_period_start: trialStart.toISOString(),
            current_period_end: trialEnd.toISOString(),
            next_billing_date: trialEnd.toISOString(),
            updated_at: now.toISOString(),
          }).catch(() => {});
        }

        // ── Update SubscriptionAccount ──
        const acctRecords = await base44.asServiceRole.entities.SubscriptionAccount.filter({ owner_email: sub.customer_email }, '-updated_date', 1);
        if (acctRecords[0]) {
          await base44.asServiceRole.entities.SubscriptionAccount.update(acctRecords[0].id, {
            status: 'trialing',
            monthly_total: MONTHLY_PRICE,
            active_item_count: 1,
            updated_at: now.toISOString(),
          }).catch(() => {});
        }

        // ── Notify customer ──
        const isFallback = startSource === 'fallback_ship_date';
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: sub.customer_email,
            subject: isFallback
              ? 'Your Contactless360 Trial Has Started'
              : '🎉 Your 90-Day Free Trial Has Started!',
            body: isFallback
              ? `Hi ${sub.customer_name || 'Customer'},\n\nYour Contactless360 90-day free trial has started.\n\nWe haven't detected your device coming online yet, but your trial has begun as of ${trialStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} so you don't lose any time.\n\nIf you haven't installed your device yet, please do so soon — you'll need it active to use your GPS tracking and remote controls.\n\nYour subscription of $${MONTHLY_PRICE}/mo starts automatically on ${trialEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.\n\nCancel anytime — return the device within ${RETURN_WINDOW_DAYS} days of cancellation (prepaid label provided) or a $${DEVICE_FEE} device fee applies.\n\nNeed help installing? Reply to this email.\n\nThe Contactless360 Team`
              : `Hi ${sub.customer_name || 'Customer'},\n\nGreat news — your Contactless360 device is online and your 90-day free trial has officially started!\n\nYour trial ends on ${trialEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. After that, your subscription of $${MONTHLY_PRICE}/mo starts automatically.\n\nCancel anytime — return the device within ${RETURN_WINDOW_DAYS} days of cancellation (prepaid label provided) or a $${DEVICE_FEE} device fee applies.\n\nEnjoy your GPS!\n\nThe Contactless360 Team`,
            from_name: 'Contactless360 GPS',
          });
        } catch (e) {
          results.errors.push(`Email to ${sub.customer_email}: ${e.message}`);
        }

        await base44.asServiceRole.entities.Notification.create({
          recipient_user_id: sub.customer_user_id,
          recipient_email: sub.customer_email,
          recipient_role: 'customer',
          title: isFallback ? 'Your Trial Has Started' : '🎉 Your 90-Day Trial Has Started!',
          body: isFallback
            ? `Your trial has started. We haven't detected your device online yet — install it soon. $${MONTHLY_PRICE}/mo starts ${trialEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
            : `Your device is online and your 90-day trial has started! Ends ${trialEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. $${MONTHLY_PRICE}/mo after. Cancel anytime.`,
          type: 'success',
          category: 'subscriptions',
          severity: 'info',
          source_function: 'activatePendingTrials',
          related_entity_type: 'GPSSubscription',
          related_entity_id: sub.id,
        }).catch(() => {});

        // ── Audit ──
        await base44.asServiceRole.entities.ActivityEvent.create({
          event_type: 'booking.active',
          actor_id: 'automation',
          actor_email: 'automation@contactless360.com',
          actor_role: 'automation',
          target_entity: 'GPSSubscription',
          target_id: sub.id,
          summary: `GPS trial started (${startSource}): ${sub.customer_email} — trial ends ${trialEnd.toISOString().split('T')[0]}`,
          metadata: {
            subscription_id: sub.id,
            stripe_subscription_id: stripeSubscriptionId,
            trial_started_at: trialStart.toISOString(),
            trial_end_at: trialEnd.toISOString(),
            start_source: startSource,
          },
          source: 'automation',
          event_status: 'success',
        }).catch(() => {});

        if (isFallback) {
          results.trials_started_fallback++;
        } else {
          results.trials_started_device_online++;
        }
      } catch (e) {
        results.errors.push(`Sub ${sub.id} (${sub.customer_email}): ${e.message}`);
      }
    }

    return Response.json({
      ok: true,
      ...results,
      total_started: results.trials_started_device_online + results.trials_started_fallback,
    });
  } catch (error) {
    console.error('[activatePendingTrials]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});