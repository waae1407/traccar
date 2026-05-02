import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { host_id } = await req.json();
    const hosts = await base44.asServiceRole.entities.Host.filter({ id: host_id });
    const host = hosts[0];

    if (!host) return Response.json({ error: "Host not found" }, { status: 404 });
    if (!host.stripe_account_id) return Response.json({ connected: false, onboarding_complete: false });

    const account = await stripe.accounts.retrieve(host.stripe_account_id);
    const onboardingComplete = account.details_submitted && account.charges_enabled && account.payouts_enabled;

    // Sync status to our DB if it changed
    if (onboardingComplete && !host.stripe_onboarding_complete) {
      await base44.asServiceRole.entities.Host.update(host_id, { stripe_onboarding_complete: true });
    }

    return Response.json({
      connected: true,
      onboarding_complete: onboardingComplete,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    });
  } catch (error) {
    console.error("[StripeConnectStatus] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});