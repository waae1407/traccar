import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    const {
      package_type,
      quantity = 1,
      customer_name,
      customer_email,
      customer_phone,
      shipping_address,
      billing_address,
      vehicle_use_type = 'personal',
    } = await req.json();

    if (!package_type || !customer_email || !customer_name || !shipping_address) {
      return Response.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    // 1. Load product server-side
    const products = await base44.asServiceRole.entities.GPSProduct.filter({ package_type, is_active: true });
    const product = products[0];

    let unitPrice, shippingAmount, activationFee, monthlySubPrice, productName;

    if (product) {
      unitPrice = product.device_price || 0;
      shippingAmount = product.shipping_price || 0;
      activationFee = product.activation_fee || 0;
      monthlySubPrice = product.monthly_subscription_price || 0;
      productName = product.name || package_type;
    } else {
      // Fallback pricing if no product record exists yet
      const FALLBACK = {
        device_only: { price: 149, shipping: 9.99, activation: 0, sub: 0 },
        device_subscription: { price: 149, shipping: 0, activation: 0, sub: 14.99 },
        host_contactless_kit: { price: 179, shipping: 0, activation: 0, sub: 14.99 },
      };
      const fb = FALLBACK[package_type] || FALLBACK.device_subscription;
      unitPrice = fb.price;
      shippingAmount = fb.shipping;
      activationFee = fb.activation;
      monthlySubPrice = fb.sub;
      productName = package_type.replace(/_/g, ' ');
    }

    const qty = Math.max(1, Number(quantity));
    const subtotal = Math.round(unitPrice * qty * 100) / 100;
    const totalAmount = Math.round((subtotal + shippingAmount + activationFee) * 100) / 100;

    // Determine owner context
    let hostId = null;
    let customerUserId = null;
    let orderOwnerType = 'guest';

    if (user) {
      customerUserId = user.id;
      orderOwnerType = 'customer';
      const hosts = await base44.asServiceRole.entities.Host.filter({ email: user.email });
      const hostByUser = await base44.asServiceRole.entities.Host.filter({ user_id: user.id });
      const host = hosts[0] || hostByUser[0];
      if (host) {
        hostId = host.id;
        orderOwnerType = 'host';
      }
    }

    // 2. Create GPSOrder (pending)
    const orderNum = `C360-${Date.now().toString(36).toUpperCase()}`;
    const order = await base44.asServiceRole.entities.GPSOrder.create({
      order_number: orderNum,
      customer_name,
      customer_email: customer_email.toLowerCase().trim(),
      customer_phone: customer_phone || '',
      shipping_address,
      billing_address: billing_address || shipping_address,
      product_id: product?.id || '',
      package_type,
      quantity: qty,
      unit_price: unitPrice,
      subtotal,
      tax_amount: 0,
      shipping_amount: shippingAmount,
      total_amount: totalAmount,
      vehicle_use_type,
      payment_status: 'pending_payment',
      order_status: 'pending_payment',
      activation_status: 'not_started',
      customer_user_id: customerUserId || '',
      host_id: hostId || '',
      order_owner_type: orderOwnerType,
      device_ids: [],
    });

    // 3. Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
      currency: 'usd',
      receipt_email: customer_email,
      description: `Contactless360 ${productName} x${qty}`,
      metadata: {
        billing_context: 'contactless_gps_order',
        gps_order_id: order.id,
        order_number: orderNum,
        package_type,
        customer_email,
        host_id: hostId || '',
        customer_user_id: customerUserId || '',
      },
    });

    // 4. Store Stripe intent ID on order
    await base44.asServiceRole.entities.GPSOrder.update(order.id, {
      stripe_payment_intent_id: paymentIntent.id,
    });

    // 5. Audit log
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'payment.submitted',
      actor_id: customerUserId || 'guest',
      actor_email: customer_email,
      actor_role: orderOwnerType === 'host' ? 'host' : 'customer',
      target_entity: 'GPSOrder',
      target_id: order.id,
      target_label: orderNum,
      host_id: hostId || '',
      summary: `GPS order created: ${orderNum} — $${totalAmount} — ${package_type}`,
      metadata: { order_id: order.id, package_type, total_amount: totalAmount, stripe_pi: paymentIntent.id },
      source: 'customer_app',
      event_status: 'pending',
    }).catch(() => {});

    return Response.json({
      order_id: order.id,
      order_number: orderNum,
      client_secret: paymentIntent.client_secret,
      total_amount: totalAmount,
      monthly_subscription_price: monthlySubPrice,
      has_subscription: monthlySubPrice > 0,
    });
  } catch (err) {
    console.error('[createGPSCheckoutPayment]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});