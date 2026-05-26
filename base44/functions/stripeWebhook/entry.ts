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

function generatePaymentDedupeKey({ sourceType = 'unknown', bookingId = '', weekNumber = '', amount = '', paidAt = '', paymentIntentId = '', externalReference = '', paymentMethod = '' }) {
  if (paymentIntentId) return `payment:stripe:${paymentIntentId}`;
  const paidDate = paidAt ? String(paidAt).slice(0, 10) : 'no-date';
  return `payment:${sourceType}:${bookingId}:week:${weekNumber}:amount:${amount}:date:${paidDate}:method:${paymentMethod || 'other'}:ref:${externalReference || 'none'}`;
}

function classifyPaymentSource({ sourceType, paymentIntentId, recordedBy } = {}) {
  if (sourceType) return sourceType;
  if (paymentIntentId) return recordedBy === 'stripe_webhook' ? 'stripe_webhook' : 'scheduled_billing';
  return 'unknown';
}

function classifyPaymentConfidence({ paymentIntentId } = {}) {
  return paymentIntentId ? 'trusted' : 'unresolved';
}

function getBillingContext(metadata = {}) {
  return metadata.billing_context || (metadata.booking_request_id ? 'rental_marketplace_payment' : 'unknown');
}

async function createPaymentAlert(base44, payload) {
  try {
    await base44.asServiceRole.functions.invoke('createPaymentOperationalAlert', payload);
  } catch (e) {
    console.error('[PaymentOperationalAlert]', e.message);
  }
}

function alertTypeForInvoiceFailure(context) {
  if (context === 'operator_subscription') return 'subscription_payment_failed';
  if (context === 'dealer_network_membership') return 'dealer_membership_payment_failed';
  if (context === 'contactless_gps' || context === 'gps_contactless_subscription') return 'contactless_gps_payment_failed';
  return 'unknown_payment_failed';
}

async function resolveMarketplaceFee(base44, booking = {}) {
  const bookingSource = booking.booking_source || 'marketplace';
  let operatorMode = 'marketplace_partner';
  let fallbackUsed = true;
  let reason = 'Default marketplace fallback rate.';

  if (!['marketplace', 'direct', 'admin_created', 'imported', 'dealer_network'].includes(bookingSource)) {
    reason = 'Unknown booking source treated as marketplace for legacy safety.';
  }

  if (booking.host_id) {
    const plans = await base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id: booking.host_id });
    const plan = plans[0];
    if (plan) {
      operatorMode = plan.active_mode && plan.active_mode !== 'none' ? plan.active_mode : (plan.selected_mode || plan.recommended_mode || operatorMode);
      fallbackUsed = false;
      reason = 'Resolved from OperatorPlanConfiguration.';
    }
  }

  let feeRate = 0;
  if (bookingSource === 'marketplace') {
    feeRate = operatorMode === 'hybrid_growth' ? 0.04 : operatorMode === 'fleetos_professional' ? 0 : 0.08;
  } else {
    feeRate = 0;
    reason = fallbackUsed ? 'Non-marketplace booking source uses no marketplace fee fallback.' : 'Non-marketplace booking source uses no marketplace fee.';
  }

  await logEvent(base44, {
    event_type: 'billing.fee_rate_calculated',
    actor_id: 'billing_context_router',
    actor_email: 'system',
    actor_role: 'automation',
    target_entity: 'BookingRequest',
    target_id: booking.id || '',
    host_id: booking.host_id || '',
    booking_id: booking.id || '',
    summary: `Marketplace fee resolved: ${(feeRate * 100).toFixed(0)}% for ${operatorMode}`,
    metadata: { host_id: booking.host_id || '', booking_id: booking.id || '', operator_mode: operatorMode, booking_source: bookingSource, fee_rate_used: feeRate, fallback_used: fallbackUsed, reason },
    source: 'billing_readiness',
  });

  return { feeRate, operatorMode, bookingSource, fallbackUsed, reason };
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
        const billingContext = getBillingContext(pi.metadata || {});
        if (billingContext !== 'rental_marketplace_payment') {
          console.log(`[Webhook] Recognized non-rental billing context ${billingContext}; no live subscription/dealer/GPS billing action taken.`);
          await createPaymentAlert(base44, { alert_type: 'unknown_billing_context', severity: 'info', billing_context: billingContext, stripe_event_type: event.type, stripe_payment_intent_id: pi.id, title: 'Non-rental Stripe payment recognized', message: `Stripe payment succeeded for non-rental context: ${billingContext}. No subscription, Dealer Network, or GPS action was activated.`, recommended_action: 'Review billing context routing before future activation.', financial_impact_amount: (pi.amount || 0) / 100, currency: pi.currency || 'usd', source: 'stripe_webhook' });
          await logEvent(base44, { event_type: 'billing.context_ignored', actor_id: 'stripe_webhook', actor_email: 'stripe@stripe.com', actor_role: 'stripe', summary: `Ignored non-rental payment_intent.succeeded context: ${billingContext}`, metadata: { billing_context: billingContext, payment_intent_id: pi.id }, source: 'webhook' });
          break;
        }
        const bookingRequestId = pi.metadata?.booking_request_id;
        const chargeData = pi.charges?.data?.[0];
        const receiptUrl = chargeData?.receipt_url;
        const chargeId = chargeData?.id;
        const balanceTransactionId = typeof chargeData?.balance_transaction === 'string' ? chargeData.balance_transaction : chargeData?.balance_transaction?.id;

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
            let resolvedHostId = booking.host_id || '';
            let resolvedVehicleName = booking.vehicle_name || '';

            if (booking.vehicle_id && grossAmount > 0) {
              const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
              const vehicle = vehicles[0];

              if (vehicle?.host_id) {
                resolvedHostId = resolvedHostId || vehicle.host_id;
                resolvedVehicleName = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || resolvedVehicleName;
                const hosts = await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id });
                const host = hosts[0];

                if (host?.stripe_account_id && host?.stripe_onboarding_complete) {
                  const { feeRate: commissionRate } = await resolveMarketplaceFee(base44, { ...booking, host_id: host.id });

                  let stripeFeeAmount = 0;
                  let stripeEffectiveRate = 0;
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

            const existingPaymentLogs = await base44.asServiceRole.entities.PaymentLog.filter({ stripe_payment_intent_id: pi.id });
            if (existingPaymentLogs.length === 0 && grossAmount > 0) {
              const weekNumber = booking.billing_week_number || Number(pi.metadata?.week_number) || 1;
              const paidAt = new Date().toISOString();
              const sourceType = classifyPaymentSource({ paymentIntentId: pi.id, recordedBy: 'stripe_webhook' });
              const dedupeKey = generatePaymentDedupeKey({ sourceType, bookingId: bookingRequestId, weekNumber, amount: grossAmount, paidAt, paymentIntentId: pi.id, paymentMethod: 'stripe' });
              const paymentLog = await base44.asServiceRole.entities.PaymentLog.create({
                booking_request_id: bookingRequestId,
                host_id: resolvedHostId,
                customer_email: booking.user_email,
                customer_name: booking.customer_full_name || '',
                vehicle_id: booking.vehicle_id,
                vehicle_name: resolvedVehicleName,
                week_number: weekNumber,
                billing_period_start: booking.start_date || '',
                billing_period_end: booking.end_date || '',
                amount: grossAmount,
                currency: pi.currency || 'usd',
                payment_method: 'stripe',
                source_type: sourceType,
                source_confidence: classifyPaymentConfidence({ paymentIntentId: pi.id }),
                legacy_flag: false,
                external_reconcilable: true,
                dedupe_key: dedupeKey,
                stripe_payment_intent_id: pi.id,
                stripe_charge_id: chargeId || '',
                stripe_customer_id: pi.customer || booking.stripe_customer_id || '',
                stripe_payment_method_id: pi.payment_method || booking.stripe_payment_method_id || '',
                stripe_balance_transaction_id: balanceTransactionId || '',
                stripe_receipt_url: receiptUrl || '',
                receipt_url: receiptUrl || '',
                status: 'paid',
                recorded_by: 'stripe_webhook',
                paid_at: paidAt,
              });
              await logEvent(base44, {
                event_type: 'payment.logged',
                actor_id: 'stripe_webhook',
                actor_email: 'stripe@stripe.com',
                actor_role: 'stripe',
                target_entity: 'PaymentLog',
                target_id: paymentLog.id,
                booking_id: bookingRequestId,
                vehicle_id: booking.vehicle_id || '',
                host_id: resolvedHostId,
                customer_id: booking.user_email || '',
                summary: `Hardened PaymentLog created for booking ${bookingRequestId}`,
                metadata: { payment_log_id: paymentLog.id, dedupe_key: dedupeKey, source_type: sourceType },
                source: 'webhook',
              });
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
              host_id: resolvedHostId,
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
        const billingContext = getBillingContext(pi.metadata || {});
        if (billingContext !== 'rental_marketplace_payment') {
          console.log(`[Webhook] Recognized non-rental failed payment context ${billingContext}; no rental failure action taken.`);
          await createPaymentAlert(base44, { alert_type: alertTypeForInvoiceFailure(billingContext), severity: 'critical', billing_context: billingContext, stripe_event_type: event.type, stripe_payment_intent_id: pi.id, renter_email: pi.metadata?.user_email || '', title: 'Non-rental payment failed', message: `A ${billingContext} payment failed. No automatic suspension or billing activation was performed.`, recommended_action: 'Review the billing issue and contact the operator if needed.', financial_impact_amount: (pi.amount || 0) / 100, currency: pi.currency || 'usd', requires_customer_action: false, source: 'stripe_webhook' });
          await logEvent(base44, { event_type: 'billing.context_ignored', actor_id: 'stripe_webhook', actor_email: 'stripe@stripe.com', actor_role: 'stripe', summary: `Ignored non-rental payment_intent.payment_failed context: ${billingContext}`, metadata: { billing_context: billingContext, payment_intent_id: pi.id }, source: 'webhook' });
          break;
        }
        const bookingRequestId = pi.metadata?.booking_request_id;
        if (bookingRequestId) {
          const failedBookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: bookingRequestId });
          const failedBooking = failedBookings[0];
          let failedHostEmail = '';
          if (failedBooking?.host_id) {
            const failedHosts = await base44.asServiceRole.entities.Host.filter({ id: failedBooking.host_id });
            failedHostEmail = failedHosts[0]?.email || '';
          }
          await createPaymentAlert(base44, { alert_type: 'rental_payment_failed', severity: 'critical', billing_context: 'rental_payment', booking_id: bookingRequestId, host_id: failedBooking?.host_id || '', customer_id: failedBooking?.user_id || '', vehicle_id: failedBooking?.vehicle_id || '', renter_email: failedBooking?.user_email || pi.metadata?.user_email || '', host_email: failedHostEmail, stripe_event_type: event.type, stripe_payment_intent_id: pi.id, related_entity_type: 'BookingRequest', related_entity_id: bookingRequestId, title: 'Rental payment failed', message: `Payment failed for booking ${bookingRequestId}: ${pi.last_payment_error?.message || 'unknown reason'}`, financial_impact_amount: (pi.amount || 0) / 100, currency: pi.currency || 'usd', source: 'stripe_webhook' });
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

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const billingContext = getBillingContext(invoice.metadata || {});
        await createPaymentAlert(base44, { alert_type: alertTypeForInvoiceFailure(billingContext), severity: 'critical', billing_context: billingContext, stripe_event_type: event.type, stripe_invoice_id: invoice.id, title: 'Invoice payment failed', message: `Invoice payment failed for ${billingContext}. No automatic suspension or subscription activation occurred.`, recommended_action: 'Review billing issue and contact the operator/customer as appropriate.', financial_impact_amount: (invoice.amount_due || 0) / 100, currency: invoice.currency || 'usd', requires_customer_action: false, source: 'stripe_webhook' });
        break;
      }

      case 'invoice.payment_action_required': {
        const invoice = event.data.object;
        const billingContext = getBillingContext(invoice.metadata || {});
        await createPaymentAlert(base44, { alert_type: 'payment_authentication_required', severity: billingContext === 'rental_marketplace_payment' ? 'critical' : 'warning', billing_context: billingContext, stripe_event_type: event.type, stripe_invoice_id: invoice.id, title: 'Payment authentication required', message: `Payment authentication is required for ${billingContext}.`, recommended_action: 'Prompt the payer to authenticate payment or update payment method.', financial_impact_amount: (invoice.amount_due || 0) / 100, currency: invoice.currency || 'usd', source: 'stripe_webhook' });
        break;
      }

      case 'transfer.failed': {
        const transfer = event.data.object;
        await createPaymentAlert(base44, { alert_type: 'transfer_failed', severity: 'critical', billing_context: 'payout', stripe_event_type: event.type, stripe_transfer_id: transfer.id, host_id: transfer.metadata?.host_id || '', booking_id: transfer.metadata?.booking_id || transfer.metadata?.booking_request_id || '', related_entity_type: 'StripeTransfer', related_entity_id: transfer.id, title: 'Stripe transfer failed', message: `Stripe transfer ${transfer.id} failed.`, recommended_action: 'Review payout destination and contact host before retrying payout.', financial_impact_amount: (transfer.amount || 0) / 100, currency: transfer.currency || 'usd', source: 'stripe_webhook' });
        break;
      }

      case 'payout.failed':
      case 'payout.canceled': {
        const payout = event.data.object;
        await createPaymentAlert(base44, { alert_type: 'payout_reversal', severity: 'critical', billing_context: 'payout', stripe_event_type: event.type, stripe_payout_id: payout.id, related_entity_type: 'StripePayout', related_entity_id: payout.id, title: 'Stripe payout issue', message: `Stripe payout event ${event.type} received for ${payout.id}.`, recommended_action: 'Review payout issue in Stripe and notify finance operations.', financial_impact_amount: (payout.amount || 0) / 100, currency: payout.currency || 'usd', source: 'stripe_webhook' });
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
        const billingContext = getBillingContext(charge.metadata || {});
        if (billingContext !== 'rental_marketplace_payment') {
          console.log(`[Webhook] Recognized non-rental refund context ${billingContext}; no rental refund action taken.`);
          await logEvent(base44, { event_type: 'billing.context_ignored', actor_id: 'stripe_webhook', actor_email: 'stripe@stripe.com', actor_role: 'stripe', summary: `Ignored non-rental charge.refunded context: ${billingContext}`, metadata: { billing_context: billingContext, charge_id: charge.id }, source: 'webhook' });
          break;
        }
        const bookingRequestId = charge.metadata?.booking_request_id;
        await createPaymentAlert(base44, { alert_type: 'refund_recorded', severity: charge.amount_refunded > 0 ? 'warning' : 'info', billing_context: 'refund', booking_id: bookingRequestId || '', stripe_event_type: event.type, stripe_charge_id: charge.id, related_entity_type: bookingRequestId ? 'BookingRequest' : 'StripeCharge', related_entity_id: bookingRequestId || charge.id, title: 'Refund recorded', message: `Stripe refund recorded for ${bookingRequestId || charge.id}.`, recommended_action: 'Review refund and payout impact if needed.', financial_impact_amount: (charge.amount_refunded || 0) / 100, currency: charge.currency || 'usd', source: 'stripe_webhook' });
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
        await createPaymentAlert(base44, { alert_type: 'chargeback_opened', severity: 'critical', billing_context: 'chargeback', stripe_event_type: event.type, stripe_dispute_id: stripeDisputeId, stripe_payment_intent_id: dispute.payment_intent || '', related_entity_type: 'StripeDispute', related_entity_id: stripeDisputeId, title: 'Chargeback opened', message: `Stripe chargeback opened for $${((dispute.amount || 0) / 100).toFixed(2)}.`, recommended_action: 'Review dispute evidence, contact host, and prepare response before the deadline.', financial_impact_amount: (dispute.amount || 0) / 100, currency: dispute.currency || 'usd', source: 'stripe_webhook' });

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
        await createPaymentAlert(base44, { alert_type: dispute.status === 'won' ? 'chargeback_won' : 'chargeback_lost', severity: dispute.status === 'won' ? 'info' : 'critical', billing_context: 'chargeback', stripe_event_type: event.type, stripe_dispute_id: dispute.id, stripe_payment_intent_id: dispute.payment_intent || '', related_entity_type: 'StripeDispute', related_entity_id: dispute.id, title: dispute.status === 'won' ? 'Chargeback won' : 'Chargeback lost', message: `Stripe dispute ${dispute.id} closed with status ${dispute.status}.`, recommended_action: dispute.status === 'won' ? 'Confirm dispute outcome and close related operational alerts.' : 'Review financial exposure and determine manual remediation.', financial_impact_amount: (dispute.amount || 0) / 100, currency: dispute.currency || 'usd', source: 'stripe_webhook' });
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