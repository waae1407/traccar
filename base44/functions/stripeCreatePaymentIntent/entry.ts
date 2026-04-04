import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { booking_request_id, amount_cents, booking_type, setup_future_usage } = await req.json();

    if (!amount_cents || amount_cents < 50) {
      return Response.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Get or create Stripe customer
    let stripeCustomerId = user.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.full_name,
        metadata: { user_id: user.id, booking_request_id: booking_request_id || '' },
      });
      stripeCustomerId = customer.id;
      await base44.auth.updateMe({ stripe_customer_id: stripeCustomerId });
    }

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'usd',
      customer: stripeCustomerId,
      setup_future_usage: setup_future_usage || 'off_session',
      metadata: {
        booking_request_id: booking_request_id || '',
        user_email: user.email,
        booking_type: booking_type || '',
      },
      automatic_payment_methods: { enabled: true },
    });

    return Response.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      stripe_customer_id: stripeCustomerId,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});