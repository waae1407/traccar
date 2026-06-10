/**
 * processHostPayout
 *
 * Executes a single HostPayout record as a live Stripe transfer,
 * with MANDATORY wallet offset engine applied BEFORE transfer.
 *
 * WALLET OFFSET ENGINE (v2 — 2026-06-10):
 *   1. Load open/partially_paid HostReceivables for host (FIFO by created_at)
 *   2. Calculate total wallet balance owed
 *   3. Deduct FIFO from payout net amount
 *   4. Write offset fields to HostPayout
 *   5. Mark each receivable offset_applied / partially_paid
 *   6. Only then execute Stripe transfer for remaining net
 *   7. Skip transfer if post-offset net is $0
 *   8. Notify host with context-aware message
 *
 * Params:
 *   payout_id  — required, HostPayout record to process
 *   dry_run    — optional (default false), simulate without writing or transferring
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

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
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== "admin") {
      return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { payout_id, dry_run = false } = body;

    if (!payout_id) {
      return Response.json({ error: "Missing payout_id" }, { status: 400 });
    }

    // ── 1. Load Payout ──────────────────────────────────────────────────────
    const payouts = await base44.asServiceRole.entities.HostPayout.filter({ id: payout_id });
    const payout = payouts[0];

    if (!payout) return Response.json({ error: "Payout not found" }, { status: 404 });
    if (payout.status === "paid" || payout.stripe_transfer_id) {
      return Response.json({ error: "Duplicate prevention: payout already executed" }, { status: 409 });
    }
    if (!["pending", "processing"].includes(payout.status || "pending")) {
      return Response.json({ error: "Payout is not eligible for execution" }, { status: 400 });
    }

    // ── OPTION C GUARD: Reject orphaned payouts (no Stripe backing) ──────────
    // A HostPayout must have either a stripe_payment_intent_id (weekly autopay)
    // or a booking_request_id (initial checkout). If neither exists, this is an
    // orphan created before Stripe confirmed — block execution and auto-void it.
    if (!payout.stripe_payment_intent_id && !payout.booking_request_id) {
      await base44.asServiceRole.entities.HostPayout.update(payout.id, {
        status: 'failed',
        hold_reason: 'admin_override',
        hold_notes: `AUTO-VOIDED by processHostPayout: No stripe_payment_intent_id and no booking_request_id. This payout has no Stripe backing and cannot be transferred. Likely created before Stripe confirmed payment. Correct accounting should be in HostReceivable + PaymentLog.`,
        held_at: new Date().toISOString(),
        held_by: 'processHostPayout_guard',
      }).catch(e => console.error('[HostPayout] auto-void failed:', e.message));
      return Response.json({ error: "Rejected: orphaned payout with no Stripe PaymentIntent or booking reference. Payout has been auto-voided. Check HostReceivable for correct accounting." }, { status: 422 });
    }

    // ── 2. Load Host ─────────────────────────────────────────────────────────
    const hosts = await base44.asServiceRole.entities.Host.filter({ id: payout.host_id });
    const host = hosts[0];

    if (!host) return Response.json({ error: "Host not found" }, { status: 404 });
    if (!host.stripe_account_id) return Response.json({ error: "Host has no Stripe account" }, { status: 400 });
    if (!host.stripe_onboarding_complete) return Response.json({ error: "Host has not completed Stripe onboarding" }, { status: 400 });
    if (host.payout_frozen) return Response.json({ error: "Host payouts are frozen" }, { status: 423 });

    const grossAmount = Number(payout.gross_booking_amount || payout.gross_collected || 0);
    const platformFee = Number(payout.uride_platform_fee_amount || payout.platform_fee || 0);
    const originalNetAmount = Number(payout.net_host_payout || payout.net_payout || 0);

    if (!originalNetAmount || originalNetAmount <= 0) {
      return Response.json({ error: "Invalid payout amount" }, { status: 400 });
    }

    // ── 3. Duplicate Transfer Guard ──────────────────────────────────────────
    if (payout.stripe_transfer_id) {
      return Response.json({ error: "Duplicate transfer risk: transfer ID already present" }, { status: 409 });
    }

    // ── 4. Load Open HostReceivables (FIFO by created_at) ────────────────────
    const allReceivables = await base44.asServiceRole.entities.HostReceivable.filter(
      { host_id: payout.host_id },
      'created_at',
      100
    );

    const openReceivables = allReceivables.filter(r =>
      ['open', 'partially_paid'].includes(r.status) &&
      r.offset_from_future_payouts !== false
    );

    // Sort FIFO: oldest first
    openReceivables.sort((a, b) => new Date(a.created_at || a.created_date) - new Date(b.created_at || b.created_date));

    const totalWalletBalance = openReceivables.reduce((sum, r) => sum + Number(r.remaining_amount || r.platform_fee_amount_due || 0), 0);
    const roundTo2 = (n) => Math.round(n * 100) / 100;

    // ── 5. FIFO Offset Calculation ───────────────────────────────────────────
    let remainingOffsetBudget = Math.min(totalWalletBalance, originalNetAmount);
    let totalOffsetApplied = 0;
    const offsetDetails = [];
    const receivablesToUpdate = [];

    for (const receivable of openReceivables) {
      if (remainingOffsetBudget <= 0) break;

      const amountDue = Number(receivable.remaining_amount || receivable.platform_fee_amount_due || 0);
      if (amountDue <= 0) continue;

      const offsetThisRecord = Math.min(amountDue, remainingOffsetBudget);
      const newRemaining = roundTo2(amountDue - offsetThisRecord);
      const newStatus = newRemaining <= 0 ? 'offset_applied' : 'partially_paid';

      offsetDetails.push({
        receivable_id: receivable.id,
        amount_due: amountDue,
        offset_applied: offsetThisRecord,
        remaining_after: newRemaining,
        new_status: newStatus,
        booking_request_id: receivable.booking_request_id,
        description: receivable.description,
      });

      receivablesToUpdate.push({
        id: receivable.id,
        status: newStatus,
        remaining_amount: newRemaining,
        recovered_amount: roundTo2((Number(receivable.recovered_amount) || 0) + offsetThisRecord),
        offset_host_payout_id: payout.id,
        resolved_at: newStatus === 'offset_applied' ? new Date().toISOString() : undefined,
        resolved_by: user.email,
        resolution_method: 'payout_offset',
        last_recovery_at: new Date().toISOString(),
        wallet_debit_amount: receivable.wallet_debit_amount || amountDue,
        wallet_effect: 'debit',
      });

      totalOffsetApplied = roundTo2(totalOffsetApplied + offsetThisRecord);
      remainingOffsetBudget = roundTo2(remainingOffsetBudget - offsetThisRecord);
    }

    const netAfterOffset = roundTo2(originalNetAmount - totalOffsetApplied);
    const walletBalanceAfter = roundTo2(totalWalletBalance - totalOffsetApplied);
    const offsetReceivableIds = receivablesToUpdate.map(r => r.id);
    const balanceFullyCleared = walletBalanceAfter <= 0;

    // ── 6. DRY RUN: Return simulation without writing ────────────────────────
    if (dry_run) {
      return Response.json({
        dry_run: true,
        payout_id,
        host_id: payout.host_id,
        host_email: host.email,
        host_name: host.full_name,
        gross_booking_amount: grossAmount,
        original_net_payout: originalNetAmount,
        wallet_balance_before: totalWalletBalance,
        total_offset_applied: totalOffsetApplied,
        net_payout_after_offset: netAfterOffset,
        wallet_balance_after: walletBalanceAfter,
        balance_fully_cleared: balanceFullyCleared,
        stripe_transfer_would_send: netAfterOffset > 0,
        stripe_transfer_amount: netAfterOffset > 0 ? netAfterOffset : 0,
        open_receivables_found: openReceivables.length,
        receivables_offset: offsetDetails,
        receivables_to_update: receivablesToUpdate.length,
        note: "DRY RUN — no data written, no Stripe transfer sent.",
      });
    }

    // ── 7. Mark Payout as Processing ─────────────────────────────────────────
    await base44.asServiceRole.entities.HostPayout.update(payout.id, { status: "processing" });

    // ── 8. Execute Stripe Transfer (only if net > 0) ──────────────────────────
    let transferId = null;
    let amountCents = 0;

    if (netAfterOffset > 0) {
      amountCents = Math.round(netAfterOffset * 100);
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: "usd",
        destination: host.stripe_account_id,
        description: `uRide host payout — ${host.full_name} — payout ${payout.id}${totalOffsetApplied > 0 ? ` (after $${totalOffsetApplied} wallet offset)` : ''}`,
        metadata: {
          host_id: payout.host_id,
          payout_id: payout.id,
          booking_request_id: payout.booking_request_id || "",
          platform: "uride",
          wallet_offset_applied: String(totalOffsetApplied),
          execution_mode: "live_certified_production",
        },
      });
      transferId = transfer.id;
      console.log(`[HostPayout] LIVE CERTIFIED ✓ Transfer ${transferId} — $${netAfterOffset} to ${host.stripe_account_id} (offset: $${totalOffsetApplied})`);
    } else {
      console.log(`[HostPayout] Full offset — $${totalOffsetApplied} withheld. Net = $0. No Stripe transfer.`);
    }

    // ── 9. Update HostPayout with Offset Fields ────────────────────────────────
    await base44.asServiceRole.entities.HostPayout.update(payout.id, {
      status: netAfterOffset > 0 ? "paid" : "paid",
      stripe_transfer_id: transferId,
      payout_date: new Date().toISOString().split("T")[0],
      gross_host_payout_before_offset: originalNetAmount,
      wallet_offset_amount: totalOffsetApplied,
      net_host_payout_after_offset: netAfterOffset,
      offset_receivable_ids: offsetReceivableIds,
      wallet_balance_after: walletBalanceAfter,
      receivable_offset_amount: totalOffsetApplied,
      notes: [
        payout.notes,
        `Payout processed by ${user.email}.`,
        totalOffsetApplied > 0
          ? `Wallet offset: $${totalOffsetApplied} withheld to clear ${receivablesToUpdate.length} uRide fee receivable(s). Net sent: $${netAfterOffset}.`
          : 'No wallet offset — balance was $0.',
        transferId ? `Stripe transfer: ${transferId}.` : 'No Stripe transfer — full amount withheld as offset.',
      ].filter(Boolean).join('\n'),
    });

    // ── 10. Mark HostReceivables as Offset Applied ────────────────────────────
    for (const update of receivablesToUpdate) {
      const { id, ...fields } = update;
      await base44.asServiceRole.entities.HostReceivable.update(id, fields);
    }

    // ── 11. Update Host Total Payouts ─────────────────────────────────────────
    await base44.asServiceRole.entities.Host.update(host.id, {
      total_payouts: (host.total_payouts || 0) + netAfterOffset,
    });

    // ── 12. Context-Aware Host Notification ──────────────────────────────────
    let notifTitle, notifBody;
    if (totalOffsetApplied > 0 && balanceFullyCleared) {
      notifTitle = `Payout Sent — $${netAfterOffset.toLocaleString()} (uRide Fee Balance Cleared)`;
      notifBody = `Your payout of $${netAfterOffset.toLocaleString()} has been sent. A $${totalOffsetApplied.toLocaleString()} uRide fee balance has been fully cleared from this payout. Your uRide fee balance is now $0.`;
    } else if (totalOffsetApplied > 0) {
      notifTitle = `Payout Sent — $${netAfterOffset.toLocaleString()} (Partial Fee Offset Applied)`;
      notifBody = `Your payout of $${netAfterOffset.toLocaleString()} has been sent. $${totalOffsetApplied.toLocaleString()} was withheld toward your uRide fee balance. Remaining balance: $${walletBalanceAfter.toLocaleString()}.`;
    } else if (netAfterOffset <= 0) {
      notifTitle = `Payout Withheld — uRide Fee Balance Applied`;
      notifBody = `Your full payout of $${originalNetAmount.toLocaleString()} was applied toward your outstanding uRide fee balance of $${totalWalletBalance.toLocaleString()}. No transfer was sent. Remaining balance: $${walletBalanceAfter.toLocaleString()}.`;
    } else {
      notifTitle = `Payout Sent — $${netAfterOffset.toLocaleString()}`;
      notifBody = `Your payout of $${netAfterOffset.toLocaleString()} has been transferred to your bank account. Arrives within 2 business days.`;
    }

    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: notifTitle,
      body: notifBody,
      type: "payment",
    });

    // ── 13. ActivityEvent ─────────────────────────────────────────────────────
    await logEvent(base44, {
      event_type: "payout.sent",
      actor_id: user.id,
      actor_email: user.email,
      actor_role: "admin",
      target_entity: "HostPayout",
      target_id: payout.id,
      host_id: payout.host_id,
      booking_id: payout.booking_request_id || "",
      summary: `Payout $${netAfterOffset} sent to ${host.full_name}. Wallet offset: $${totalOffsetApplied}.`,
      metadata: {
        transfer_id: transferId,
        gross: grossAmount,
        platform_fee: platformFee,
        original_net: originalNetAmount,
        wallet_offset: totalOffsetApplied,
        net_after_offset: netAfterOffset,
        wallet_balance_after: walletBalanceAfter,
        offset_receivable_ids: offsetReceivableIds,
        execution_mode: "live_certified_production",
      },
      source: "admin_panel",
    });

    return Response.json({
      success: true,
      transfer_id: transferId,
      amount_cents: amountCents,
      gross_booking_amount: grossAmount,
      original_net_payout: originalNetAmount,
      wallet_offset_applied: totalOffsetApplied,
      net_payout_after_offset: netAfterOffset,
      wallet_balance_after: walletBalanceAfter,
      balance_fully_cleared: balanceFullyCleared,
      receivables_offset: offsetDetails,
      platform_fee: platformFee,
    });

  } catch (error) {
    console.error("[HostPayout] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});