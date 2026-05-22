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
    const user = await base44.auth.me();

    if (user?.role !== "admin") {
      return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { payout_id } = await req.json();

    if (!payout_id) {
      return Response.json({ error: "Missing payout_id" }, { status: 400 });
    }

    const payouts = await base44.asServiceRole.entities.HostPayout.filter({ id: payout_id });
    const payout = payouts[0];

    if (!payout) return Response.json({ error: "Payout not found" }, { status: 404 });
    if (payout.status === "paid" || payout.stripe_transfer_id) {
      return Response.json({ error: "Duplicate prevention: payout already executed" }, { status: 409 });
    }
    if (!["pending", "processing"].includes(payout.status || "pending")) {
      return Response.json({ error: "Payout is not eligible for execution" }, { status: 400 });
    }

    const hosts = await base44.asServiceRole.entities.Host.filter({ id: payout.host_id });
    const host = hosts[0];

    if (!host) return Response.json({ error: "Host not found" }, { status: 404 });
    if (!host.stripe_account_id) return Response.json({ error: "Host has no Stripe account" }, { status: 400 });
    if (!host.stripe_onboarding_complete) return Response.json({ error: "Host has not completed Stripe onboarding" }, { status: 400 });
    if (host.payout_frozen) return Response.json({ error: "Host payouts are frozen" }, { status: 423 });

    const grossAmount = Number(payout.gross_booking_amount || payout.gross_collected || 0);
    const platformFee = Number(payout.uride_platform_fee_amount || payout.platform_fee || 0);
    const hostNetAmount = Number(payout.net_host_payout || payout.net_payout || 0);

    if (!hostNetAmount || hostNetAmount <= 0) {
      return Response.json({ error: "Invalid payout amount" }, { status: 400 });
    }

    const duplicateTransfers = await base44.asServiceRole.entities.HostPayout.filter({ stripe_transfer_id: payout.stripe_transfer_id || "__none__" });
    if (payout.stripe_transfer_id || duplicateTransfers.some((item) => item.id !== payout.id)) {
      return Response.json({ error: "Duplicate transfer risk detected" }, { status: 409 });
    }

    await base44.asServiceRole.entities.HostPayout.update(payout.id, { status: "processing" });

    const amountCents = Math.round(hostNetAmount * 100);
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: "usd",
      destination: host.stripe_account_id,
      description: `uRide certified host payout — ${host.full_name} — payout ${payout.id}`,
      metadata: {
        host_id: payout.host_id,
        payout_id: payout.id,
        booking_request_id: payout.booking_request_id || "",
        platform: "uride",
        execution_mode: "live_certified_production",
      },
    });

    await base44.asServiceRole.entities.HostPayout.update(payout.id, {
      status: "paid",
      stripe_transfer_id: transfer.id,
      payout_date: new Date().toISOString().split("T")[0],
      notes: [payout.notes, `Live certified payout executed by ${user.email}`].filter(Boolean).join("\n"),
    });

    await base44.asServiceRole.entities.Host.update(host.id, {
      total_payouts: (host.total_payouts || 0) + hostNetAmount,
    });

    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: `Payout Sent — $${hostNetAmount.toLocaleString()}`,
      body: `Your certified payout of $${hostNetAmount.toLocaleString()} has been transferred to your bank account. Arrives within 2 business days.`,
      type: "payment",
    });

    console.log(`[HostPayout] LIVE CERTIFIED ✓ Transfer ${transfer.id} — $${hostNetAmount} to ${host.stripe_account_id}`);

    await logEvent(base44, {
      event_type: "payout.sent",
      actor_id: user.id,
      actor_email: user.email,
      actor_role: "admin",
      target_entity: "HostPayout",
      target_id: payout.id,
      host_id: payout.host_id,
      booking_id: payout.booking_request_id || "",
      summary: `Live certified payout $${hostNetAmount} sent to ${host.full_name}`,
      metadata: {
        transfer_id: transfer.id,
        gross: grossAmount,
        platform_fee: platformFee,
        net: hostNetAmount,
        execution_mode: "live_certified_production",
        duplicate_prevention: true,
        rollback_safe: true,
      },
      source: "admin_panel",
    });

    return Response.json({ success: true, transfer_id: transfer.id, amount_cents: amountCents, net: hostNetAmount, platform_fee: platformFee });
  } catch (error) {
    console.error("[HostPayout] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});