import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });

async function getPlan(base44, hostId) {
  const plans = await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id: hostId }, '-updated_date', 1);
  return plans?.[0] || null;
}

async function getCommerce(base44, hostId) {
  const profiles = await base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id: hostId }, '-updated_date', 1);
  return profiles?.[0] || null;
}

function isFleetOS(commerce, plan) {
  return commerce?.plan_type === 'fleetos_professional' || plan?.active_mode === 'fleetos_professional' || plan?.selected_mode === 'fleetos_professional';
}

async function createFleetOSPaymentAlert(base44, booking, reason) {
  await base44.asServiceRole.functions.invoke('createPaymentOperationalAlert', {
    alert_type: 'fleetos_manual_payment_required',
    severity: 'critical',
    billing_context: 'fleetos_admin_charge',
    booking_id: booking?.id || '',
    host_id: booking?.host_id || '',
    customer_id: booking?.user_id || '',
    vehicle_id: booking?.vehicle_id || '',
    renter_email: booking?.user_email || '',
    related_entity_type: 'BookingRequest',
    related_entity_id: booking?.id || '',
    title: 'FleetOS payment requires host action',
    message: reason,
    recommended_action: 'Collect payment through the host-owned payment process or connect host Stripe before charging.',
    financial_impact_amount: booking?.weekly_rate || booking?.total_due_now || 0,
    currency: 'usd',
    source: 'stripeChargeCustomer'
  }).catch(() => {});
}

// Charge a saved payment method off-session through the shared payment adapter.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { stripe_customer_id, payment_method_id, amount_cents, booking_request_id, description } = await req.json();

    if (!stripe_customer_id || !payment_method_id || !amount_cents) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let processor = 'uride_stripe';
    let stripeOptions = {};
    let hostId = '';
    let booking = null;

    if (booking_request_id) {
      booking = await base44.asServiceRole.entities.BookingRequest.get(booking_request_id);
      hostId = booking?.host_id || '';
      if (hostId) {
        const [profile, plan] = await Promise.all([getCommerce(base44, hostId), getPlan(base44, hostId)]);
        if (isFleetOS(profile, plan)) {
          const hostStripeReady = profile?.payment_processor === 'host_stripe' && profile?.stripe_account_id && profile?.online_payments_enabled;
          if (!hostStripeReady) {
            const reason = 'FleetOS charge blocked: host Stripe is missing, disabled, or incomplete. uRide Stripe was not touched.';
            await createFleetOSPaymentAlert(base44, booking, reason);
            return Response.json({ error: reason, processor: profile?.payment_processor || 'reservation_only', manual_payment_required: true }, { status: 409 });
          }
          processor = 'host_stripe';
          stripeOptions = { stripeAccount: profile.stripe_account_id };
        } else if (profile?.payment_processor === 'host_stripe' && profile?.stripe_account_id && profile?.online_payments_enabled) {
          processor = 'host_stripe';
          stripeOptions = { stripeAccount: profile.stripe_account_id };
        }
      }
    }

    const paymentIntentParams = {
      amount: amount_cents,
      currency: 'usd',
      customer: stripe_customer_id,
      payment_method: payment_method_id,
      confirm: true,
      off_session: true,
      description: description || (processor === 'host_stripe' ? 'Host rental payment' : 'uRide rental payment'),
      metadata: { billing_context: processor === 'host_stripe' ? 'fleetos_host_direct_payment' : 'rental_marketplace_payment', booking_request_id: booking_request_id || '', host_id: hostId, payment_processor: processor },
    };
    const paymentIntent = Object.keys(stripeOptions).length
      ? await stripe.paymentIntents.create(paymentIntentParams, stripeOptions)
      : await stripe.paymentIntents.create(paymentIntentParams);

    return Response.json({
      payment_intent_id: paymentIntent.id,
      status: paymentIntent.status,
      receipt_url: paymentIntent.charges?.data?.[0]?.receipt_url || null,
    });
  } catch (error) {
    // Handle card declined
    if (error.code === 'authentication_required' || error.code === 'card_declined') {
      return Response.json({ error: 'Card declined', code: error.code }, { status: 402 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});