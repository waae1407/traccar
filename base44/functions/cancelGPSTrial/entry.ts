import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import Stripe from 'npm:stripe@14.21.0';

const RETURN_WINDOW_DAYS = 14;
const DEVICE_FEE = 100;

/**
 * cancelGPSTrial — User cancels their GPS trial or subscription.
 *
 * NEW: Handles pending_activation (trial never started):
 *   - No Stripe subscription to cancel (wasn't created yet)
 *   - No $100 device fee (trial never started, no billing relationship)
 *   - If device was shipped: request return but no fee
 *   - If device was NOT shipped: just cancel, restock if applicable
 *
 * For trialing/active subscriptions: existing logic (cancel Stripe, 14-day return window, $100 fee).
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

    // Load subscription
    const subs = await base44.asServiceRole.entities.GPSSubscription.filter({ id: subscription_id, customer_user_id: user.id }, '-created_date', 1);
    const sub = subs[0];
    if (!sub) return Response.json({ error: 'Subscription not found.' }, { status: 404 });
    if (sub.subscription_status === 'cancelled') return Response.json({ error: 'This subscription is already cancelled.' }, { status: 409 });

    const isPendingActivation = sub.subscription_status === 'pending_activation';

    // ── Load linked order to check ship status ──
    let order = null;
    if (sub.order_id) {
      const orders = await base44.asServiceRole.entities.GPSOrder.filter({ id: sub.order_id }, '-created_date', 1);
      order = orders[0];
    }
    const wasShipped = order && (order.order_status === 'shipped' || order.shipped_at);

    // ── 1. Cancel Stripe subscription (only if one exists) ──
    if (sub.stripe_subscription_id && !isPendingActivation) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id, {
          invoice_now: true,
          prorate: false,
        });
      } catch (e) {
        console.error('[cancelGPSTrial] Stripe cancel failed:', e.message);
      }
    }

    // ── 2. Determine return window and fee applicability ──
    // pending_activation (trial never started): NO device fee, NO return window deadline
    // trialing/active: 14-day return window, $100 fee if not returned
    const returnWindowEnd = isPendingActivation ? null : new Date(now.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // ── 3. Update GPSSubscription ──
    await base44.asServiceRole.entities.GPSSubscription.update(sub.id, {
      subscription_status: 'cancelled',
      canceled_at: now.toISOString(),
      cancel_reason: reason || (isPendingActivation ? 'cancelled_before_activation' : 'user_cancelled'),
      ...(returnWindowEnd ? {
        return_window_ends_at: returnWindowEnd.toISOString(),
        return_label_sent_at: now.toISOString(),
      } : {}),
    });

    // ── 4. Halt services on device ──
    if (sub.device_id) {
      const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: sub.device_id }, '-created_date', 1);
      if (devices[0]) {
        await base44.asServiceRole.entities.TelematicsDevice.update(devices[0].id, {
          controls_enabled: false,
          subscription_status: 'cancelled',
        });
      }
    }

    // ── 5. Update GPSOrder + restock if not shipped ──
    if (order) {
      await base44.asServiceRole.entities.GPSOrder.update(order.id, {
        order_status: 'cancelled',
      });
      // Restock if device hasn't shipped yet
      if (!wasShipped) {
        const prods = await base44.asServiceRole.entities.GPSProduct.filter({ package_type: 'device_subscription' });
        if (prods[0] && typeof prods[0].inventory_count === 'number') {
          await base44.asServiceRole.entities.GPSProduct.update(prods[0].id, {
            inventory_count: prods[0].inventory_count + 1,
          }).catch(() => {});
        }
      }
    }

    // ── 6. Email — different content for pending_activation vs active trial ──
    try {
      if (isPendingActivation) {
        // Trial never started — no fee, no return deadline
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: sub.customer_email,
          subject: 'Your Contactless360 Trial Has Been Cancelled',
          body: wasShipped
            ? `Hi ${sub.customer_name || 'Customer'},\n\nYour Contactless360 GPS trial has been cancelled before it started. Since your trial hadn't begun yet, no charges will be made and no device fee applies.\n\n${wasShipped ? `Your device was shipped — if you've received it, please return it to us. Reply to this email for return instructions.` : ''}\n\nYour account has been closed with no charges.\n\nChanged your mind? You can sign up again anytime.\n\nThe Contactless360 Team`
            : `Hi ${sub.customer_name || 'Customer'},\n\nYour Contactless360 GPS trial has been cancelled before it started. Since your device hadn't shipped yet and your trial hadn't begun, no charges will be made and no device fee applies.\n\nYour account has been closed with no charges.\n\nChanged your mind? You can sign up again anytime.\n\nThe Contactless360 Team`,
          from_name: 'Contactless360 GPS',
        });
      } else {
        // Active trial cancellation — 14-day return window, $100 fee
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: sub.customer_email,
          subject: '📦 Your GPS Trial Has Been Cancelled — Return Instructions',
          body: `Hi ${sub.customer_name || 'Customer'},\n\nYour Contactless360 GPS subscription has been cancelled. All services have been halted.\n\nTo avoid the $${DEVICE_FEE} device fee, please return your device within ${RETURN_WINDOW_DAYS} days (by ${returnWindowEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}).\n\nReturn instructions:\n1. Pack the device in its original packaging (or any sturdy box)\n2. Reply to this email to request your prepaid return label\n3. Drop off the package at any USPS or UPS location\n\nOnce we receive and verify the device, your account will be fully closed with no charges.\n\nIf we don't receive the device by ${returnWindowEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, a $${DEVICE_FEE} device fee will be charged to your card on file.\n\nThe Contactless360 Team`,
          from_name: 'Contactless360 GPS',
        });
      }
    } catch (e) {
      console.error('[cancelGPSTrial] email failed:', e.message);
    }

    // ── 7. In-app notification ──
    await base44.asServiceRole.entities.Notification.create({
      recipient_user_id: user.id,
      recipient_email: sub.customer_email,
      recipient_role: 'customer',
      title: isPendingActivation ? 'Trial Cancelled — No Charges' : 'Trial Cancelled — Return Device Within 14 Days',
      body: isPendingActivation
        ? `Your GPS trial has been cancelled before it started. No charges, no device fee. ${wasShipped ? 'If you received the device, please return it.' : ''}`
        : `Your GPS subscription has been cancelled. Return the device by ${returnWindowEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to avoid the $${DEVICE_FEE} device fee.`,
      type: isPendingActivation ? 'info' : 'alert',
      category: 'subscriptions',
      severity: isPendingActivation ? 'info' : 'warning',
      source_function: 'cancelGPSTrial',
    }).catch(() => {});

    // ── 8. Audit ──
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'booking.cancelled',
      actor_id: user.id,
      actor_email: user.email,
      actor_role: 'customer',
      target_entity: 'GPSSubscription',
      target_id: sub.id,
      summary: isPendingActivation
        ? `GPS trial cancelled before activation (no fee, no return window) — ${sub.customer_email}`
        : `GPS trial/subscription cancelled — 14-day return window started (fee: $${DEVICE_FEE} if not returned)`,
      metadata: {
        subscription_id: sub.id,
        stripe_subscription_id: sub.stripe_subscription_id || '',
        is_pending_activation: isPendingActivation,
        was_shipped: !!wasShipped,
        ...(returnWindowEnd ? { return_window_ends_at: returnWindowEnd.toISOString() } : {}),
        device_fee: isPendingActivation ? 0 : DEVICE_FEE,
        reason: reason || (isPendingActivation ? 'cancelled_before_activation' : 'user_cancelled'),
      },
      source: 'customer_app',
      event_status: isPendingActivation ? 'info' : 'warning',
    }).catch(() => {});

    // ── 9. Notify admins ──
    try {
      const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 100);
      const admins = allUsers.filter(u => u.role === 'admin');
      for (const admin of admins) {
        await base44.asServiceRole.entities.Notification.create({
          recipient_user_id: admin.id,
          recipient_email: admin.email,
          recipient_role: 'admin',
          title: isPendingActivation ? 'ℹ️ GPS Trial Cancelled Before Activation' : '⚠️ GPS Trial/Subscription Cancelled',
          body: isPendingActivation
            ? `${sub.customer_email} cancelled before activation. ${wasShipped ? 'Device was shipped — request return.' : 'Device not shipped — restocked.'} No fee charged.`
            : `${sub.customer_email} cancelled their GPS ${sub.subscription_status === 'trialing' ? 'trial' : 'subscription'}. 14-day return window started. $${DEVICE_FEE} fee if device not returned by ${returnWindowEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
          type: isPendingActivation ? 'info' : 'alert',
          category: 'subscriptions',
          severity: isPendingActivation ? 'info' : 'warning',
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
      is_pending_activation: isPendingActivation,
      ...(returnWindowEnd ? { return_window_ends_at: returnWindowEnd.toISOString() } : {}),
      device_fee: isPendingActivation ? 0 : DEVICE_FEE,
      message: isPendingActivation
        ? 'Cancelled. No charges, no device fee.'
        : `Cancelled. Return the device by ${returnWindowEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} to avoid the $${DEVICE_FEE} fee.`,
    });
  } catch (err) {
    console.error('[cancelGPSTrial]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});