import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });
const APP_URL = "https://uridehub.com";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { host_id, host_email, host_name } = await req.json();

    if (!host_id || !host_email) {
      return Response.json({ error: "Missing host_id or host_email" }, { status: 400 });
    }

    // Check if host already has a Stripe account
    const hosts = await base44.asServiceRole.entities.Host.filter({ id: host_id });
    const host = hosts[0];

    if (!host) return Response.json({ error: "Host not found" }, { status: 404 });

    let accountId = host.stripe_account_id;

    if (!accountId) {
      // Create new Stripe Connect Express account
      const account = await stripe.accounts.create({
        type: "express",
        email: host_email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: { host_id, platform: "uride" },
      });

      accountId = account.id;

      // Store the account ID on the host record
      await base44.asServiceRole.entities.Host.update(host_id, {
        stripe_account_id: accountId,
      });

      console.log(`[StripeConnect] Created account ${accountId} for host ${host_id}`);
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${APP_URL}/host/payouts?stripe_refresh=true`,
      return_url: `${APP_URL}/host/payouts?stripe_success=true`,
      type: "account_onboarding",
    });

    return Response.json({ url: accountLink.url, account_id: accountId });
  } catch (error) {
    console.error("[StripeConnect] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});