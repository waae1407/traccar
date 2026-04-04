import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

Deno.serve(async (req) => {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    return Response.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  const base44 = createClientFromRequest(req);

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const bookingRequestId = pi.metadata?.booking_request_id;
        const receiptUrl = pi.charges?.data?.[0]?.receipt_url;
        if (bookingRequestId) {
          const records = await base44.asServiceRole.entities.BookingRequest.filter({ id: bookingRequestId });
          if (records[0]) {
            await base44.asServiceRole.entities.BookingRequest.update(bookingRequestId, {
              payment_status: 'paid',
              stripe_payment_intent_id: pi.id,
              receipt_url: receiptUrl || null,
            });
          }
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const bookingRequestId = pi.metadata?.booking_request_id;
        if (bookingRequestId) {
          await base44.asServiceRole.entities.BookingRequest.update(bookingRequestId, {
            payment_status: 'failed',
            stripe_payment_intent_id: pi.id,
          });
          // Notify admin
          await base44.asServiceRole.entities.Notification.create({
            title: 'Payment Failed',
            body: `Payment failed for booking ${bookingRequestId}. Reason: ${pi.last_payment_error?.message || 'Unknown'}`,
            type: 'payment',
            booking_request_id: bookingRequestId,
            user_email: pi.metadata?.user_email || '',
          });
        }
        break;
      }

      case 'setup_intent.succeeded': {
        const si = event.data.object;
        const customerId = si.customer;
        // Find user by stripe_customer_id and store payment method
        if (customerId && si.payment_method) {
          // Attach payment method to customer as default
          await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: si.payment_method },
          });
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        const bookingRequestId = charge.metadata?.booking_request_id;
        if (bookingRequestId) {
          await base44.asServiceRole.entities.BookingRequest.update(bookingRequestId, {
            payment_status: 'refunded',
          });
        }
        break;
      }

      default:
        // Unhandled event type — ignore
        break;
    }

    return Response.json({ received: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});