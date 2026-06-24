/**
 * dealer360AdminAction
 *
 * Admin/agent actions for Dealer360 purchase & sell workflows.
 *
 * actions:
 *   update_purchase_status  — move purchase request through lifecycle
 *   enter_invoice           — enter final invoice after vehicle won
 *   capture_final_payment   — capture Stripe auth + charge delta if needed
 *   release_hold            — release auth hold (vehicle lost/cancelled)
 *   update_sell_status      — move sell request through lifecycle
 *   enter_sale_statement    — enter final auction sale statement
 *   send_uride_offer        — send direct purchase offer to host
 *   approve_listing         — approve a public listing
 *   run_ai_valuation        — run AI wholesale valuation on a sell request
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });
    const body = await req.json();
    const { action } = body;

    const now = new Date().toISOString();

    // ── UPDATE PURCHASE STATUS ────────────────────────────────────────────────
    if (action === 'update_purchase_status') {
      const { purchase_request_id, status, agent_notes } = body;
      const requests = await base44.asServiceRole.entities.DealerPurchaseRequest.filter({ id: purchase_request_id });
      const pr = requests[0];
      if (!pr) return Response.json({ error: 'Not found' }, { status: 404 });

      // D6 — Block marking won without an active authorized hold
      if (status === 'won') {
        if (pr.hold_status !== 'authorized' || !pr.stripe_payment_intent_id) {
          return Response.json({ error: 'Cannot mark vehicle won without active Buying Power Hold.', code: 'NO_ACTIVE_HOLD' }, { status: 400 });
        }
        // Check hold_expires_at field (set at hold creation time)
        if (pr.hold_expires_at) {
          if (new Date(pr.hold_expires_at).getTime() <= Date.now()) {
            return Response.json({
              error: 'Cannot mark vehicle won. Buying Power Hold has expired. Please contact the host to reauthorize.',
              code: 'HOLD_EXPIRED'
            }, { status: 400 });
          }
        } else if (pr.funded_at) {
          // Fallback: calculate from funded_at with 6.5-day safety margin
          const ageDays = (Date.now() - new Date(pr.funded_at).getTime()) / (1000 * 60 * 60 * 24);
          if (ageDays >= 6.5) {
            return Response.json({
              error: 'Cannot mark vehicle won. Buying Power Hold has expired or is about to expire — please verify in Stripe before proceeding.',
              code: 'HOLD_POSSIBLY_EXPIRED'
            }, { status: 400 });
          }
        }
      }

      const updateData = {
        status,
        agent_notes: agent_notes || pr.agent_notes,
        activity_log: [...(pr.activity_log || []), { action: `status_changed_to_${status}`, actor: user.email, note: agent_notes || '', at: now }],
      };

      if (status === 'won') updateData.won_at = now;
      if (status === 'lost') updateData.lost_at = now;

      await base44.asServiceRole.entities.DealerPurchaseRequest.update(purchase_request_id, updateData);

      // Notify host
      const notifMessages = {
        bid_placed: `Your bid has been placed for ${pr.year} ${pr.make} ${pr.model}. We'll notify you of the outcome.`,
        outbid: `You've been outbid on ${pr.year} ${pr.make} ${pr.model}. The max bid was exceeded. Your buying power hold remains active.`,
        won: `🎉 Congratulations! Your bid was won for ${pr.year} ${pr.make} ${pr.model}. An invoice will be sent shortly.`,
        lost: `Your bid for ${pr.year} ${pr.make} ${pr.model} was not won. Your Buying Power Hold will be released shortly.`,
        cancelled: `Your purchase request for ${pr.year} ${pr.make} ${pr.model} has been cancelled.`,
      };

      if (notifMessages[status]) {
        await base44.asServiceRole.entities.Notification.create({
          user_email: pr.host_email,
          title: `Dealer360 Update — ${pr.year} ${pr.make} ${pr.model}`,
          body: notifMessages[status],
          type: 'booking',
        });
      }

      return Response.json({ ok: true, status });
    }

    // ── ENTER INVOICE ─────────────────────────────────────────────────────────
    if (action === 'enter_invoice') {
      const { purchase_request_id, bid_amount, auction_fee, buyer_fee, transport_fee, title_fee, storage_fee, stripe_fee, uride_concierge_fee, other_fee } = body;

      const requests = await base44.asServiceRole.entities.DealerPurchaseRequest.filter({ id: purchase_request_id });
      const pr = requests[0];
      if (!pr) return Response.json({ error: 'Not found' }, { status: 404 });

      if (!bid_amount || bid_amount <= 0) {
        return Response.json({ error: 'Bid amount is required and must be greater than $0.' }, { status: 400 });
      }

      const total_due = (bid_amount || 0) + (auction_fee || 0) + (buyer_fee || 0) + (transport_fee || 0) + (title_fee || 0) + (storage_fee || 0) + (stripe_fee || 0) + (uride_concierge_fee || 50) + (other_fee || 0);

      await base44.asServiceRole.entities.DealerPurchaseRequest.update(purchase_request_id, {
        status: 'payment_due',
        bid_amount, auction_fee: auction_fee || 0, buyer_fee: buyer_fee || 0,
        transport_fee: transport_fee || 0, title_fee: title_fee || 0,
        storage_fee: storage_fee || 0, stripe_fee: stripe_fee || 0,
        uride_concierge_fee: uride_concierge_fee || 50, other_fee: other_fee || 0,
        total_due,
        invoice_sent_at: now,
        activity_log: [...(pr.activity_log || []), { action: 'invoice_entered', actor: user.email, note: `Invoice total: $${total_due.toFixed(2)}`, at: now }],
      });

      // Notify host
      await base44.asServiceRole.entities.Notification.create({
        user_email: pr.host_email,
        title: `💳 Invoice Ready — ${pr.year} ${pr.make} ${pr.model}`,
        body: `Your final purchase invoice for ${pr.year} ${pr.make} ${pr.model} is ready. Total due: $${total_due.toFixed(2)}. Please review and approve payment in Dealer360.`,
        type: 'payment',
      });

      return Response.json({ ok: true, total_due });
    }

    // ── CAPTURE FINAL PAYMENT ─────────────────────────────────────────────────
    if (action === 'capture_final_payment') {
      const { purchase_request_id } = body;
      const requests = await base44.asServiceRole.entities.DealerPurchaseRequest.filter({ id: purchase_request_id });
      const pr = requests[0];
      if (!pr) return Response.json({ error: 'Not found' }, { status: 404 });
      if (!pr.stripe_payment_intent_id) return Response.json({ error: 'No payment intent on record' }, { status: 400 });
      if (!pr.total_due) return Response.json({ error: 'Invoice not entered yet' }, { status: 400 });

      // D3 — Double-capture guard
      if (pr.hold_captured || pr.status === 'completed' || pr.final_payment_captured_at) {
        return Response.json({ error: 'Final payment already captured.', code: 'ALREADY_CAPTURED' }, { status: 409 });
      }

      // D3 — Check for existing WonVehicle to prevent duplicates
      const existingWon = await base44.asServiceRole.entities.DealerWonVehicle.filter({ purchase_request_id });
      if (existingWon.length > 0) {
        return Response.json({ error: 'Final payment already captured.', code: 'ALREADY_CAPTURED' }, { status: 409 });
      }

      const totalCents = Math.round(pr.total_due * 100);
      const holdCents = Math.round((pr.hold_amount || 0) * 100);

      let captureResult;
      let additionalPiId = null;
      let deltaFailed = false;
      let deltaError = '';
      let deltaAmount = 0;

      if (totalCents <= holdCents) {
        // Capture only the final invoice amount (partial capture releases remainder)
        captureResult = await stripe.paymentIntents.capture(pr.stripe_payment_intent_id, {
          amount_to_capture: totalCents,
        });
      } else {
        // D4/D5 — Capture full hold first, then attempt delta charge separately
        captureResult = await stripe.paymentIntents.capture(pr.stripe_payment_intent_id);
        deltaAmount = totalCents - holdCents;

        try {
          const additionalPi = await stripe.paymentIntents.create({
            amount: deltaAmount,
            currency: 'usd',
            customer: pr.stripe_customer_id,
            payment_method: pr.stripe_payment_method_id,
            off_session: true,
            confirm: true,
            description: `Dealer360 balance due — ${pr.year} ${pr.make} ${pr.model} VIN:${pr.vin}`,
            metadata: { purchase_request_id: pr.id, type: 'dealer360_balance' },
          }, {
            idempotencyKey: `dealer360_balance_due:${pr.id}`,
          });
          additionalPiId = additionalPi.id;
        } catch (deltaErr) {
          // D4 — Hold captured but delta failed — record limbo state, do NOT complete
          deltaFailed = true;
          deltaError = deltaErr.message || 'Unknown error';

          await base44.asServiceRole.entities.DealerPurchaseRequest.update(purchase_request_id, {
            hold_captured: true,
            hold_status: 'captured',
            status: 'payment_due',
            balance_due: deltaAmount / 100,
            payment_failure_reason: deltaError,
            activity_log: [...(pr.activity_log || []), {
              action: 'hold_captured_balance_due',
              actor: user.email,
              note: `Hold of $${(holdCents / 100).toFixed(2)} captured. Balance of $${(deltaAmount / 100).toFixed(2)} collection failed: ${deltaError}`,
              at: now,
            }],
          });

          await Promise.all([
            base44.asServiceRole.entities.Notification.create({
              user_email: pr.host_email,
              title: `⚠️ Additional Payment Required — ${pr.year} ${pr.make} ${pr.model}`,
              body: `Your initial authorization has been captured, but an additional payment of $${(deltaAmount / 100).toFixed(2)} is required to complete your vehicle purchase. Please contact support.`,
              type: 'payment',
            }),
            base44.asServiceRole.entities.Notification.create({
              user_email: 'admin',
              title: `⚠️ Dealer360 Balance Collection Failed — ${pr.year} ${pr.make} ${pr.model}`,
              body: `Hold captured for ${pr.host_email}'s purchase of ${pr.year} ${pr.make} ${pr.model} (VIN: ${pr.vin}), but the balance charge of $${(deltaAmount / 100).toFixed(2)} failed: ${deltaError}. Manual follow-up required.`,
              type: 'payment',
            }),
          ]);

          return Response.json({
            ok: false,
            error: 'Hold captured but additional payment failed. Host has been notified.',
            code: 'DELTA_CHARGE_FAILED',
            balance_due: deltaAmount / 100,
          }, { status: 402 });
        }
      }

      // D5 — All payments succeeded — now safe to mark completed and create WonVehicle
      const wonVehicle = await base44.asServiceRole.entities.DealerWonVehicle.create({
        host_id: pr.host_id,
        host_email: pr.host_email,
        purchase_request_id: pr.id,
        vin: pr.vin,
        year: pr.year,
        make: pr.make,
        model: pr.model,
        trim: pr.trim,
        mileage: pr.mileage,
        auction_source: pr.auction_source,
        purchase_date: now.slice(0, 10),
        bid_amount: pr.bid_amount,
        auction_fee: pr.auction_fee,
        buyer_fee: pr.buyer_fee,
        transport_fee: pr.transport_fee,
        title_fee: pr.title_fee,
        storage_fee: pr.storage_fee,
        uride_concierge_fee: pr.uride_concierge_fee,
        other_fee: pr.other_fee,
        total_cost: pr.total_due,
        agent_email: user.email,
        status: pr.transport_needed ? 'in_transit' : 'received',
      });

      await base44.asServiceRole.entities.DealerPurchaseRequest.update(purchase_request_id, {
        status: 'completed',
        hold_captured: true,
        hold_status: 'captured',
        final_payment_intent_id: additionalPiId || pr.stripe_payment_intent_id,
        final_payment_captured_at: now,
        won_vehicle_id: wonVehicle.id,
        completed_at: now,
        activity_log: [...(pr.activity_log || []), {
          action: 'payment_captured',
          actor: user.email,
          note: `Final $${pr.total_due.toFixed(2)} captured. Won vehicle created.`,
          at: now,
        }],
      });

      await base44.asServiceRole.entities.Notification.create({
        user_email: pr.host_email,
        title: `✅ Vehicle Purchased — ${pr.year} ${pr.make} ${pr.model}`,
        body: `Payment of $${pr.total_due.toFixed(2)} has been captured. Your vehicle has been added to Won Vehicles in Dealer360.`,
        type: 'payment',
      });

      return Response.json({ ok: true, won_vehicle_id: wonVehicle.id, captured_amount: pr.total_due });
    }

    // ── RELEASE HOLD ──────────────────────────────────────────────────────────
    if (action === 'release_hold') {
      const { purchase_request_id, reason } = body;
      const requests = await base44.asServiceRole.entities.DealerPurchaseRequest.filter({ id: purchase_request_id });
      const pr = requests[0];
      if (!pr) return Response.json({ error: 'Not found' }, { status: 404 });

      if (pr.stripe_payment_intent_id && pr.hold_status === 'authorized') {
        await stripe.paymentIntents.cancel(pr.stripe_payment_intent_id);
      }

      await base44.asServiceRole.entities.DealerPurchaseRequest.update(purchase_request_id, {
        hold_status: 'released',
        hold_released: true,
        activity_log: [...(pr.activity_log || []), { action: 'hold_released', actor: user.email, note: reason || 'Hold released', at: now }],
      });

      await base44.asServiceRole.entities.Notification.create({
        user_email: pr.host_email,
        title: `🔓 Buying Power Hold Released — ${pr.year} ${pr.make} ${pr.model}`,
        body: `Your bid for ${pr.year} ${pr.make} ${pr.model} was not won. Your Buying Power Hold of $${(pr.hold_amount || 0).toFixed(2)} has been released. Funds will return within 2-5 business days.`,
        type: 'payment',
      });

      return Response.json({ ok: true });
    }

    // ── ENTER SALE STATEMENT ──────────────────────────────────────────────────
    if (action === 'enter_sale_statement') {
      const { sell_request_id, sale_price, auction_fees, transport_fee, storage_fee, uride_concierge_fee, net_proceeds } = body;
      const sells = await base44.asServiceRole.entities.DealerSellRequest.filter({ id: sell_request_id });
      const sr = sells[0];
      if (!sr) return Response.json({ error: 'Not found' }, { status: 404 });

      const net = net_proceeds || (sale_price - (auction_fees || 0) - (transport_fee || 0) - (storage_fee || 0) - (uride_concierge_fee || 50));

      await base44.asServiceRole.entities.DealerSellRequest.update(sell_request_id, {
        status: 'sold',
        sale_price, auction_fees: auction_fees || 0,
        transport_fee: transport_fee || 0, storage_fee: storage_fee || 0,
        uride_concierge_fee: uride_concierge_fee || 50,
        net_proceeds: net,
        sold_at: now,
        activity_log: [...(sr.activity_log || []), { action: 'sale_statement_entered', actor: user.email, note: `Sale: $${sale_price}, Net: $${net}`, at: now }],
      });

      await base44.asServiceRole.entities.Notification.create({
        user_email: sr.host_email,
        title: `💰 Vehicle Sold — ${sr.year} ${sr.make} ${sr.model}`,
        body: `Your vehicle sold for $${sale_price}. Net proceeds to you: $${net.toFixed(2)} after fees. Proceeds are being processed.`,
        type: 'payment',
      });

      return Response.json({ ok: true, net_proceeds: net });
    }

    // ── SEND URIDE DIRECT OFFER ───────────────────────────────────────────────
    if (action === 'send_uride_offer') {
      const { sell_request_id, offer_amount } = body;
      const sells = await base44.asServiceRole.entities.DealerSellRequest.filter({ id: sell_request_id });
      const sr = sells[0];
      if (!sr) return Response.json({ error: 'Not found' }, { status: 404 });

      await base44.asServiceRole.entities.DealerSellRequest.update(sell_request_id, {
        uride_offer_amount: offer_amount,
        uride_offer_status: 'pending',
        uride_offer_sent_at: now,
        status: 'offer_received',
        activity_log: [...(sr.activity_log || []), { action: 'uride_offer_sent', actor: user.email, note: `Offer: $${offer_amount}`, at: now }],
      });

      await base44.asServiceRole.entities.Notification.create({
        user_email: sr.host_email,
        title: `🏷️ uRide Direct Offer — ${sr.year} ${sr.make} ${sr.model}`,
        body: `uRide is offering $${offer_amount.toFixed(2)} for your ${sr.year} ${sr.make} ${sr.model}. Please review and accept or decline in Dealer360.`,
        type: 'payment',
      });

      return Response.json({ ok: true });
    }

    // ── APPROVE LISTING ───────────────────────────────────────────────────────
    if (action === 'approve_listing') {
      const { listing_id, admin_notes } = body;
      await base44.asServiceRole.entities.DealerPublicListing.update(listing_id, {
        admin_approved: true,
        status: 'active',
        admin_notes,
        published_at: now,
      });
      return Response.json({ ok: true });
    }

    // ── RUN AI VALUATION ──────────────────────────────────────────────────────
    if (action === 'run_ai_valuation') {
      const { sell_request_id } = body;
      const sells = await base44.asServiceRole.entities.DealerSellRequest.filter({ id: sell_request_id });
      const sr = sells[0];
      if (!sr) return Response.json({ error: 'Not found' }, { status: 404 });

      const prompt = `You are an expert automotive wholesale valuation analyst.

Vehicle Details:
- VIN: ${sr.vin}
- Year: ${sr.year}
- Make: ${sr.make}
- Model: ${sr.model}
- Trim: ${sr.trim || 'Unknown'}
- Mileage: ${sr.mileage?.toLocaleString() || 'Unknown'} miles
- Condition: ${sr.condition || 'good'}
- Title Status: ${sr.title_status || 'clean'}
- Location: ${sr.location || 'USA'}
- Host desired minimum: ${sr.desired_minimum_price ? '$' + sr.desired_minimum_price : 'Not specified'}

Provide a wholesale automotive valuation in JSON format with these fields:
- wholesale_value (number): estimated wholesale market value
- recommended_buy_price (number): what a dealer should pay (below wholesale)
- recommended_auction_min (number): recommended minimum auction reserve price
- recommended_public_price (number): recommended retail/public listing price
- risk_score (string): "low", "medium", or "high"
- valuation_notes (string): 2-3 sentences explaining the valuation, key factors, and market conditions
- uride_offer_suggested (number): suggested uRide direct offer (must be 10-20% below wholesale_value)

Base your estimates on current US used car market conditions, mileage depreciation, condition, title status, and regional factors.`;

      const { data: result } = await base44.asServiceRole.functions.invoke('invokeLLM', {
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            wholesale_value: { type: 'number' },
            recommended_buy_price: { type: 'number' },
            recommended_auction_min: { type: 'number' },
            recommended_public_price: { type: 'number' },
            risk_score: { type: 'string' },
            valuation_notes: { type: 'string' },
            uride_offer_suggested: { type: 'number' },
          }
        }
      });

      await base44.asServiceRole.entities.DealerSellRequest.update(sell_request_id, {
        ai_wholesale_value: result.wholesale_value,
        ai_recommended_buy_price: result.recommended_buy_price,
        ai_recommended_auction_min: result.recommended_auction_min,
        ai_recommended_public_price: result.recommended_public_price,
        ai_risk_score: result.risk_score,
        ai_valuation_notes: result.valuation_notes,
        status: 'valuation_complete',
        activity_log: [...(sr.activity_log || []), { action: 'ai_valuation_run', actor: user.email, note: `Wholesale: $${result.wholesale_value}, Risk: ${result.risk_score}`, at: now }],
      });

      return Response.json({ ok: true, valuation: result });
    }

    // ── POST-CAPTURE REFUND ───────────────────────────────────────────────────
    if (action === 'post_capture_refund') {
      const { purchase_request_id, refund_reason, refund_amount } = body;
      const requests = await base44.asServiceRole.entities.DealerPurchaseRequest.filter({ id: purchase_request_id });
      const pr = requests[0];
      if (!pr) return Response.json({ error: 'Not found' }, { status: 404 });

      // Only allowed after capture
      if (!pr.hold_captured || !pr.final_payment_captured_at) {
        return Response.json({ error: 'Refund only allowed after payment has been captured.', code: 'NOT_CAPTURED' }, { status: 400 });
      }
      if (pr.refund_status === 'succeeded') {
        return Response.json({ error: 'This purchase has already been refunded.', code: 'ALREADY_REFUNDED' }, { status: 409 });
      }

      const validReasons = ['auction_cancelled', 'seller_withdrew', 'vehicle_unavailable', 'title_issue', 'transport_damage', 'administrative_error', 'other'];
      if (!refund_reason || !validReasons.includes(refund_reason)) {
        return Response.json({ error: `refund_reason must be one of: ${validReasons.join(', ')}` }, { status: 400 });
      }

      const refundablePI = pr.final_payment_intent_id || pr.stripe_payment_intent_id;
      if (!refundablePI) return Response.json({ error: 'No payment intent on record to refund' }, { status: 400 });

      // Determine refund amount — default to full total_due
      const refundDollars = refund_amount && refund_amount > 0 ? refund_amount : pr.total_due;
      const refundCents = Math.round(refundDollars * 100);

      let stripeRefundId = null;
      let stripeRefundStatus = 'pending';
      let stripeError = null;

      try {
        const stripeRefund = await stripe.refunds.create({
          payment_intent: refundablePI,
          amount: refundCents,
          reason: 'requested_by_customer',
          metadata: {
            purchase_request_id: pr.id,
            refund_reason,
            actor: user.email,
          },
        }, {
          idempotencyKey: `dealer360_refund:${pr.id}`,
        });
        stripeRefundId = stripeRefund.id;
        stripeRefundStatus = stripeRefund.status;
      } catch (stripeErr) {
        // Stripe failed (e.g. test PI, already refunded, etc.) — log but still record refund attempt
        stripeError = stripeErr.message || 'Stripe refund failed';
        stripeRefundStatus = 'failed';
        console.error('[dealer360AdminAction] Stripe refund error:', stripeError);
      }

      const refundSuccess = stripeRefundStatus === 'succeeded' || stripeRefundStatus === 'pending';

      // Update DealerPurchaseRequest regardless of Stripe outcome
      await base44.asServiceRole.entities.DealerPurchaseRequest.update(purchase_request_id, {
        status: refundSuccess ? 'refunded' : pr.status,
        refund_amount: refundDollars,
        refund_reason,
        refund_payment_intent_id: refundablePI,
        refund_stripe_refund_id: stripeRefundId,
        refund_status: stripeRefundStatus,
        refunded_at: refundSuccess ? now : null,
        activity_log: [...(pr.activity_log || []), {
          action: 'post_capture_refund',
          actor: user.email,
          note: stripeError
            ? `Refund attempt of $${refundDollars.toFixed(2)} — reason: ${refund_reason}. Stripe error: ${stripeError}`
            : `Refund of $${refundDollars.toFixed(2)} — reason: ${refund_reason}. Stripe refund: ${stripeRefundId}`,
          at: now,
        }],
      });

      // Update DealerWonVehicle if linked and refund succeeded
      if (pr.won_vehicle_id && refundSuccess) {
        await base44.asServiceRole.entities.DealerWonVehicle.update(pr.won_vehicle_id, {
          status: 'refunded',
          refund_status: 'refunded',
        }).catch(() => {});
      }

      // Notify host and admin
      await Promise.all([
        base44.asServiceRole.entities.Notification.create({
          user_email: pr.host_email,
          title: `💸 Vehicle Purchase Refunded — ${pr.year} ${pr.make} ${pr.model}`,
          body: `Your vehicle purchase for ${pr.year} ${pr.make} ${pr.model} (VIN: ${pr.vin}) has been refunded. Amount: $${refundDollars.toFixed(2)}. Reason: ${refund_reason.replace(/_/g, ' ')}. Funds will return within 5-10 business days.`,
          type: 'payment',
        }),
        base44.asServiceRole.entities.Notification.create({
          user_email: 'admin',
          title: `💸 Dealer360 Refund Processed — ${pr.year} ${pr.make} ${pr.model}`,
          body: `Refund of $${refundDollars.toFixed(2)} issued by ${user.email} for ${pr.host_email}'s purchase of ${pr.year} ${pr.make} ${pr.model} (VIN: ${pr.vin}). Reason: ${refund_reason}. Stripe ID: ${stripeRefundId || 'N/A'}${stripeError ? '. Error: ' + stripeError : ''}`,
          type: 'payment',
        }),
      ]).catch(() => {});

      if (stripeError) {
        return Response.json({ ok: false, error: stripeError, code: 'STRIPE_REFUND_FAILED', refund_status: stripeRefundStatus }, { status: 502 });
      }

      if (!refundSuccess) {
        return Response.json({ ok: false, error: 'Refund submitted but Stripe status is not yet confirmed.', stripe_status: stripeRefundStatus, refund_id: stripeRefundId }, { status: 202 });
      }

      return Response.json({ ok: true, refund_id: stripeRefundId, refund_amount: refundDollars, stripe_status: stripeRefundStatus });
    }

    // ── UPDATE SELL STATUS ────────────────────────────────────────────────────
    if (action === 'update_sell_status') {
      const { sell_request_id, status, agent_notes } = body;
      const sells = await base44.asServiceRole.entities.DealerSellRequest.filter({ id: sell_request_id });
      const sr = sells[0];
      if (!sr) return Response.json({ error: 'Not found' }, { status: 404 });

      await base44.asServiceRole.entities.DealerSellRequest.update(sell_request_id, {
        status,
        agent_notes: agent_notes || sr.agent_notes,
        activity_log: [...(sr.activity_log || []), { action: `status_changed_to_${status}`, actor: user.email, note: agent_notes || '', at: now }],
      });

      return Response.json({ ok: true, status });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error) {
    console.error('[dealer360AdminAction]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});