import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });

// Charge a saved payment method off-session through the shared payment adapter.
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

    let processor = 'uride_stripe';
    let stripeOptions = {};
    let hostId = '';

    if (booking_request_id) {
      const booking = await base44.asServiceRole.entities.BookingRequest.get(booking_request_id);
      hostId = booking?.host_id || '';
      if (hostId) {
        const profiles = await base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id: hostId }, '-updated_date', 1);
        const profile = profiles?.[0];
        if (profile?.payment_processor === 'host_stripe' && profile?.stripe_account_id && profile?.online_payments_enabled) {
          processor = 'host_stripe';
          stripeOptions = { stripeAccount: profile.stripe_account_id };
        }
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'usd',
      customer: stripe_customer_id,
      payment_method: payment_method_id,
      confirm: true,
      off_session: true,
      description: description || (processor === 'host_stripe' ? 'Host rental payment' : 'uRide rental payment'),
      metadata: { billing_context: processor === 'host_stripe' ? 'fleetos_host_direct_payment' : 'rental_marketplace_payment', booking_request_id: booking_request_id || '', host_id: hostId, payment_processor: processor },
    }, stripeOptions);

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