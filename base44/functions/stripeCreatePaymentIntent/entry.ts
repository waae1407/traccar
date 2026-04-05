import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.21.0';

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
if (!stripeKey) {
  console.error('[STRIPE] STRIPE_SECRET_KEY environment variable is not set');
}
const stripe = new Stripe(stripeKey);

Deno.serve(async (req) => {
  try {
    // Verify Stripe API key is configured
    if (!stripeKey) {
      console.error('[STRIPE] STRIPE_SECRET_KEY is missing');
      return Response.json({ error: 'Stripe configuration error: missing API key' }, { status: 500 });
    }

    // Get authenticated user
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      console.error('[STRIPE] User is not authenticated');
      return Response.json({ error: 'Unauthorized: user not authenticated' }, { status: 401 });
    }
    console.log(`[STRIPE] User authenticated: ${user.email}`);

    // Parse request payload
    let payload;
    try {
      payload = await req.json();
    } catch (parseErr) {
      console.error('[STRIPE] Failed to parse request JSON:', parseErr.message);
      return Response.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    const { booking_request_id, amount_cents, booking_type, setup_future_usage } = payload;
    console.log(`[STRIPE] Request: booking_request_id=${booking_request_id}, amount_cents=${amount_cents}, booking_type=${booking_type}`);

    // Validate amount
    if (!Number.isInteger(amount_cents) || amount_cents < 50) {
      console.error(`[STRIPE] Invalid amount: ${amount_cents} (must be integer >= 50 cents)`);
      return Response.json({ 
        error: `Invalid amount: $${(amount_cents / 100).toFixed(2)}. Minimum is $0.50.` 
      }, { status: 400 });
    }

    // Get or create Stripe customer
    let stripeCustomerId = user.stripe_customer_id;
    if (!stripeCustomerId) {
      console.log(`[STRIPE] No existing stripe_customer_id for user ${user.email}. Creating new customer...`);
      try {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.full_name || 'Unknown',
          metadata: { 
            user_id: user.id, 
            booking_request_id: booking_request_id || 'none' 
          },
        });
        stripeCustomerId = customer.id;
        console.log(`[STRIPE] Created Stripe customer: ${stripeCustomerId}`);
        
        // Save to user profile
        await base44.auth.updateMe({ stripe_customer_id: stripeCustomerId });
        console.log(`[STRIPE] Saved stripe_customer_id to user profile`);
      } catch (customerErr) {
        console.error(`[STRIPE] Failed to create/fetch customer:`, customerErr.message);
        return Response.json({ 
          error: `Stripe customer creation failed: ${customerErr.message}` 
        }, { status: 500 });
      }
    } else {
      console.log(`[STRIPE] Using existing stripe_customer_id: ${stripeCustomerId}`);
    }

    // Create PaymentIntent
    console.log(`[STRIPE] Creating PaymentIntent: amount=${amount_cents} cents, currency=usd`);
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amount_cents,
        currency: 'usd',
        customer: stripeCustomerId,
        setup_future_usage: setup_future_usage || 'off_session',
        metadata: {
          booking_request_id: booking_request_id || 'none',
          user_email: user.email,
          booking_type: booking_type || 'unknown',
        },
        payment_method_types: ["card"],
      });
      console.log(`[STRIPE] PaymentIntent created successfully: ${paymentIntent.id}`);
    } catch (piErr) {
      console.error(`[STRIPE] Failed to create PaymentIntent:`, piErr.message);
      return Response.json({ 
        error: `PaymentIntent creation failed: ${piErr.message}` 
      }, { status: 500 });
    }

    // Validate response
    if (!paymentIntent.client_secret) {
      console.error(`[STRIPE] PaymentIntent missing client_secret!`);
      return Response.json({ error: 'PaymentIntent created but missing client_secret' }, { status: 500 });
    }

    console.log(`[STRIPE] Returning successful response with client_secret`);
    return Response.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      stripe_customer_id: stripeCustomerId,
    });
  } catch (error) {
    console.error(`[STRIPE] Unexpected error:`, error.message);
    return Response.json({ 
      error: `Unexpected error: ${error.message}` 
    }, { status: 500 });
  }
});