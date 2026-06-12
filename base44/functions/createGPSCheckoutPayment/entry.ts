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

    // 2. Fleet Partner Kit — full server-side eligibility gate
    if (package_type === 'host_contactless_kit') {
      const deny = (reason, message) => {
        // Log denied attempt
        base44.asServiceRole.entities.ActivityEvent.create({
          event_type: 'fleet_partner_kit_ineligible',
          actor_email: user?.email || 'guest',
          actor_id: user?.id || 'guest',
          target_entity: 'GPSProduct',
          summary: `Backend Fleet Kit eligibility denied: ${reason}`,
          metadata: {
            user_email: user?.email || 'guest',
            reason,
            message,
            package_type,
            source_page: 'createGPSCheckoutPayment',
          },
          source: 'backend',
          event_status: 'blocked',
        }).catch(() => {});
        return Response.json({ error: message, error_code: 'FLEET_PARTNER_KIT_NOT_ELIGIBLE', reason }, { status: 403 });
      };

      if (!user) return deny('NOT_LOGGED_IN', 'Fleet Partner Kit pricing is available only to approved uRide Fleet Partners. Please log in.');

      const [byEmail, byUser] = await Promise.all([
        base44.asServiceRole.entities.Host.filter({ email: user.email }),
        base44.asServiceRole.entities.Host.filter({ user_id: user.id }),
      ]);
      const host = byEmail[0] || byUser[0];

      if (!host) return deny('NOT_HOST', 'Fleet Partner Kit is only for approved uRide Fleet Partners.');
      if (host.status !== 'approved') return deny('HOST_NOT_APPROVED', 'Your host account must be approved before purchasing the Fleet Partner Expansion Kit.');

      const [vehicles, devices] = await Promise.all([
        base44.asServiceRole.entities.Vehicle.filter({ host_id: host.id, status: 'Available' }),
        base44.asServiceRole.entities.TelematicsDevice.filter({ host_id: host.id, lifecycle_status: 'live_enabled' }),
      ]);

      if (!vehicles.length) return deny('NO_ACTIVE_VEHICLE', 'The Fleet Partner Expansion Kit requires at least one active vehicle in your fleet.');
      if (!devices.length) return deny('NO_ACTIVE_TELEMATICS_DEVICE', 'This looks like your first telematics installation. Please choose Contactless360 Device + Subscription to start.');

      // Log eligible
      base44.asServiceRole.entities.ActivityEvent.create({
        event_type: 'fleet_partner_kit_eligible',
        actor_email: user.email,
        actor_id: user.id,
        target_entity: 'GPSProduct',
        summary: `Backend Fleet Kit eligibility approved for host ${host.id}`,
        metadata: {
          user_email: user.email,
          host_id: host.id,
          active_vehicle_count: vehicles.length,
          active_telematics_count: devices.length,
          package_type,
          source_page: 'createGPSCheckoutPayment',
        },
        source: 'backend',
        event_status: 'success',
      }).catch(() => {});
    }

    // 3. Resolve pricing from DB product
    let msrpUnitPrice, saleUnitPrice, unitPrice, discountPerUnit, discountLabel,
        shippingAmount, activationFee, monthlySubPrice, productName,
        isDiscountActive, eligibleOwnerType, priceSource, fleetPartnerDiscountApplied;

    if (product) {
      priceSource = 'db_product';
      isDiscountActive = product.is_discount_active && product.sale_price > 0;
      msrpUnitPrice = product.msrp_price || product.device_price || 0;
      saleUnitPrice = isDiscountActive ? product.sale_price : msrpUnitPrice;
      unitPrice = saleUnitPrice;
      discountPerUnit = isDiscountActive ? (product.discount_amount || (msrpUnitPrice - saleUnitPrice)) : 0;
      discountLabel = isDiscountActive ? (product.discount_label || '') : '';
      shippingAmount = product.shipping_price || 0;
      activationFee = product.activation_fee || 0;
      monthlySubPrice = product.monthly_subscription_price || 0;
      productName = product.name || package_type;
      eligibleOwnerType = product.eligible_owner_type || 'all';
      fleetPartnerDiscountApplied = isDiscountActive && package_type === 'host_contactless_kit';
    } else {
      // Fallback
      priceSource = 'fallback';
      const FALLBACK = {
        device_only: { price: 149, shipping: 9.99, activation: 0, sub: 0 },
        device_subscription: { price: 149, shipping: 0, activation: 0, sub: 14.99 },
        host_contactless_kit: { price: 130, shipping: 0, activation: 0, sub: 14.99 },
      };
      const fb = FALLBACK[package_type] || FALLBACK.device_subscription;
      msrpUnitPrice = package_type === 'host_contactless_kit' ? 179 : fb.price;
      saleUnitPrice = fb.price;
      unitPrice = fb.price;
      discountPerUnit = package_type === 'host_contactless_kit' ? 49 : 0;
      discountLabel = package_type === 'host_contactless_kit' ? 'Fleet Partner Launch Discount' : '';
      shippingAmount = fb.shipping;
      activationFee = fb.activation;
      monthlySubPrice = fb.sub;
      productName = package_type.replace(/_/g, ' ');
      eligibleOwnerType = package_type === 'host_contactless_kit' ? 'host' : 'all';
      fleetPartnerDiscountApplied = package_type === 'host_contactless_kit';
    }

    const qty = Math.max(1, Number(quantity));
    const totalDiscountAmount = Math.round(discountPerUnit * qty * 100) / 100;
    const subtotal = Math.round(unitPrice * qty * 100) / 100;
    const totalAmount = Math.round((subtotal + shippingAmount + activationFee) * 100) / 100;

    // 4. Owner context
    let hostId = null;
    let customerUserId = null;
    let orderOwnerType = 'guest';
    let fleetPartnerHostId = '';

    if (user) {
      customerUserId = user.id;
      orderOwnerType = 'customer';
      const [byEmail, byUser] = await Promise.all([
        base44.asServiceRole.entities.Host.filter({ email: user.email }),
        base44.asServiceRole.entities.Host.filter({ user_id: user.id }),
      ]);
      const host = byEmail[0] || byUser[0];
      if (host) {
        hostId = host.id;
        orderOwnerType = 'host';
        if (fleetPartnerDiscountApplied) fleetPartnerHostId = host.id;
      }
    }

    // 5. Create GPSOrder
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
      msrp_unit_price: msrpUnitPrice,
      sale_unit_price: saleUnitPrice,
      unit_price: unitPrice,
      discount_amount_per_unit: discountPerUnit,
      total_discount_amount: totalDiscountAmount,
      discount_label: discountLabel,
      price_source: priceSource,
      fleet_partner_discount_applied: fleetPartnerDiscountApplied,
      fleet_partner_host_id: fleetPartnerHostId,
      eligible_owner_type: eligibleOwnerType,
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
      refund_status: 'none',
      refund_amount: 0,
    });

    // 6. Stripe customer
    const stripeCustomer = await stripe.customers.create({
      email: customer_email.toLowerCase().trim(),
      name: customer_name,
      metadata: {
        host_id: hostId || '',
        customer_user_id: customerUserId || '',
        gps_order_id: order.id,
        order_number: orderNum,
      },
    });

    // 7. Stripe PaymentIntent — charged at sale_price
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100),
      currency: 'usd',
      customer: stripeCustomer.id,
      receipt_email: customer_email,
      description: fleetPartnerDiscountApplied
        ? `Contactless360 ${productName} x${qty} — Fleet Partner Discount Applied`
        : `Contactless360 ${productName} x${qty}`,
      setup_future_usage: monthlySubPrice > 0 ? 'off_session' : undefined,
      metadata: {
        billing_context: 'contactless_gps_order',
        gps_order_id: order.id,
        order_number: orderNum,
        package_type,
        customer_email,
        host_id: hostId || '',
        customer_user_id: customerUserId || '',
        msrp_unit_price: String(msrpUnitPrice),
        sale_unit_price: String(saleUnitPrice),
        discount_amount_per_unit: String(discountPerUnit),
        total_discount_amount: String(totalDiscountAmount),
        discount_label: discountLabel,
        fleet_partner_discount_applied: String(fleetPartnerDiscountApplied),
        fleet_partner_host_id: fleetPartnerHostId,
        eligible_owner_type: eligibleOwnerType,
      },
    });

    // 8. Store Stripe IDs
    await base44.asServiceRole.entities.GPSOrder.update(order.id, {
      stripe_payment_intent_id: paymentIntent.id,
      stripe_customer_id: stripeCustomer.id,
    });

    // 9. Audit log
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'payment.submitted',
      actor_id: customerUserId || 'guest',
      actor_email: customer_email,
      actor_role: orderOwnerType === 'host' ? 'host' : 'customer',
      target_entity: 'GPSOrder',
      target_id: order.id,
      target_label: orderNum,
      host_id: hostId || '',
      summary: `GPS order created: ${orderNum} — charged $${totalAmount} (MSRP $${msrpUnitPrice * qty}, discount $${totalDiscountAmount}) — ${package_type}`,
      metadata: {
        order_id: order.id,
        package_type,
        msrp_total: msrpUnitPrice * qty,
        total_discount_amount: totalDiscountAmount,
        total_amount: totalAmount,
        fleet_partner_discount_applied: fleetPartnerDiscountApplied,
        stripe_pi: paymentIntent.id,
      },
      source: 'customer_app',
      event_status: 'pending',
    }).catch(() => {});

    return Response.json({
      order_id: order.id,
      order_number: orderNum,
      client_secret: paymentIntent.client_secret,
      msrp_unit_price: msrpUnitPrice,
      sale_unit_price: saleUnitPrice,
      unit_price: unitPrice,
      discount_amount_per_unit: discountPerUnit,
      total_discount_amount: totalDiscountAmount,
      discount_label: discountLabel,
      fleet_partner_discount_applied: fleetPartnerDiscountApplied,
      subtotal,
      shipping_amount: shippingAmount,
      tax_amount: 0,
      total_amount: totalAmount,
      monthly_subscription_price: monthlySubPrice,
      has_subscription: monthlySubPrice > 0,
    });
  } catch (err) {
    console.error('[createGPSCheckoutPayment]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});