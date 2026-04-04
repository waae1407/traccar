import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

// Charge a saved payment method off-session (for recurring billing after admin approval)
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { stripe_customer_id, payment_method_id, amount_cents, booking_request_id, description } = await req.json();

    if (!stripe_customer_id || !payment_method_id || !amount_cents) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'usd',
      customer: stripe_customer_id,
      payment_method: payment_method_id,
      confirm: true,
      off_session: true,
      description: description || 'uRide rental payment',
      metadata: { booking_request_id: booking_request_id || '' },
    });

    return Response.json({
      payment_intent_id: paymentIntent.id,
      status: paymentIntent.status,
      receipt_url: paymentIntent.charges?.data?.[0]?.receipt_url || null,
    });
  } catch (error) {
    // Handle card declined
    if (error.code === 'authentication_required' || error.code === 'card_declined') {
      return Response.json({ error: 'Card declined', code: error.code }, { status: 402 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});