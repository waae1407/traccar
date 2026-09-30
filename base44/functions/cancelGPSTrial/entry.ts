import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import Stripe from 'npm:stripe@14.21.0';

const RETURN_WINDOW_DAYS = 14;
const DEVICE_FEE = 100;

/**
 * cancelGPSTrial — User cancels their GPS trial or subscription.
 *
 * Flow:
 *   1. Cancel Stripe subscription immediately
 *   2. Halt all services (controls + tracking disabled)
 *   3. Start 14-day return window
 *   4. Email prepaid return label instructions
 *   5. Set return_window_ends_at = now + 14 days
 *
 * If device not returned within 14 days → $100 device fee (handled by processGPSTrialLifecycle)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { subscription_id, reason } = await req.json();
    if (!subscription_id) return Response.json({ error: 'subscription_id is required' }, { status: 400 });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const now = new Date();
    const returnWindowEnd = new Date(now.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Load subscription
    const subs = await base44.asServiceRole.entities.GPSSubscription.filter({ id: subscription_id, customer_user_id: user.id }, '-created_date', 1);
    const sub = subs[0];
    if (!sub) return Response.json({ error: 'Subscription not found.' }, { status: 404 });
    if (sub.subscription_status === 'cancelled') return Response.json({ error: 'This subscription is already cancelled.' }, { status: 409 });

    // ── 1. Cancel Stripe subscription ──
    if (sub.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id, {
          invoice_now: true,
          prorate: false,
        });
      } catch (e) {
        console.error('[cancelGPSTrial] Stripe cancel failed:', e.message);
      }
    }

    // ── 2. Update GPSSubscription ──
    await base44.asServiceRole.entities.GPSSubscription.update(sub.id, {
      subscription_status: 'cancelled',
      canceled_at: now.toISOString(),
      cancel_reason: reason || 'user_cancelled',
      return_window_ends_at: returnWindowEnd.toISOString(),
      return_label_sent_at: now.toISOString(),
    });

    // ── 3. Halt services on device ──
    if (sub.device_id) {
      const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: sub.device_id }, '-created_date', 1);
      if (devices[0]) {
        await base44.asServiceRole.entities.TelematicsDevice.update(devices[0].id, {
          controls_enabled: false,
          subscription_status: 'cancelled',
        });
      }
    }

    // ── 4. Update GPSOrder ──
    if (sub.order_id) {
      const orders = await base44.asServiceRole.entities.GPSOrder.filter({ id: sub.order_id }, '-created_date', 1);
      if (orders[0]) {
        await base44.asServiceRole.entities.GPSOrder.update(orders[0].id, {
          order_status: 'cancelled',
        });
      }
    }

    // ── 5. Email return instructions ──
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: sub.customer_email,
        subject: '📦 Your GPS Trial Has Been Cancelled — Return Instructions',
        body: `Hi ${sub.customer_name || 'Customer'},\n\nYour Contactless360 GPS subscription has been cancelled. All services have been halted.\n\nTo avoid the $${DEVICE_FEE} device fee, please return your device within ${RETURN_WINDOW_DAYS} days (by ${returnWindowEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}).\n\nReturn instructions:\n1. Pack the device in its original packaging (or any sturdy box)\n2. Reply to this email to request your prepaid return label\n3. Drop off the package at any USPS or UPS location\n\nOnce we receive and verify the device, your account will be fully closed with no charges.\n\nIf we don't receive the device by ${returnWindowEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, a $${DEVICE_FEE} device fee will be charged to your card on file.\n\nChanged your mind? You can reactivate your subscription anytime before the return window expires.\n\nThe Contactless360 Team`,
        from_name: 'Contactless360 GPS',
      });
    } catch (e) {
      console.error('[cancelGPSTrial] return email failed:', e.message);
    }

    // ── 6. In-app notification ──
    await base44.asServiceRole.entities.Notification.create({
      recipient_user_id: user.id,
      recipient_email: sub.customer_email,
      recipient_role: 'customer',
      title: 'Trial Cancelled — Return Device Within 14 Days',
      body: `Your GPS subscription has been cancelled. Return the device by ${returnWindowEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to avoid the $${DEVICE_FEE} device fee. Reply to your cancellation email for a prepaid return label.`,
      type: 'alert',
      category: 'subscriptions',
      severity: 'warning',
      source_function: 'cancelGPSTrial',
    }).catch(() => {});

    // ── 7. Audit ──
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'booking.cancelled',
      actor_id: user.id,
      actor_email: user.email,
      actor_role: 'customer',
      target_entity: 'GPSSubscription',
      target_id: sub.id,
      summary: `GPS trial/subscription cancelled — 14-day return window started (fee: $${DEVICE_FEE} if not returned)`,
      metadata: {
        subscription_id: sub.id,
        stripe_subscription_id: sub.stripe_subscription_id || '',
        return_window_ends_at: returnWindowEnd.toISOString(),
        device_fee: DEVICE_FEE,
        reason: reason || 'user_cancelled',
      },
      source: 'customer_app',
      event_status: 'warning',
    }).catch(() => {});

    // ── 8. Notify admins of cancellation ──
    try {
      const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 100);
      const admins = allUsers.filter(u => u.role === 'admin');
      for (const admin of admins) {
        await base44.asServiceRole.entities.Notification.create({
          recipient_user_id: admin.id,
          recipient_email: admin.email,
          recipient_role: 'admin',
          title: '⚠️ GPS Trial/Subscription Cancelled',
          body: `${sub.customer_email} cancelled their GPS ${sub.subscription_status === 'trialing' ? 'trial' : 'subscription'}. 14-day return window started. $${DEVICE_FEE} fee if device not returned by ${returnWindowEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
          type: 'alert',
          category: 'subscriptions',
          severity: 'warning',
          source_function: 'cancelGPSTrial',
          related_entity_type: 'GPSSubscription',
          related_entity_id: sub.id,
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[cancelGPSTrial] admin notification failed:', e.message);
    }

    return Response.json({
      success: true,
      return_window_ends_at: returnWindowEnd.toISOString(),
      device_fee: DEVICE_FEE,
      message: `Cancelled. Return the device by ${returnWindowEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} to avoid the $${DEVICE_FEE} fee.`,
    });
  } catch (err) {
    console.error('[cancelGPSTrial]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});