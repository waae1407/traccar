/**
 * dealer360BuyingPowerHold
 *
 * Creates a Stripe authorization hold for a DealerPurchaseRequest.
 * Hold amount = max_bid * 1.3 (covers bid + fees + uRide concierge + adjustments).
 * If hold succeeds → status = funded, hold_expires_at = funded_at + 7 days.
 * If hold fails → do not submit to admin.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });
    const { purchase_request_id } = await req.json();
    if (!purchase_request_id) return Response.json({ error: 'purchase_request_id required' }, { status: 400 });

    const requests = await base44.asServiceRole.entities.DealerPurchaseRequest.filter({ id: purchase_request_id });
    const pr = requests[0];
    if (!pr) return Response.json({ error: 'Purchase request not found' }, { status: 404 });

    // Access control — host can only submit their own
    if (user.role !== 'admin' && pr.host_id !== user.id && pr.host_email !== user.email) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!pr.max_bid || pr.max_bid <= 0) {
      return Response.json({ error: 'max_bid is required and must be positive' }, { status: 400 });
    }

    // D2 — Re-hold guard: block if request is already funded or beyond
    const blockedStatuses = ['funded','under_review','bid_approved','bid_placed','outbid','won','invoice_pending','payment_due','completed','cancelled','lost'];
    if (blockedStatuses.includes(pr.status) || pr.hold_status === 'authorized' || pr.stripe_payment_intent_id) {
      return Response.json({ ok: false, error: 'Buying Power Hold already exists for this request.', error_code: 'already_funded' }, { status: 409 });
    }

    // Resolve Stripe customer from BookingRequest (host's saved payment)
    const bookings = await base44.asServiceRole.entities.BookingRequest.filter(
      { host_id: pr.host_id },
      '-updated_date', 5
    );
    const stripeCustomerId = pr.stripe_customer_id || bookings.find(b => b.stripe_customer_id)?.stripe_customer_id;
    const stripePaymentMethodId = pr.stripe_payment_method_id || bookings.find(b => b.stripe_payment_method_id)?.stripe_payment_method_id;

    if (!stripeCustomerId || !stripePaymentMethodId) {
      return Response.json({
        error: 'No saved payment method found for this host. Please complete a booking checkout first to save a payment method.',
        error_code: 'no_payment_method'
      }, { status: 400 });
    }

    const holdAmount = Math.round(pr.max_bid * 1.3 * 100); // cents

    // D1 — Create authorize-only payment intent with idempotency key to prevent duplicate holds
    const paymentIntent = await stripe.paymentIntents.create({
      amount: holdAmount,
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method: stripePaymentMethodId,
      capture_method: 'manual',
      confirm: true,
      off_session: true,
      description: `Dealer360 Buying Power Hold — ${pr.year || ''} ${pr.make || ''} ${pr.model || ''} VIN:${pr.vin}`,
      metadata: {
        purchase_request_id: pr.id,
        host_id: pr.host_id,
        vin: pr.vin,
        type: 'buying_power_hold',
      },
    }, {
      idempotencyKey: `dealer360_buying_power_hold:${pr.id}`,
    });

    const holdSucceeded = ['requires_capture', 'succeeded'].includes(paymentIntent.status);

    if (!holdSucceeded) {
      await base44.asServiceRole.entities.DealerPurchaseRequest.update(pr.id, {
        hold_status: 'failed',
        stripe_payment_intent_id: paymentIntent.id,
        admin_notes: `Hold failed: ${paymentIntent.status}`,
      });
      await base44.asServiceRole.entities.Notification.create({
        user_email: pr.host_email,
        title: `Payment Authorization Failed — ${pr.year} ${pr.make} ${pr.model}`,
        body: `Your buying power hold for ${pr.year} ${pr.make} ${pr.model} (VIN: ${pr.vin}) could not be authorized. Please check your payment method and try again.`,
        type: 'payment',
      }).catch(() => {});
      return Response.json({ ok: false, error: 'Authorization hold failed. Please check your payment method.', pi_status: paymentIntent.status }, { status: 402 });
    }

    // Hold authorized — set hold_expires_at = now + 7 days
    const now = new Date();
    const fundedAt = now.toISOString();
    const holdExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await base44.asServiceRole.entities.DealerPurchaseRequest.update(pr.id, {
      status: 'funded',
      hold_status: 'authorized',
      hold_amount: holdAmount / 100,
      hold_expires_at: holdExpiresAt,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_customer_id: stripeCustomerId,
      stripe_payment_method_id: stripePaymentMethodId,
      funded_at: fundedAt,
      submitted_at: fundedAt,
      activity_log: [
        ...(pr.activity_log || []),
        {
          action: 'buying_power_hold_authorized',
          actor: user.email,
          note: `Hold of $${(holdAmount / 100).toFixed(2)} authorized. PI: ${paymentIntent.id}. Expires: ${holdExpiresAt}`,
          at: fundedAt,
        },
      ],
    });

    // Notify admin and host
    await Promise.all([
      base44.asServiceRole.entities.Notification.create({
        user_email: 'admin',
        title: '🚗 New Dealer360 Purchase Request — Funded',
        body: `${pr.host_name || pr.host_email} submitted a purchase request for ${pr.year} ${pr.make} ${pr.model} (VIN: ${pr.vin}). Buying power hold of $${(holdAmount / 100).toFixed(2)} authorized. Expires ${new Date(holdExpiresAt).toLocaleDateString()}. Ready for bid desk review.`,
        type: 'payment',
      }),
      base44.asServiceRole.entities.Notification.create({
        user_email: pr.host_email,
        title: `✅ Buying Power Hold Authorized — ${pr.year} ${pr.make} ${pr.model}`,
        body: `Your buying power hold of $${(holdAmount / 100).toFixed(2)} has been authorized for ${pr.year} ${pr.make} ${pr.model} (VIN: ${pr.vin}). Your request has been submitted to the bid desk for review. Hold expires ${new Date(holdExpiresAt).toLocaleDateString()}.`,
        type: 'payment',
      }),
    ]);

    return Response.json({
      ok: true,
      status: 'funded',
      hold_amount: holdAmount / 100,
      hold_expires_at: holdExpiresAt,
      payment_intent_id: paymentIntent.id,
      pi_status: paymentIntent.status,
    });

  } catch (error) {
    console.error('[dealer360BuyingPowerHold]', error.message);
    if (error.type === 'StripeCardError') {
      return Response.json({ ok: false, error: error.message, error_code: 'card_error' }, { status: 402 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});