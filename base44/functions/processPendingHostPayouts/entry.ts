import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });

async function logEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: 'automation',
      actor_email: 'system',
      actor_role: 'automation',
      target_entity: data.target_entity || 'HostPayout',
      target_id: data.target_id || '',
      host_id: data.host_id || '',
      booking_id: data.booking_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: 'automation',
      event_status: data.event_status || 'success',
    });
  } catch (_) { /* best-effort audit */ }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const now = new Date();
    const results = { processed: 0, succeeded: 0, failed: 0, skipped: 0, details: [] };

    // Find all pending payouts whose 48-hour reserve window has passed
    const pendingPayouts = await base44.asServiceRole.entities.HostPayout.filter({
      status: 'pending',
      hold_reason: 'reserve_window',
    }, '-created_date', 50);

    for (const payout of pendingPayouts) {
      results.details.push({ id: payout.id, host_name: payout.host_name, net: payout.net_host_payout });

      // ── Resolve release_after dynamically from confirmed pickup ──
      // The 48-hour chargeback hold starts at pickup_completed_at, not at payment.
      // If pickup hasn't happened within 7 days of payment, fall back to payment + 48h.
      let releaseAfter = payout.release_after ? new Date(payout.release_after) : null;

      if (!releaseAfter && payout.booking_request_id) {
        const bookingRecords = await base44.asServiceRole.entities.BookingRequest.filter({ id: payout.booking_request_id });
        const booking = bookingRecords[0];
        const pickupAt = booking?.pickup_completed_at || booking?.pickup_submitted_at;

        if (pickupAt) {
          // Pickup confirmed — hold starts now, releases in 48 hours
          releaseAfter = new Date(new Date(pickupAt).getTime() + 48 * 60 * 60 * 1000);
          await base44.asServiceRole.entities.HostPayout.update(payout.id, {
            release_after: releaseAfter.toISOString(),
          });
        } else {
          // No pickup yet — check 7-day fallback from payout creation
          const payoutCreated = payout.created_date ? new Date(payout.created_date) : null;
          if (payoutCreated && (now.getTime() - payoutCreated.getTime()) > 7 * 24 * 60 * 60 * 1000) {
            // 7 days passed without pickup — fall back to payment + 48h
            releaseAfter = new Date(payoutCreated.getTime() + 48 * 60 * 60 * 1000);
            await base44.asServiceRole.entities.HostPayout.update(payout.id, {
              release_after: releaseAfter.toISOString(),
              hold_notes: 'Fallback: no pickup within 7 days, releasing based on payment date.',
            });
          }
        }
      }

      if (!releaseAfter) {
        results.skipped++;
        continue;
      }
      if (releaseAfter > now) {
        results.skipped++;
        continue;
      }

      // Verify the booking has no open disputes or chargebacks
      if (payout.booking_request_id) {
        const disputes = await base44.asServiceRole.entities.Dispute.filter({
          booking_request_id: payout.booking_request_id,
        });
        const openDispute = disputes.find(d => !['resolved_customer_favor', 'resolved_host_favor', 'closed', 'rejected'].includes(d.status));
        if (openDispute) {
          await base44.asServiceRole.entities.HostPayout.update(payout.id, {
            status: 'held',
            hold_reason: 'dispute',
            hold_notes: `Payout held: open dispute ${openDispute.id} — ${openDispute.dispute_type}`,
          });
          await logEvent(base44, {
            event_type: 'payout.held',
            target_id: payout.id,
            host_id: payout.host_id,
            booking_id: payout.booking_request_id,
            summary: `Payout ${payout.id} held due to open dispute`,
            metadata: { dispute_id: openDispute.id, net: payout.net_host_payout },
            event_status: 'warning',
          });
          results.skipped++;
          continue;
        }
      }

      // Verify host Stripe account is still active
      const hostRecords = await base44.asServiceRole.entities.Host.filter({ id: payout.host_id }, '-updated_date', 1);
      const host = hostRecords[0];
      if (!host?.stripe_account_id || !host?.stripe_onboarding_complete) {
        await base44.asServiceRole.entities.HostPayout.update(payout.id, {
          status: 'held',
          hold_reason: 'compliance',
          hold_notes: 'Host Stripe account not connected or onboarding incomplete',
        });
        results.skipped++;
        continue;
      }

      // Create the Stripe transfer now that the hold window has passed
      const transferAmount = Math.round((payout.net_host_payout || payout.net_payout || 0) * 100);
      if (transferAmount <= 0) {
        await base44.asServiceRole.entities.HostPayout.update(payout.id, {
          status: 'released',
          released_at: now.toISOString(),
          hold_notes: 'Released: zero-amount payout',
        });
        results.skipped++;
        continue;
      }

      try {
        const transfer = await stripe.transfers.create({
          amount: transferAmount,
          currency: 'usd',
          destination: host.stripe_account_id,
          description: `UrideHub payout — ${host.full_name} — booking ${payout.booking_request_id}`,
          metadata: {
            host_id: host.id,
            booking_request_id: payout.booking_request_id,
            payment_intent_id: payout.stripe_payment_intent_id,
            platform: 'uride',
            reserve_window_completed: 'true',
          },
        }, {
          idempotency_key: `payout:${payout.id}`,
        });

        await base44.asServiceRole.entities.HostPayout.update(payout.id, {
          status: 'paid',
          stripe_transfer_id: transfer.id,
          payout_date: now.toISOString().slice(0, 10),
          released_at: now.toISOString(),
        });

        if (payout.booking_request_id) {
          await base44.asServiceRole.entities.BookingRequest.update(payout.booking_request_id, {
            host_payout_status: 'paid',
            stripe_transfer_id: transfer.id,
            payout_processed_at: now.toISOString(),
          });
        }

        await base44.asServiceRole.entities.Host.update(host.id, {
          total_earnings: (host.total_earnings || 0) + (payout.gross_booking_amount || 0),
          total_payouts: (host.total_payouts || 0) + (payout.net_host_payout || 0),
        });

        await base44.asServiceRole.entities.Notification.create({
          user_email: host.email,
          title: `💰 Payout Sent — $${(payout.net_host_payout || 0).toLocaleString()}`,
          body: `Your payout of $${payout.net_host_payout} for booking ${payout.booking_request_id} has been transferred to your Stripe account. The 48-hour chargeback protection window has passed successfully.`,
          type: 'payment',
        }).catch(() => {});

        await logEvent(base44, {
          event_type: 'payout.sent',
          target_id: payout.id,
          host_id: host.id,
          booking_id: payout.booking_request_id,
          summary: `Payout $${payout.net_host_payout} transferred to ${host.full_name} after 48hr hold — transfer ${transfer.id}`,
          metadata: { transfer_id: transfer.id, net: payout.net_host_payout, gross: payout.gross_booking_amount, release_after: payout.release_after },
        });

        results.succeeded++;
      } catch (transferError) {
        await base44.asServiceRole.entities.HostPayout.update(payout.id, {
          status: 'failed',
          hold_notes: `Transfer failed: ${transferError.message}`,
          retry_attempt_count: (payout.retry_attempt_count || 0) + 1,
          last_retry_at: now.toISOString(),
        });
        results.failed++;
        console.error(`[ProcessPayouts] Transfer failed for ${payout.id}:`, transferError.message);
      }
      results.processed++;
    }

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});