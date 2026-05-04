import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Get or create Stripe customer — with stale ID recovery
    let stripeCustomerId = user.stripe_customer_id;
    if (stripeCustomerId) {
      try {
        await stripe.customers.retrieve(stripeCustomerId);
      } catch {
        console.log(`[STRIPE] Stale stripe_customer_id (${stripeCustomerId}), creating fresh customer...`);
        stripeCustomerId = null;
      }
    }
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.full_name,
        metadata: { user_id: user.id },
      });
      stripeCustomerId = customer.id;
      await base44.auth.updateMe({ stripe_customer_id: stripeCustomerId });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
    });

    return Response.json({
      client_secret: setupIntent.client_secret,
      setup_intent_id: setupIntent.id,
      stripe_customer_id: stripeCustomerId,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});