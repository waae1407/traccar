import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { payout_id, host_id, amount } = await req.json();

    if (!host_id || !amount || !payout_id) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get host Stripe account
    const hosts = await base44.asServiceRole.entities.Host.filter({ id: host_id });
    const host = hosts[0];

    if (!host) return Response.json({ error: "Host not found" }, { status: 404 });
    if (!host.stripe_account_id) return Response.json({ error: "Host has no Stripe account" }, { status: 400 });
    if (!host.stripe_onboarding_complete) return Response.json({ error: "Host has not completed Stripe onboarding" }, { status: 400 });

    const amountCents = Math.round(amount * 100);

    // Create Stripe transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: "usd",
      destination: host.stripe_account_id,
      description: `uRide host payout - ${host.full_name} - payout ${payout_id}`,
      metadata: { host_id, payout_id, platform: "uride" },
    });

    // Update host total payouts
    await base44.asServiceRole.entities.Host.update(host_id, {
      total_payouts: (host.total_payouts || 0) + amount,
    });

    // Notify host
    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: `💰 Payout Sent — $${amount.toLocaleString()}`,
      body: `Your payout of $${amount.toLocaleString()} has been transferred to your bank account. It will arrive within 2 business days.`,
      type: "payment",
    });

    console.log(`[HostPayout] ✓ Transfer ${transfer.id} — $${amount} to ${host.stripe_account_id}`);
    return Response.json({ success: true, transfer_id: transfer.id, amount_cents: amountCents });
  } catch (error) {
    console.error("[HostPayout] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});