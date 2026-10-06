import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ACTIVATION_DEADLINE_DAYS = 21;

/**
 * markGPSOrderShipped — Admin marks a GPS order as shipped with carrier + tracking.
 *
 * NEW: Sets trial_activation_deadline on the linked GPSSubscription = shipped_at + 21 days.
 * If the device hasn't come online by that deadline, activatePendingTrials starts the
 * trial from the ship date as a fallback.
 *
 * For backordered orders: decrements inventory at ship time (not at signup).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required.' }, { status: 403 });
    }

    const { order_id, tracking_number, carrier } = await req.json();
    if (!order_id || !tracking_number) {
      return Response.json({ error: 'order_id and tracking_number are required.' }, { status: 400 });
    }

    const orders = await base44.asServiceRole.entities.GPSOrder.filter({ id: order_id });
    const order = orders[0];
    if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 });
    if (order.order_status === 'shipped') return Response.json({ error: 'Order already shipped.' }, { status: 409 });

    const now = new Date();
    const activationDeadline = new Date(now.getTime() + ACTIVATION_DEADLINE_DAYS * 24 * 60 * 60 * 1000);

    await base44.asServiceRole.entities.GPSOrder.update(order_id, {
      order_status: 'shipped',
      tracking_number,
      carrier: carrier || '',
      shipped_at: now.toISOString(),
    });

    // ── Decrement inventory for backordered orders at ship time ──
    if (order.is_backordered) {
      const prods = await base44.asServiceRole.entities.GPSProduct.filter({ package_type: 'device_subscription' });
      if (prods[0] && typeof prods[0].inventory_count === 'number') {
        await base44.asServiceRole.entities.GPSProduct.update(prods[0].id, {
          inventory_count: Math.max(0, prods[0].inventory_count - 1),
        }).catch(() => {});
      }
    }

    // ── Set trial_activation_deadline on linked GPSSubscription ──
    if (order.is_trial_order) {
      const subs = await base44.asServiceRole.entities.GPSSubscription.filter({ order_id: order_id }, '-created_date', 5);
      const trialSub = subs.find(s => s.subscription_status === 'pending_activation') || subs[0];
      if (trialSub) {
        await base44.asServiceRole.entities.GPSSubscription.update(trialSub.id, {
          trial_activation_deadline: activationDeadline.toISOString(),
        }).catch(() => {});
      }
    }

    // Email customer with tracking
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: order.customer_email,
        subject: `📦 Your Contactless360 GPS Device Has Shipped!`,
        body: `Hi ${order.customer_name || 'Customer'},\n\nGreat news — your Contactless360 GPS order (${order.order_number}) has shipped!\n\nCarrier: ${carrier || 'N/A'}\nTracking Number: ${tracking_number}\n\nYou can track your package with the carrier.\n\nImportant: Your 90-day free trial starts automatically the moment your device goes online for the first time after you install it. No action needed — just plug it in and we'll detect it.\n\nIf we don't see your device come online within ${ACTIVATION_DEADLINE_DAYS} days, your trial will start from today as a fallback so you don't miss out.\n\nThe Contactless360 Team`,
        from_name: 'Contactless360 GPS',
      });
    } catch (e) {
      console.error('[markGPSOrderShipped] customer email failed:', e.message);
    }

    // In-app notification to customer
    await base44.asServiceRole.entities.Notification.create({
      recipient_email: order.customer_email,
      recipient_role: 'customer',
      title: '📦 Your GPS Device Has Shipped',
      body: `Order ${order.order_number} shipped via ${carrier || 'carrier'}. Tracking: ${tracking_number}. Your 90-day trial starts when the device goes online.`,
      type: 'success',
      category: 'subscriptions',
      severity: 'info',
      source_function: 'markGPSOrderShipped',
      related_entity_type: 'GPSOrder',
      related_entity_id: order.id,
    }).catch(() => {});

    // Audit
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'booking.active',
      actor_id: user.id,
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'GPSOrder',
      target_id: order_id,
      target_label: order.order_number,
      summary: `GPS order shipped: ${order.order_number} — ${carrier || ''} ${tracking_number}. Trial activation deadline: ${activationDeadline.toISOString().split('T')[0]}.`,
      metadata: { order_id, tracking_number, carrier, activation_deadline: activationDeadline.toISOString() },
      source: 'admin',
      event_status: 'success',
    }).catch(() => {});

    return Response.json({
      success: true,
      order_id,
      tracking_number,
      carrier,
      activation_deadline: activationDeadline.toISOString(),
    });
  } catch (err) {
    console.error('[markGPSOrderShipped]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});