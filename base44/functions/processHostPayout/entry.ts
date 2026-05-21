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

    // Deduct platform fee before transferring — admin passes gross booking amount
    const commissionRate = host.commission_rate ?? 0.08;
    const platformFee = Math.round(amount * commissionRate * 100) / 100;
    const hostNetAmount = Math.round((amount - platformFee) * 100) / 100;
    const amountCents = Math.round(hostNetAmount * 100);

    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: "usd",
      destination: host.stripe_account_id,
      description: `UrideHub host payout — ${host.full_name} — payout ${payout_id}`,
      metadata: { host_id, payout_id, platform: "uride" },
    });

    await base44.asServiceRole.entities.HostPayout.create({
      host_id: host_id,
      host_email: host.email,
      host_name: host.full_name,
      booking_request_id: payout_id,
      gross_booking_amount: amount,
      uride_platform_fee_amount: platformFee,
      uride_platform_fee_rate: commissionRate,
      net_host_payout: hostNetAmount,
      net_payout: hostNetAmount,
      gross_collected: amount,
      platform_fee: platformFee,
      stripe_transfer_id: transfer.id,
      status: "paid",
      payout_date: new Date().toISOString().split('T')[0],
    });

    await base44.asServiceRole.entities.Host.update(host_id, {
      total_payouts: (host.total_payouts || 0) + hostNetAmount,
    });

    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: `💰 Payout Sent — $${hostNetAmount.toLocaleString()}`,
      body: `Your payout of $${hostNetAmount.toLocaleString()} has been transferred to your bank account (after ${(commissionRate * 100).toFixed(0)}% platform fee). Arrives within 2 business days.`,
      type: "payment",
    });

    console.log(`[HostPayout] ✓ Transfer ${transfer.id} — $${hostNetAmount} to ${host.stripe_account_id} (platform kept $${platformFee})`);

    await logEvent(base44, {
      event_type: 'payout.sent',
      actor_id: 'admin',
      actor_email: 'admin',
      actor_role: 'admin',
      target_entity: 'HostPayout',
      target_id: payout_id,
      host_id: host_id,
      summary: `Manual payout $${hostNetAmount} sent to ${host.full_name} (gross $${amount}, platform fee $${platformFee})`,
      metadata: { transfer_id: transfer.id, gross: amount, platform_fee: platformFee, net: hostNetAmount },
      source: 'admin_panel',
    });

    return Response.json({ success: true, transfer_id: transfer.id, amount_cents: amountCents, net: hostNetAmount, platform_fee: platformFee });
  } catch (error) {
    console.error("[HostPayout] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});