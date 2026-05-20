import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

async function logEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: data.actor_id || 'system',
      actor_email: data.actor_email || 'system',
      actor_role: data.actor_role || 'automation',
      target_entity: data.target_entity || '',
      target_id: data.target_id || '',
      target_label: data.target_label || '',
      host_id: data.host_id || '',
      booking_id: data.booking_id || '',
      vehicle_id: data.vehicle_id || '',
      customer_id: data.customer_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: data.source || 'webhook',
      user_email: data.actor_email || 'system',
      event_title: data.summary || data.event_type,
      event_description: data.summary || '',
      event_status: 'success',
    });
  } catch (e) {
    console.error('[AuditLog]', e.message);
  }
}

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

            const grossAmount = pi.amount / 100;

            if (booking.vehicle_id && grossAmount > 0) {
              const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
              const vehicle = vehicles[0];

              if (vehicle?.host_id) {
                const hosts = await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id });
                const host = hosts[0];

                if (host?.stripe_account_id && host?.stripe_onboarding_complete) {
                  const commissionRate = host.commission_rate ?? 0.08;

                  let stripeFeeAmount = 0;
                  let stripeEffectiveRate = 0;
                  const chargeId = pi.charges?.data?.[0]?.id;
                  if (chargeId) {
                    const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
                    if (charge.balance_transaction?.fee) {
                      stripeFeeAmount = charge.balance_transaction.fee / 100;
                      stripeEffectiveRate = (stripeFeeAmount / grossAmount) * 100;
                    }
                  }

                  const uridePlatformFee = Math.round(grossAmount * commissionRate * 100) / 100;
                  const hostTransferAmount = Math.round((grossAmount - uridePlatformFee) * 100);
                  const netHostPayout = hostTransferAmount / 100;

                  const transfer = await stripe.transfers.create({
                    amount: hostTransferAmount,
                    currency: 'usd',
                    destination: host.stripe_account_id,
                    description: `UrideHub payout — ${host.full_name} — booking ${bookingRequestId}`,
                    metadata: { host_id: host.id, booking_request_id: bookingRequestId, platform: 'uride' },
                  });

                  const vehicleName = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : null;

                  await base44.asServiceRole.entities.HostPayout.create({
                    host_id: host.id,
                    host_email: host.email,
                    host_name: host.full_name,
                    booking_request_id: bookingRequestId,
                    vehicle_name: vehicleName,
                    period_start: booking.start_date || new Date().toISOString().slice(0, 10),
                    period_end: booking.end_date || new Date().toISOString().slice(0, 10),
                    gross_booking_amount: grossAmount,
                    stripe_fee_amount: stripeFeeAmount,
                    stripe_effective_rate: Math.round(stripeEffectiveRate * 100) / 100,
                    uride_platform_fee_amount: uridePlatformFee,
                    uride_platform_fee_rate: commissionRate,
                    net_host_payout: netHostPayout,
                    gross_collected: grossAmount,
                    platform_fee: uridePlatformFee,
                    net_payout: netHostPayout,
                    status: 'paid',
                    stripe_transfer_id: transfer.id,
                    payout_date: new Date().toISOString().slice(0, 10),
                    booking_count: 1,
                    vehicle_count: 1,
                  });

                  await base44.asServiceRole.entities.Host.update(host.id, {
                    total_earnings: (host.total_earnings || 0) + grossAmount,
                    total_payouts: (host.total_payouts || 0) + netHostPayout,
                  });

                  const feeLabel = `${(commissionRate * 100).toFixed(0)}% Uride Platform Fee`;
                  await base44.asServiceRole.entities.Notification.create({
                    user_email: host.email,
                    title: `💰 Payout Sent — $${netHostPayout.toLocaleString()}`,
                    body: `Payment received: $${grossAmount}. After ${feeLabel} ($${uridePlatformFee}) and Stripe processing ($${stripeFeeAmount.toFixed(2)}), your net payout of $${netHostPayout} is on its way. Arrives within 2 business days.`,
                    type: 'payment',
                  });

                  console.log(`[AutoPayout] ✓ Transfer ${transfer.id} — $${netHostPayout} to ${host.stripe_account_id} for booking ${bookingRequestId}`);

                  await logEvent(base44, {
                    event_type: 'payout.sent',
                    actor_id: 'stripe_webhook',
                    actor_email: 'stripe@stripe.com',
                    actor_role: 'stripe',
                    target_entity: 'HostPayout',
                    host_id: host.id,
                    booking_id: bookingRequestId,
                    vehicle_id: booking.vehicle_id || '',
                    summary: `Payout $${netHostPayout} sent to ${host.full_name} for booking ${bookingRequestId}`,
                    metadata: { transfer_id: transfer.id, gross: grossAmount, platform_fee: uridePlatformFee, net: netHostPayout },
                    source: 'webhook',
                  });
                } else {
                  console.log(`[AutoPayout] Host ${vehicle.host_id} not eligible for auto-payout (no Stripe account or onboarding incomplete)`);
                }
              }
            }

            await logEvent(base44, {
              event_type: 'payment.succeeded',
              actor_id: 'stripe_webhook',
              actor_email: 'stripe@stripe.com',
              actor_role: 'stripe',
              target_entity: 'BookingRequest',
              target_id: bookingRequestId,
              booking_id: bookingRequestId,
              vehicle_id: booking.vehicle_id || '',
              host_id: booking.host_id || '',
              customer_id: booking.user_email || '',
              summary: `Payment $${grossAmount} received for booking ${bookingRequestId}`,
              metadata: { payment_intent_id: pi.id, amount: pi.amount / 100, receipt_url: receiptUrl },
              source: 'webhook',
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
          await base44.asServiceRole.entities.Notification.create({
            title: 'Payment Failed',
            body: `Payment failed for booking ${bookingRequestId}. Reason: ${pi.last_payment_error?.message || 'Unknown'}`,
            type: 'payment',
            booking_request_id: bookingRequestId,
            user_email: pi.metadata?.user_email || '',
          });
          await logEvent(base44, {
            event_type: 'payment.failed',
            actor_id: 'stripe_webhook',
            actor_email: 'stripe@stripe.com',
            actor_role: 'stripe',
            target_entity: 'BookingRequest',
            target_id: bookingRequestId,
            booking_id: bookingRequestId,
            customer_id: pi.metadata?.user_email || '',
            summary: `Payment failed for booking ${bookingRequestId}: ${pi.last_payment_error?.message || 'unknown reason'}`,
            metadata: { payment_intent_id: pi.id, reason: pi.last_payment_error?.message },
            source: 'webhook',
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
          await logEvent(base44, {
            event_type: 'payment.refunded',
            actor_id: 'stripe_webhook',
            actor_email: 'stripe@stripe.com',
            actor_role: 'stripe',
            target_entity: 'BookingRequest',
            target_id: bookingRequestId,
            booking_id: bookingRequestId,
            summary: `Refund processed for booking ${bookingRequestId}`,
            metadata: { charge_id: charge.id, amount_refunded: charge.amount_refunded / 100 },
            source: 'webhook',
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
              title: '✅ Stripe Payouts Activated!',
              body: 'Your Stripe Connect account is verified. You\'ll now automatically receive payouts after each rental. Uride Platform Fee is 8% — you keep 92% before Stripe processing.',
              type: 'system',
            });
            await logEvent(base44, {
              event_type: 'host.stripe_connected',
              actor_id: 'stripe_webhook',
              actor_email: 'stripe@stripe.com',
              actor_role: 'stripe',
              target_entity: 'Host',
              target_id: account.metadata.host_id,
              host_id: account.metadata.host_id,
              summary: `Host ${hosts[0].email} completed Stripe Connect onboarding`,
              metadata: { stripe_account_id: account.id },
              source: 'webhook',
            });
            console.log(`[Webhook] Host ${account.metadata.host_id} Stripe onboarding complete`);
          }
        }
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object;
        const stripeDisputeId = dispute.id;

        // Idempotency: skip if already processed
        const existingDisputes = await base44.asServiceRole.entities.Dispute.filter({ stripe_dispute_id: stripeDisputeId });
        if (existingDisputes.length > 0) {
          console.log(`[Webhook] Duplicate dispute event for ${stripeDisputeId} — skipping`);
          break;
        }

        // Find the booking via payment_intent
        const paymentIntentId = dispute.payment_intent;
        let booking = null;
        if (paymentIntentId) {
          const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ stripe_payment_intent_id: paymentIntentId });
          booking = bookings[0];
        }

        const dueBy = dispute.evidence_details?.due_by
          ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
          : null;

        // Create Dispute record
        const disputeRecord = await base44.asServiceRole.entities.Dispute.create({
          booking_request_id: booking?.id || '',
          vehicle_id: booking?.vehicle_id || '',
          vehicle_name: booking?.vehicle_name || '',
          host_id: booking?.host_id || '',
          customer_email: booking?.user_email || '',
          dispute_type: 'chargeback',
          opened_by: 'stripe',
          status: 'chargeback',
          description: `Stripe chargeback received: ${dispute.reason || 'unknown reason'} — $${(dispute.amount / 100).toFixed(2)}`,
          stripe_dispute_id: stripeDisputeId,
          stripe_dispute_status: dispute.status,
          stripe_dispute_amount: dispute.amount / 100,
          due_by: dueBy,
        });

        if (booking) {
          // Mark booking under review
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            booking_status: 'under_review',
          });

          // Hold any unpaid/pending payouts for this booking
          const payouts = await base44.asServiceRole.entities.HostPayout.filter({ booking_request_id: booking.id });
          for (const payout of payouts) {
            if (['pending', 'processing'].includes(payout.status)) {
              await base44.asServiceRole.entities.HostPayout.update(payout.id, {
                status: 'held',
                hold_reason: 'chargeback',
                hold_notes: `Stripe chargeback ${stripeDisputeId} — $${(dispute.amount / 100).toFixed(2)}`,
                held_at: new Date().toISOString(),
                held_by: 'stripe_webhook',
              });
              console.log(`[Webhook] Payout ${payout.id} held for chargeback ${stripeDisputeId}`);
            } else if (payout.status === 'paid') {
              // Already paid out — flag for admin review only
              await base44.asServiceRole.entities.HostPayout.update(payout.id, {
                hold_notes: `⚠️ CHARGEBACK ALERT: ${stripeDisputeId} — payout already sent, admin review needed`,
              });
            }
          }

          // Increment customer chargeback count
          if (booking.user_email) {
            const customers = await base44.asServiceRole.entities.Customer.filter({ email: booking.user_email });
            if (customers[0]) {
              await base44.asServiceRole.entities.Customer.update(customers[0].id, {
                chargeback_count: (customers[0].chargeback_count || 0) + 1,
              });
            }
          }
        }

        await logEvent(base44, {
          event_type: 'dispute.chargeback_received',
          actor_id: 'stripe_webhook',
          actor_email: 'stripe@stripe.com',
          actor_role: 'stripe',
          target_entity: 'Dispute',
          target_id: disputeRecord.id,
          booking_id: booking?.id || '',
          vehicle_id: booking?.vehicle_id || '',
          host_id: booking?.host_id || '',
          customer_id: booking?.user_email || '',
          summary: `CHARGEBACK received: $${(dispute.amount / 100).toFixed(2)} — ${dispute.reason || 'unknown'} — due ${dueBy ? new Date(dueBy).toLocaleDateString() : 'unknown'}`,
          metadata: { stripe_dispute_id: stripeDisputeId, amount: dispute.amount / 100, reason: dispute.reason, due_by: dueBy, stripe_status: dispute.status },
          source: 'webhook',
        });

        console.log(`[Webhook] ⚠️ CHARGEBACK: ${stripeDisputeId} — $${(dispute.amount / 100).toFixed(2)} — Due: ${dueBy}`);
        break;
      }

      case 'charge.dispute.updated': {
        const dispute = event.data.object;
        const existing = await base44.asServiceRole.entities.Dispute.filter({ stripe_dispute_id: dispute.id });
        if (existing[0]) {
          await base44.asServiceRole.entities.Dispute.update(existing[0].id, {
            stripe_dispute_status: dispute.status,
          });
        }
        console.log(`[Webhook] Dispute updated: ${dispute.id} → ${dispute.status}`);
        break;
      }

      case 'charge.dispute.closed': {
        const dispute = event.data.object;
        const existing = await base44.asServiceRole.entities.Dispute.filter({ stripe_dispute_id: dispute.id });
        if (existing[0]) {
          const won = dispute.status === 'won';
          const newStatus = won ? 'resolved_host_favor' : 'resolved_customer_favor';
          await base44.asServiceRole.entities.Dispute.update(existing[0].id, {
            stripe_dispute_status: dispute.status,
            status: newStatus,
            resolved_at: new Date().toISOString(),
            resolved_by: 'stripe',
          });

          // If won, release held payout
          if (won && existing[0].booking_request_id) {
            const payouts = await base44.asServiceRole.entities.HostPayout.filter({ booking_request_id: existing[0].booking_request_id });
            for (const payout of payouts) {
              if (payout.status === 'held' && payout.hold_reason === 'chargeback') {
                await base44.asServiceRole.entities.HostPayout.update(payout.id, {
                  status: 'pending',
                  released_at: new Date().toISOString(),
                  hold_notes: (payout.hold_notes || '') + ' — Released: dispute won',
                });
              }
            }
          }

          await logEvent(base44, {
            event_type: 'dispute.resolved',
            actor_id: 'stripe_webhook',
            actor_email: 'stripe@stripe.com',
            actor_role: 'stripe',
            target_entity: 'Dispute',
            target_id: existing[0].id,
            booking_id: existing[0].booking_request_id || '',
            summary: `Dispute ${dispute.id} closed: ${dispute.status} — ${won ? 'payout hold released' : 'customer wins'}`,
            metadata: { stripe_dispute_id: dispute.id, outcome: dispute.status },
            source: 'webhook',
          });
        }
        console.log(`[Webhook] Dispute closed: ${dispute.id} → ${dispute.status}`);
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