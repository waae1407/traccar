import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });

async function logEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: data.actor_id || 'admin',
      actor_email: data.actor_email || 'admin',
      actor_role: data.actor_role || 'admin',
      target_entity: data.target_entity || '',
      target_id: data.target_id || '',
      host_id: data.host_id || '',
      booking_id: data.booking_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: data.source || 'admin_panel',
      user_email: data.actor_email || 'admin',
      event_title: data.summary || data.event_type,
      event_status: 'success',
    });
  } catch (e) {
    console.error('[AuditLog]', e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { payout_id, host_id, amount } = await req.json();

    if (!host_id || !amount || !payout_id) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const hosts = await base44.asServiceRole.entities.Host.filter({ id: host_id });
    const host = hosts[0];

    if (!host) return Response.json({ error: "Host not found" }, { status: 404 });
    if (!host.stripe_account_id) return Response.json({ error: "Host has no Stripe account" }, { status: 400 });
    if (!host.stripe_onboarding_complete) return Response.json({ error: "Host has not completed Stripe onboarding" }, { status: 400 });

    const amountCents = Math.round(amount * 100);

    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: "usd",
      destination: host.stripe_account_id,
      description: `UrideHub host payout — ${host.full_name} — payout ${payout_id}`,
      metadata: { host_id, payout_id, platform: "uride" },
    });

    await base44.asServiceRole.entities.Host.update(host_id, {
      total_payouts: (host.total_payouts || 0) + amount,
    });

    const commissionRate = host.commission_rate ?? 0.08;
    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: `💰 Payout Sent — $${amount.toLocaleString()}`,
      body: `Your payout of $${amount.toLocaleString()} has been transferred to your bank account. Uride Platform Fee: ${(commissionRate * 100).toFixed(0)}%. Arrives within 2 business days.`,
      type: "payment",
    });

    console.log(`[HostPayout] ✓ Transfer ${transfer.id} — $${amount} to ${host.stripe_account_id}`);

    await logEvent(base44, {
      event_type: 'payout.sent',
      actor_id: user?.id || 'admin',
      actor_email: user?.email || 'admin',
      actor_role: 'admin',
      target_entity: 'HostPayout',
      target_id: payout_id,
      host_id: host_id,
      summary: `Manual payout $${amount} sent to ${host.full_name} (${host.email})`,
      metadata: { transfer_id: transfer.id, amount, host_name: host.full_name },
      source: 'admin_panel',
    });

    return Response.json({ success: true, transfer_id: transfer.id, amount_cents: amountCents });
  } catch (error) {
    console.error("[HostPayout] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});