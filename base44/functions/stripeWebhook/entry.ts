import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
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
          const booking = records[0];
          if (booking) {
            await base44.asServiceRole.entities.BookingRequest.update(bookingRequestId, {
              payment_status: 'paid',
              stripe_payment_intent_id: pi.id,
              receipt_url: receiptUrl || null,
            });

            // Auto-payout host: trace booking → vehicle → host → Stripe transfer
            const amountPaid = pi.amount / 100; // convert cents to dollars
            if (booking.vehicle_id && amountPaid > 0) {
              const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
              const vehicle = vehicles[0];
              if (vehicle?.host_id) {
                const hosts = await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id });
                const host = hosts[0];
                if (host?.stripe_account_id && host?.stripe_onboarding_complete) {
                  const commissionRate = host.commission_rate || 0.20;
                  const hostShare = Math.round(amountPaid * (1 - commissionRate) * 100); // cents
                  const platformShare = Math.round(amountPaid * commissionRate * 100); // cents

                  // Create Stripe transfer to host's connected account
                  const transfer = await stripe.transfers.create({
                    amount: hostShare,
                    currency: 'usd',
                    destination: host.stripe_account_id,
                    description: `uRide auto-payout — ${host.full_name} — booking ${bookingRequestId}`,
                    metadata: { host_id: host.id, booking_request_id: bookingRequestId, platform: 'uride' },
                  });

                  // Create a HostPayout record for tracking
                  await base44.asServiceRole.entities.HostPayout.create({
                    host_id: host.id,
                    host_email: host.email,
                    host_name: host.full_name,
                    period_start: booking.start_date || new Date().toISOString().slice(0, 10),
                    period_end: booking.end_date || new Date().toISOString().slice(0, 10),
                    gross_collected: amountPaid,
                    platform_fee: platformShare / 100,
                    net_payout: hostShare / 100,
                    status: 'paid',
                    stripe_transfer_id: transfer.id,
                    payout_date: new Date().toISOString().slice(0, 10),
                    booking_count: 1,
                    vehicle_count: 1,
                  });

                  // Update host total payouts & earnings
                  await base44.asServiceRole.entities.Host.update(host.id, {
                    total_earnings: (host.total_earnings || 0) + amountPaid,
                    total_payouts: (host.total_payouts || 0) + (hostShare / 100),
                  });

                  // Notify host
                  await base44.asServiceRole.entities.Notification.create({
                    user_email: host.email,
                    title: `💰 Payout Sent — $${(hostShare / 100).toLocaleString()}`,
                    body: `A rental payment was received and $${(hostShare / 100).toLocaleString()} (${((1 - commissionRate) * 100).toFixed(0)}%) has been transferred to your bank. Arrives within 2 business days.`,
                    type: 'payment',
                  });

                  console.log(`[AutoPayout] ✓ Transfer ${transfer.id} — $${hostShare / 100} to ${host.stripe_account_id} for booking ${bookingRequestId}`);
                } else {
                  console.log(`[AutoPayout] Host ${vehicle.host_id} not eligible for auto-payout (no Stripe account or onboarding incomplete)`);
                }
              }
            }
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

      case 'account.updated': {
        // Stripe Connect — host onboarding status changed
        const account = event.data.object;
        if (account.metadata?.host_id) {
          const onboardingComplete = account.details_submitted && account.charges_enabled && account.payouts_enabled;
          const hosts = await base44.asServiceRole.entities.Host.filter({ id: account.metadata.host_id });
          if (hosts[0] && onboardingComplete && !hosts[0].stripe_onboarding_complete) {
            await base44.asServiceRole.entities.Host.update(account.metadata.host_id, {
              stripe_onboarding_complete: true,
            });
            await base44.asServiceRole.entities.Notification.create({
              user_email: hosts[0].email,
              title: "✅ Stripe Payouts Activated!",
              body: "Your Stripe Connect account is verified. You'll now automatically receive 80% of every rental within 2 business days.",
              type: "system",
            });
            console.log(`[Webhook] Host ${account.metadata.host_id} Stripe onboarding complete`);
          }
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