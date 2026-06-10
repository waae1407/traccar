/**
 * dealer360BuyingPowerHold
 *
 * Creates a Stripe authorization hold for a DealerPurchaseRequest.
 * Hold amount = max_bid * 1.3 (covers bid + fees + uRide concierge + adjustments).
 * If hold succeeds → status = funded.
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

    // Create authorize-only payment intent (capture_method: manual)
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
    });

    const holdSucceeded = ['requires_capture', 'succeeded'].includes(paymentIntent.status);

    if (!holdSucceeded) {
      await base44.asServiceRole.entities.DealerPurchaseRequest.update(pr.id, {
        hold_status: 'failed',
        stripe_payment_intent_id: paymentIntent.id,
        admin_notes: `Hold failed: ${paymentIntent.status}`,
      });
      return Response.json({ ok: false, error: 'Authorization hold failed. Please check your payment method.', pi_status: paymentIntent.status }, { status: 402 });
    }

    // Hold authorized — update request to funded/ready
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.DealerPurchaseRequest.update(pr.id, {
      status: 'funded',
      hold_status: 'authorized',
      hold_amount: holdAmount / 100,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_customer_id: stripeCustomerId,
      stripe_payment_method_id: stripePaymentMethodId,
      funded_at: now,
      submitted_at: now,
      activity_log: [
        ...(pr.activity_log || []),
        { action: 'buying_power_hold_authorized', actor: user.email, note: `Hold of $${(holdAmount / 100).toFixed(2)} authorized. PI: ${paymentIntent.id}`, at: now },
      ],
    });

    // Notify admin
    await base44.asServiceRole.entities.Notification.create({
      user_email: 'admin',
      title: '🚗 New Dealer360 Purchase Request — Funded',
      body: `${pr.host_name || pr.host_email} submitted a purchase request for ${pr.year} ${pr.make} ${pr.model} (VIN: ${pr.vin}). Buying power hold of $${(holdAmount / 100).toFixed(2)} authorized. Ready for bid desk review.`,
      type: 'payment',
    });

    return Response.json({
      ok: true,
      status: 'funded',
      hold_amount: holdAmount / 100,
      payment_intent_id: paymentIntent.id,
      pi_status: paymentIntent.status,
    });

  } catch (error) {
    console.error('[dealer360BuyingPowerHold]', error.message);
    // Stripe card errors
    if (error.type === 'StripeCardError') {
      return Response.json({ ok: false, error: error.message, error_code: 'card_error' }, { status: 402 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});