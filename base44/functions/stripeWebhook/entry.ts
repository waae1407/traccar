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
            // Check if vehicle is contactless — auto-approve without admin review
            let isContactless = false;
            if (booking.vehicle_id) {
              const vRecords = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
              isContactless = !!(vRecords[0]?.contactless_pickup && vRecords[0]?.moovetrax_device_id);
            }

            await base44.asServiceRole.entities.BookingRequest.update(bookingRequestId, {
              payment_status: 'paid',
              stripe_payment_intent_id: pi.id,
              receipt_url: receiptUrl || null,
              ...(isContactless && { booking_status: 'active' }),
            });

            // Notify customer if contactless — vehicle is ready immediately
            if (isContactless) {
              await base44.asServiceRole.entities.Notification.create({
                user_email: booking.user_email,
                title: '🚗 Your Vehicle is Ready!',
                body: `Your ${booking.vehicle_name} is confirmed and ready to go. Use the app to unlock your vehicle. Don't forget: pickup inspection photos are required for liability protection before you drive off.`,
                type: 'booking',
                booking_request_id: bookingRequestId,
              });
              console.log(`[Webhook] Contactless booking ${bookingRequestId} auto-approved → active`);
            }

            const grossAmount = pi.amount / 100; // dollars

            if (booking.vehicle_id && grossAmount > 0) {
              const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
              const vehicle = vehicles[0];

              if (vehicle?.host_id) {
                const hosts = await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id });
                const host = hosts[0];

                if (host?.stripe_account_id && host?.stripe_onboarding_complete) {
                  const commissionRate = host.commission_rate ?? 0.08;

                  // --- Retrieve actual Stripe fee from balance_transaction ---
                  let stripeFeeAmount = 0;
                  let stripeEffectiveRate = 0;
                  const chargeId = pi.charges?.data?.[0]?.id;
                  if (chargeId) {
                    const charge = await stripe.charges.retrieve(chargeId, {
                      expand: ['balance_transaction'],
                    });
                    if (charge.balance_transaction?.fee) {
                      stripeFeeAmount = charge.balance_transaction.fee / 100; // cents → dollars
                      stripeEffectiveRate = (stripeFeeAmount / grossAmount) * 100;
                    }
                  }

                  // --- Fee calculations ---
                  const uridePlatformFee = Math.round(grossAmount * commissionRate * 100) / 100;
                  // Transfer = gross - uride_platform_fee (Stripe already took their fee from your balance)
                  const hostTransferAmount = Math.round((grossAmount - uridePlatformFee) * 100); // cents
                  const netHostPayout = hostTransferAmount / 100;

                  // Create Stripe transfer to host's connected account
                  const transfer = await stripe.transfers.create({
                    amount: hostTransferAmount,
                    currency: 'usd',
                    destination: host.stripe_account_id,
                    description: `UrideHub payout — ${host.full_name} — booking ${bookingRequestId}`,
                    metadata: { host_id: host.id, booking_request_id: bookingRequestId, platform: 'uride' },
                  });

                  const vehicleName = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : null;

                  // Create detailed HostPayout record
                  await base44.asServiceRole.entities.HostPayout.create({
                    host_id: host.id,
                    host_email: host.email,
                    host_name: host.full_name,
                    booking_request_id: bookingRequestId,
                    vehicle_name: vehicleName,
                    period_start: booking.start_date || new Date().toISOString().slice(0, 10),
                    period_end: booking.end_date || new Date().toISOString().slice(0, 10),
                    // New detailed fields
                    gross_booking_amount: grossAmount,
                    stripe_fee_amount: stripeFeeAmount,
                    stripe_effective_rate: Math.round(stripeEffectiveRate * 100) / 100,
                    uride_platform_fee_amount: uridePlatformFee,
                    uride_platform_fee_rate: commissionRate,
                    net_host_payout: netHostPayout,
                    // Legacy aliases
                    gross_collected: grossAmount,
                    platform_fee: uridePlatformFee,
                    net_payout: netHostPayout,
                    status: 'paid',
                    stripe_transfer_id: transfer.id,
                    payout_date: new Date().toISOString().slice(0, 10),
                    booking_count: 1,
                    vehicle_count: 1,
                  });

                  // Update host totals
                  await base44.asServiceRole.entities.Host.update(host.id, {
                    total_earnings: (host.total_earnings || 0) + grossAmount,
                    total_payouts: (host.total_payouts || 0) + netHostPayout,
                  });

                  // Notify host with transparent breakdown
                  const feeLabel = `${(commissionRate * 100).toFixed(0)}% Uride Platform Fee`;
                  await base44.asServiceRole.entities.Notification.create({
                    user_email: host.email,
                    title: `💰 Payout Sent — $${netHostPayout.toLocaleString()}`,
                    body: `Payment received: $${grossAmount}. After ${feeLabel} ($${uridePlatformFee}) and Stripe processing ($${stripeFeeAmount.toFixed(2)}), your net payout of $${netHostPayout} is on its way. Arrives within 2 business days.`,
                    type: 'payment',
                  });

                  console.log(`[AutoPayout] ✓ Transfer ${transfer.id} — $${netHostPayout} to ${host.stripe_account_id} for booking ${bookingRequestId} | Gross: $${grossAmount} | Uride Fee: $${uridePlatformFee} (${(commissionRate*100).toFixed(0)}%) | Stripe Fee: $${stripeFeeAmount}`);
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
        if (customerId && si.payment_method) {
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
              body: "Your Stripe Connect account is verified. You'll now automatically receive payouts after each rental. Uride Platform Fee is 8% — you keep 92% before Stripe processing.",
              type: "system",
            });
            console.log(`[Webhook] Host ${account.metadata.host_id} Stripe onboarding complete`);
          }
        }
        break;
      }

      default:
        break;
    }

    return Response.json({ received: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});