import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import Stripe from 'npm:stripe@14.21.0';

const TRIAL_REMINDER_DAYS_BEFORE = 14;
const RETURN_WINDOW_DAYS = 14;
const RETURN_WARNING_DAYS = 12;
const DEVICE_FEE = 100;
const MONTHLY_PRICE = 14.99;

/**
 * processGPSTrialLifecycle — Daily cron for 90-day trial lifecycle management.
 *
 * Handles:
 *   1. Trial-end reminder (14 days before trial ends → day 76)
 *   2. Trial expiry (day 90 → if not canceled, Stripe auto-charges; update status)
 *   3. Return window warning (day 12 of return window → "we haven't received it")
 *   4. Device fee charge (day 14 of return window → $100 if not returned)
 *
 * NOTE: pending_activation subscriptions are handled by activatePendingTrials (every 15 min).
 * This function only processes trialing and cancelled subscriptions.
 *
 * Triggered by: daily cron (CRON_SECRET) or admin.
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
      trial_reminders_sent: 0,
      trials_expired: 0,
      return_warnings_sent: 0,
      device_fees_charged: 0,
      errors: [],
    };

    // ── 1. TRIAL-END REMINDERS + EXPIRY (only for trialing subs) ──
    const trialingSubs = await base44.asServiceRole.entities.GPSSubscription.filter({
      subscription_status: 'trialing',
    }, '-created_date', 500);

    for (const sub of trialingSubs) {
      try {
        if (!sub.trial_end_at) continue;
        const trialEnd = new Date(sub.trial_end_at);
        const daysUntilTrialEnd = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // Send reminder 14 days before trial ends
        if (daysUntilTrialEnd <= TRIAL_REMINDER_DAYS_BEFORE && daysUntilTrialEnd > 0 && !sub.trial_reminder_sent_at) {
          try {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: sub.customer_email,
              subject: `⏰ Your free trial ends in ${daysUntilTrialEnd} days`,
              body: `Hi ${sub.customer_name || 'Customer'},\n\nYour Contactless360 free trial ends in ${daysUntilTrialEnd} days, on ${trialEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.\n\nHere's what happens:\n• Your subscription of $${MONTHLY_PRICE}/mo will start automatically on that date\n• No action needed if you want to continue — just enjoy your GPS!\n• To cancel: open your app and tap "Cancel Subscription"\n• If you cancel, return the device within ${RETURN_WINDOW_DAYS} days (prepaid label provided) or a $${DEVICE_FEE} device fee applies\n\nYou're in full control.\n\nThe Contactless360 Team`,
              from_name: 'Contactless360 GPS',
            });
          } catch (e) {
            results.errors.push(`Trial reminder email to ${sub.customer_email}: ${e.message}`);
          }

          await base44.asServiceRole.entities.GPSSubscription.update(sub.id, {
            trial_reminder_sent_at: now.toISOString(),
          });

          await base44.asServiceRole.entities.Notification.create({
            recipient_user_id: sub.customer_user_id,
            recipient_email: sub.customer_email,
            recipient_role: 'customer',
            title: `⏰ Trial ends in ${daysUntilTrialEnd} days`,
            body: `Your free trial ends on ${trialEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. $${MONTHLY_PRICE}/mo starts automatically. Cancel anytime in your app.`,
            type: 'alert',
            category: 'subscriptions',
            severity: 'warning',
            source_function: 'processGPSTrialLifecycle',
          }).catch(() => {});

          results.trial_reminders_sent++;
        }

        // Trial expired — Stripe should have already charged, but update our status
        if (now.getTime() >= trialEnd.getTime() && sub.subscription_status === 'trialing') {
          let stripeStatus = 'active';
          if (sub.stripe_subscription_id) {
            try {
              const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
              stripeStatus = stripeSub.status;
            } catch (e) {
              results.errors.push(`Stripe sub retrieve ${sub.stripe_subscription_id}: ${e.message}`);
            }
          }

          const newStatus = stripeStatus === 'active' ? 'active' : 'trialing';
          await base44.asServiceRole.entities.GPSSubscription.update(sub.id, {
            subscription_status: newStatus,
            payment_status: stripeStatus === 'active' ? 'paid' : 'pending',
          });

          if (sub.device_id && stripeStatus === 'active') {
            const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: sub.device_id }, '-created_date', 1);
            if (devices[0]) {
              await base44.asServiceRole.entities.TelematicsDevice.update(devices[0].id, {
                controls_enabled: true,
                subscription_status: 'active',
              });
            }
          }

          results.trials_expired++;
        }
      } catch (e) {
        results.errors.push(`Trial sub ${sub.id}: ${e.message}`);
      }
    }

    // ── 2. RETURN WINDOW MANAGEMENT (for cancelled subscriptions with return window) ──
    const cancelledSubs = await base44.asServiceRole.entities.GPSSubscription.filter({
      subscription_status: 'cancelled',
    }, '-created_date', 500);

    for (const sub of cancelledSubs) {
      try {
        // Skip if device already returned or fee already charged
        if (sub.device_returned_at || sub.device_fee_charged_at) continue;
        if (!sub.return_window_ends_at) continue; // pending_activation cancels have no return window

        const returnWindowEnd = new Date(sub.return_window_ends_at);
        const daysIntoReturnWindow = Math.floor((now.getTime() - returnWindowEnd.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000) / (1000 * 60 * 60 * 24));

        // ── Day 12 warning ──
        if (daysIntoReturnWindow >= RETURN_WARNING_DAYS && !sub.device_return_warning_sent_at) {
          const daysRemaining = Math.max(0, RETURN_WINDOW_DAYS - daysIntoReturnWindow);

          try {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: sub.customer_email,
              subject: `⚠️ We haven't received your device — ${daysRemaining} day(s) left`,
              body: `Hi ${sub.customer_name || 'Customer'},\n\nWe haven't received your GPS device yet. You have ${daysRemaining} day(s) left to return it before the $${DEVICE_FEE} device fee is charged to your card on file.\n\nReturn instructions:\n1. Pack the device in its original packaging (or any sturdy box)\n2. Reply to this email to request your prepaid return label\n3. Drop off the package at any USPS or UPS location\n\nReturn by: ${returnWindowEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}\n\nThe Contactless360 Team`,
              from_name: 'Contactless360 GPS',
            });
          } catch (e) {
            results.errors.push(`Return warning email to ${sub.customer_email}: ${e.message}`);
          }

          await base44.asServiceRole.entities.GPSSubscription.update(sub.id, {
            device_return_warning_sent_at: now.toISOString(),
          });

          await base44.asServiceRole.entities.Notification.create({
            recipient_user_id: sub.customer_user_id,
            recipient_email: sub.customer_email,
            recipient_role: 'customer',
            title: `⚠️ Device not received — ${daysRemaining} day(s) left`,
            body: `We haven't received your GPS device. Return it within ${daysRemaining} day(s) to avoid the $${DEVICE_FEE} device fee.`,
            type: 'alert',
            category: 'subscriptions',
            severity: 'critical',
            source_function: 'processGPSTrialLifecycle',
          }).catch(() => {});

          results.return_warnings_sent++;
        }

        // ── Day 14: Charge $100 device fee ──
        if (now.getTime() >= returnWindowEnd.getTime() && !sub.device_fee_charged_at) {
          if (sub.stripe_customer_id && sub.stripe_payment_method_id) {
            try {
              const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(DEVICE_FEE * 100),
                currency: 'usd',
                customer: sub.stripe_customer_id,
                payment_method: sub.stripe_payment_method_id,
                confirm: true,
                off_session: true,
                description: `Contactless360 device fee — device not returned within ${RETURN_WINDOW_DAYS} days`,
                metadata: {
                  billing_context: 'gps_device_not_returned_fee',
                  subscription_id: sub.id,
                  customer_email: sub.customer_email,
                  return_window_ends_at: sub.return_window_ends_at,
                },
              });

              await base44.asServiceRole.entities.GPSSubscription.update(sub.id, {
                device_fee_charged_at: now.toISOString(),
              });

              try {
                await base44.asServiceRole.integrations.Core.SendEmail({
                  to: sub.customer_email,
                  subject: `$${DEVICE_FEE} device fee charged`,
                  body: `Hi ${sub.customer_name || 'Customer'},\n\nYour GPS device was not returned within the ${RETURN_WINDOW_DAYS}-day return window. A $${DEVICE_FEE} device fee has been charged to your card on file.\n\nIf you believe this is an error, or if you've already shipped the device, please reply to this email with your tracking number and we'll review it immediately.\n\nThe Contactless360 Team`,
                  from_name: 'Contactless360 GPS',
                });
              } catch (e) {
                results.errors.push(`Device fee email to ${sub.customer_email}: ${e.message}`);
              }

              await base44.asServiceRole.entities.Notification.create({
                recipient_user_id: sub.customer_user_id,
                recipient_email: sub.customer_email,
                recipient_role: 'customer',
                title: `$${DEVICE_FEE} device fee charged`,
                body: `Your GPS device was not returned within ${RETURN_WINDOW_DAYS} days. $${DEVICE_FEE} has been charged to your card. Reply to your email if this is an error.`,
                type: 'alert',
                category: 'payments',
                severity: 'critical',
                source_function: 'processGPSTrialLifecycle',
              }).catch(() => {});

              await base44.asServiceRole.entities.ActivityEvent.create({
                event_type: 'payment.succeeded',
                actor_id: 'automation',
                actor_email: 'automation@contactless360.com',
                actor_role: 'automation',
                target_entity: 'GPSSubscription',
                target_id: sub.id,
                summary: `$${DEVICE_FEE} device fee charged — device not returned within ${RETURN_WINDOW_DAYS} days`,
                metadata: {
                  subscription_id: sub.id,
                  payment_intent_id: paymentIntent.id,
                  amount: DEVICE_FEE,
                  return_window_ends_at: sub.return_window_ends_at,
                },
                source: 'automation',
                event_status: 'warning',
              }).catch(() => {});

              results.device_fees_charged++;
            } catch (e) {
              results.errors.push(`Device fee charge for ${sub.customer_email}: ${e.message}`);

              await base44.asServiceRole.entities.ActivityEvent.create({
                event_type: 'payment.failed',
                actor_id: 'automation',
                actor_email: 'automation@contactless360.com',
                actor_role: 'automation',
                target_entity: 'GPSSubscription',
                target_id: sub.id,
                summary: `Device fee charge FAILED: ${e.message}`,
                metadata: {
                  subscription_id: sub.id,
                  error: e.message,
                  amount: DEVICE_FEE,
                },
                source: 'automation',
                event_status: 'error',
              }).catch(() => {});
            }
          }
        }
      } catch (e) {
        results.errors.push(`Cancelled sub ${sub.id}: ${e.message}`);
      }
    }

    return Response.json({ ok: true, ...results });
  } catch (error) {
    console.error('[processGPSTrialLifecycle]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});