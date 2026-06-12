import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required.' }, { status: 403 });
    }

    const { order_id, refund_amount, refund_reason } = await req.json();
    if (!order_id || !refund_amount || !refund_reason) {
      return Response.json({ error: 'order_id, refund_amount, and refund_reason are required.' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    const orders = await base44.asServiceRole.entities.GPSOrder.filter({ id: order_id });
    const order = orders[0];
    if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 });
    if (order.payment_status !== 'paid') return Response.json({ error: 'Order must be paid to refund.' }, { status: 400 });
    if (!order.stripe_payment_intent_id) return Response.json({ error: 'No Stripe PaymentIntent on this order.' }, { status: 400 });

    const maxRefund = order.total_amount - (order.refund_amount || 0);
    const requestedRefund = Math.round(Number(refund_amount) * 100) / 100;
    if (requestedRefund <= 0 || requestedRefund > maxRefund) {
      return Response.json({ error: `Refund amount must be between $0.01 and $${maxRefund.toFixed(2)}.` }, { status: 400 });
    }

    // Retrieve the PaymentIntent to get the charge ID
    const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
    const chargeId = pi.latest_charge;
    if (!chargeId) return Response.json({ error: 'No charge found on PaymentIntent.' }, { status: 400 });

    // Issue Stripe refund
    const refund = await stripe.refunds.create({
      charge: chargeId,
      amount: Math.round(requestedRefund * 100),
      reason: 'requested_by_customer',
      metadata: {
        gps_order_id: order_id,
        order_number: order.order_number,
        refund_reason,
        admin_user: user.email,
        fleet_partner_discount_applied: String(order.fleet_partner_discount_applied || false),
      },
    });

    // Determine new refund status
    const totalRefunded = Math.round(((order.refund_amount || 0) + requestedRefund) * 100) / 100;
    const newRefundStatus = totalRefunded >= order.total_amount ? 'full' : 'partial';

    // Update GPSOrder
    await base44.asServiceRole.entities.GPSOrder.update(order_id, {
      refund_status: newRefundStatus,
      refund_amount: totalRefunded,
      refund_reason,
      stripe_refund_id: refund.id,
      refunded_at: new Date().toISOString(),
      payment_status: newRefundStatus === 'full' ? 'refunded' : 'paid',
      order_status: newRefundStatus === 'full' ? 'refunded' : order.order_status,
    });

    // Audit log
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'payment.refunded',
      actor_id: user.id,
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'GPSOrder',
      target_id: order_id,
      target_label: order.order_number,
      host_id: order.host_id || '',
      summary: `GPS order refunded: ${order.order_number} — $${requestedRefund} (${newRefundStatus}) — reason: ${refund_reason}`,
      metadata: {
        order_id,
        refund_amount: requestedRefund,
        refund_status: newRefundStatus,
        stripe_refund_id: refund.id,
        fleet_partner_discount_applied: order.fleet_partner_discount_applied || false,
        original_paid: order.total_amount,
        msrp_unit_price: order.msrp_unit_price,
        sale_unit_price: order.sale_unit_price,
      },
      source: 'admin',
      event_status: 'success',
    }).catch(() => {});

    return Response.json({
      success: true,
      stripe_refund_id: refund.id,
      refund_amount: requestedRefund,
      total_refunded: totalRefunded,
      refund_status: newRefundStatus,
    });
  } catch (err) {
    console.error('[refundGPSOrder]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});