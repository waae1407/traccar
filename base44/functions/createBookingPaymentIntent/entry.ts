import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
const stripe = new Stripe(stripeKey || '', { apiVersion: '2023-10-16' });

function defaultCommerceProfile(host, plan) {
  const planType = plan?.selected_mode || plan?.active_mode || 'marketplace_partner';
  const isFleetOS = planType === 'fleetos_professional';
  const isHybrid = planType === 'hybrid_growth';
  return {
    host_id: host?.id || plan?.host_id || '',
    plan_type: planType,
    marketplace_enabled: !isFleetOS,
    marketplace_visibility: !isFleetOS,
    booking_enabled: true,
    online_payments_enabled: isFleetOS ? !!host?.stripe_onboarding_complete : true,
    payment_processor: isFleetOS ? (host?.stripe_onboarding_complete && host?.stripe_account_id ? 'host_stripe' : 'reservation_only') : 'uride_stripe',
    commission_rate: isFleetOS ? 0 : isHybrid ? 0.05 : 0.08,
    subscription_rate: isFleetOS || isHybrid ? 29.99 : 0,
    stripe_account_id: host?.stripe_account_id || '',
    host_checkout_enabled: isFleetOS && !!host?.stripe_onboarding_complete && !!host?.stripe_account_id,
    contract_owner: isFleetOS ? 'host' : 'uride',
    payment_owner: isFleetOS ? 'host' : 'uride'
  };
}

async function getCommerceProfile(base44, host) {
  const profiles = await base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id: host.id }, '-updated_date', 1);
  if (profiles?.[0]) return profiles[0];
  const plans = await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id: host.id }, '-updated_date', 1);
  const fallback = defaultCommerceProfile(host, plans?.[0]);
  return base44.asServiceRole.entities.HostCommerceProfile.create(fallback);
}

async function getOrCreateCustomer(base44, stripeOptions, user, bookingId) {
  if (user.stripe_customer_id && !stripeOptions.stripeAccount) {
    try {
      await stripe.customers.retrieve(user.stripe_customer_id);
      return user.stripe_customer_id;
    } catch (_error) {
      // Create a new customer below if the saved id is stale.
    }
  }

  const customerPayload = {
    email: user.email,
    name: user.full_name || 'Customer',
    metadata: { user_id: user.id, booking_request_id: bookingId || 'none' }
  };
  const customer = stripeOptions.stripeAccount
    ? await stripe.customers.create(customerPayload, stripeOptions)
    : await stripe.customers.create(customerPayload);

  if (!stripeOptions.stripeAccount) await base44.auth.updateMe({ stripe_customer_id: customer.id });
  return customer.id;
}

Deno.serve(async (req) => {
  try {
    if (!stripeKey) return Response.json({ error: 'Stripe configuration error: missing API key' }, { status: 500 });

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { booking_request_id, amount_cents, booking_type, setup_future_usage, payment_flow } = await req.json();
    if (!booking_request_id) return Response.json({ error: 'Missing booking_request_id' }, { status: 400 });
    if (!Number.isInteger(amount_cents) || amount_cents < 50) return Response.json({ error: 'Invalid amount' }, { status: 400 });

    const booking = await base44.asServiceRole.entities.BookingRequest.get(booking_request_id);
    if (!booking) return Response.json({ error: 'Booking not found' }, { status: 404 });
    if (user.role !== 'admin' && booking.user_email !== user.email && booking.user_id !== user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const vehicle = booking.vehicle_id ? await base44.asServiceRole.entities.Vehicle.get(booking.vehicle_id) : null;
    const hostId = booking.host_id || vehicle?.host_id;
    if (!hostId) return Response.json({ error: 'Booking is missing host assignment' }, { status: 400 });
    if (!booking.host_id && hostId) await base44.asServiceRole.entities.BookingRequest.update(booking.id, { host_id: hostId });

    const host = await base44.asServiceRole.entities.Host.get(hostId);
    if (!host) return Response.json({ error: 'Host not found' }, { status: 404 });

    const commerce = await getCommerceProfile(base44, host);
    if (!commerce.booking_enabled) return Response.json({ error: 'Booking is disabled for this host' }, { status: 400 });

    const processor = commerce.online_payments_enabled ? commerce.payment_processor : 'manual_invoice';
    if (processor === 'manual_invoice' || processor === 'reservation_only') {
      return Response.json({ processor, reservation_request_only: true, message: 'Online payment is not enabled. Submit a reservation request instead.' });
    }
    if (!['uride_stripe', 'host_stripe'].includes(processor)) {
      return Response.json({ error: `Payment processor ${processor} is not active yet` }, { status: 400 });
    }

    const stripeOptions = processor === 'host_stripe' ? { stripeAccount: commerce.stripe_account_id || host.stripe_account_id } : {};
    if (processor === 'host_stripe' && !stripeOptions.stripeAccount) return Response.json({ error: 'Host Stripe is not connected' }, { status: 400 });

    const customerId = await getOrCreateCustomer(base44, stripeOptions, user, booking_request_id);
    const isRecovery = payment_flow === 'recovery';
    const piPayload = {
      amount: amount_cents,
      currency: 'usd',
      customer: customerId,
      setup_future_usage: setup_future_usage || 'off_session',
      metadata: {
        billing_context: isRecovery ? 'payment_recovery_customer_self_service' : processor === 'host_stripe' ? 'fleetos_host_direct_payment' : 'rental_marketplace_payment',
        payment_flow: isRecovery ? 'recovery' : 'initial_checkout',
        original_booking_id: booking.id,
        booking_request_id,
        host_id: hostId,
        user_email: user.email,
        booking_type: booking_type || booking.booking_type || 'unknown',
        payment_processor: processor,
        commission_rate: String(commerce.commission_rate || 0)
      },
      payment_method_types: ['card']
    };
    const paymentIntent = stripeOptions.stripeAccount
      ? await stripe.paymentIntents.create(piPayload, stripeOptions)
      : await stripe.paymentIntents.create(piPayload);

    await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
      stripe_payment_intent_id: paymentIntent.id,
      stripe_customer_id: customerId,
      payment_status: 'pending'
    });

    return Response.json({
      processor,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      stripe_customer_id: customerId,
      stripe_account_id: stripeOptions.stripeAccount || null,
      commission_rate: commerce.commission_rate || 0
    });
  } catch (error) {
    console.error('[CreateBookingPaymentIntent] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});