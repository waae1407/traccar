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

    // 1. Load product server-side (authoritative pricing source)
    const products = await base44.asServiceRole.entities.GPSProduct.filter({ package_type, is_active: true });
    const product = products[0];

    // 2. Access control: Fleet Partner Kit — full 6-check server-side enforcement
    if (package_type === 'host_contactless_kit') {
      const deny = (reason, message) => {
        // Log denied attempt
        base44.asServiceRole.entities.ActivityEvent.create({
          event_type: 'fleet_partner_kit_ineligible',
          actor_id: user?.id || 'guest',
          actor_email: user?.email || customer_email,
          actor_role: 'guest',
          target_entity: 'GPSOrder',
          target_label: 'fleet_partner_kit',
          summary: `Fleet Partner Kit denied: ${reason} — ${message}`,
          metadata: {
            user_email: user?.email || customer_email,
            reason,
            message,
            package_type,
            source_page: 'checkout',
            timestamp: new Date().toISOString(),
          },
          source: 'system',
          event_status: 'completed',
        }).catch(() => {});
        return Response.json({
          error: message,
          error_code: 'FLEET_PARTNER_KIT_NOT_ELIGIBLE',
          reason,
        }, { status: 403 });
      };

      // Check 1: authenticated
      if (!user) return deny('NOT_LOGGED_IN', 'Please log in as an approved Fleet Partner to purchase this kit.');

      // Check 2: host record exists
      const [hostsByEmail, hostsByUser] = await Promise.all([
        base44.asServiceRole.entities.Host.filter({ email: user.email }),
        base44.asServiceRole.entities.Host.filter({ user_id: user.id }),
      ]);
      const fleetHost = hostsByEmail[0] || hostsByUser[0];
      if (!fleetHost) return deny('NOT_HOST', 'This kit is only for approved uRide Fleet Partners. Please register as a host first.');

      // Check 3: host approved
      if (fleetHost.status !== 'approved') return deny('HOST_NOT_APPROVED', 'Your host account must be approved before purchasing the Fleet Partner Expansion Kit.');

      // Check 4: active vehicle
      const activeVehicles = await base44.asServiceRole.entities.Vehicle.filter({ host_id: fleetHost.id });
      const activeVehicleCount = activeVehicles.filter(v => !['Retired', 'Out of Service'].includes(v.status)).length;
      if (activeVehicleCount < 1) return deny('NO_ACTIVE_VEHICLE', 'You must have at least one active vehicle to use the Fleet Partner Expansion Kit.');

      // Check 5: active telematics device
      const activeDevices = await base44.asServiceRole.entities.TelematicsDevice.filter({ host_id: fleetHost.id });
      const activeTelematicsCount = activeDevices.filter(d => ['activated', 'partially_activated'].includes(d.activation_status)).length;
      if (activeTelematicsCount < 1) return deny('NO_ACTIVE_TELEMATICS_DEVICE', 'The Fleet Partner Expansion Kit requires at least one active Contactless360 device already installed. Please complete your first device setup first.');

      // Check 6: active GPS subscription
      const activeGPSSubs = await base44.asServiceRole.entities.GPSSubscription.filter({ host_id: fleetHost.id });
      const activeSubCount = activeGPSSubs.filter(s => ['active', 'trialing'].includes(s.subscription_status)).length;
      if (activeSubCount < 1) return deny('FIRST_DEVICE_SETUP_REQUIRED', 'The Fleet Partner Expansion Kit is only available after your first Contactless360 subscription is active.');

      // Log eligible access
      base44.asServiceRole.entities.ActivityEvent.create({
        event_type: 'fleet_partner_kit_eligible',
        actor_id: user.id,
        actor_email: user.email,
        actor_role: 'host',
        target_entity: 'GPSOrder',
        target_label: 'fleet_partner_kit',
        host_id: fleetHost.id,
        summary: `Fleet Partner Kit eligibility confirmed for ${user.email}`,
        metadata: {
          host_id: fleetHost.id,
          active_vehicle_count: activeVehicleCount,
          active_telematics_count: activeTelematicsCount,
          active_gps_subscription_count: activeSubCount,
          package_type,
          source_page: 'checkout',
          timestamp: new Date().toISOString(),
        },
        source: 'system',
        event_status: 'completed',
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
      // Fallback — only used if no product record exists
      priceSource = 'fallback';
      const FALLBACK = {
        device_only: { price: 149, shipping: 9.99, activation: 0, sub: 0 },
        device_subscription: { price: 149, shipping: 0, activation: 0, sub: 14.99 },
        host_contactless_kit: { price: 179, shipping: 0, activation: 0, sub: 14.99 },
      };
      const fb = FALLBACK[package_type] || FALLBACK.device_subscription;
      msrpUnitPrice = fb.price;
      saleUnitPrice = fb.price;
      unitPrice = fb.price;
      discountPerUnit = 0;
      discountLabel = '';
      shippingAmount = fb.shipping;
      activationFee = fb.activation;
      monthlySubPrice = fb.sub;
      productName = package_type.replace(/_/g, ' ');
      eligibleOwnerType = 'all';
      fleetPartnerDiscountApplied = false;
    }

    const qty = Math.max(1, Number(quantity));
    const totalDiscountAmount = Math.round(discountPerUnit * qty * 100) / 100;
    const subtotal = Math.round(unitPrice * qty * 100) / 100;
    const totalAmount = Math.round((subtotal + shippingAmount + activationFee) * 100) / 100;

    // 4. Determine owner context
    let hostId = null;
    let customerUserId = null;
    let orderOwnerType = 'guest';
    let fleetPartnerHostId = '';

    if (user) {
      customerUserId = user.id;
      orderOwnerType = 'customer';
      const [hostsByEmail, hostsByUser] = await Promise.all([
        base44.asServiceRole.entities.Host.filter({ email: user.email }),
        base44.asServiceRole.entities.Host.filter({ user_id: user.id }),
      ]);
      const host = hostsByEmail[0] || hostsByUser[0];
      if (host) {
        hostId = host.id;
        orderOwnerType = 'host';
        if (fleetPartnerDiscountApplied) fleetPartnerHostId = host.id;
      }
    }

    // 5. Create GPSOrder with full pricing breakdown
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

    // 6. Create Stripe customer
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

    // 7. Create Stripe PaymentIntent — amount is sale price, never MSRP
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // based on sale_price
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

    // 8. Store Stripe IDs on order
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
      // Pricing breakdown for frontend display
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