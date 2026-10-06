import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * markGPSOrderShipped — Admin marks a GPS order as shipped with carrier + tracking.
 * Updates the order and emails/notifies the customer with tracking details.
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

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.GPSOrder.update(order_id, {
      order_status: 'shipped',
      tracking_number,
      carrier: carrier || '',
      shipped_at: now,
    });

    // Email customer with tracking
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: order.customer_email,
        subject: `📦 Your Contactless360 GPS Device Has Shipped!`,
        body: `Hi ${order.customer_name || 'Customer'},\n\nGreat news — your Contactless360 GPS order (${order.order_number}) has shipped!\n\nCarrier: ${carrier || 'N/A'}\nTracking Number: ${tracking_number}\n\nYou can track your package with the carrier. Once your device arrives, activate it in the app to start your service.\n\nThe Contactless360 Team`,
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
      body: `Order ${order.order_number} shipped via ${carrier || 'carrier'}. Tracking: ${tracking_number}`,
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
      summary: `GPS order shipped: ${order.order_number} — ${carrier || ''} ${tracking_number}`,
      metadata: { order_id, tracking_number, carrier },
      source: 'admin',
      event_status: 'success',
    }).catch(() => {});

    return Response.json({ success: true, order_id, tracking_number, carrier });
  } catch (err) {
    console.error('[markGPSOrderShipped]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});