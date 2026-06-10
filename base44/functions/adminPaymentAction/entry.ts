import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

// ---------------------------------------------------------------------------
// CANONICAL PLATFORM FEE RESOLVER (inlined — no local imports in Deno deploy)
// Mirrors lib/platformFeeResolver.js exactly. Any changes to fee rules MUST be
// applied to BOTH this inline copy AND lib/platformFeeResolver.js.
// ---------------------------------------------------------------------------
const PLAN_FEE_DEFAULTS = {
  marketplace_partner:  { platform_fee_rate: 0.08, requires_platform_fee: true },
  hybrid_growth:        { platform_fee_rate: 0.05, requires_platform_fee: true },
  fleetos_professional: { platform_fee_rate: 0.00, requires_platform_fee: false },
};
const MANUAL_PAYMENT_METHODS = ['zelle', 'cash', 'cashapp', 'venmo', 'check', 'other'];

function resolvePlatformFee({ planMode, grossAmount, paymentMethod = 'stripe', operatorPlan = null, commerceProfile = null }) {
  const gross = Number(grossAmount) || 0;
  // Normalize plan mode
  let normalizedPlan = planMode;
  if (!normalizedPlan || normalizedPlan === 'none' || !PLAN_FEE_DEFAULTS[normalizedPlan]) {
    normalizedPlan = operatorPlan?.active_mode || operatorPlan?.selected_mode;
  }
  if (!normalizedPlan || normalizedPlan === 'none' || !PLAN_FEE_DEFAULTS[normalizedPlan]) {
    normalizedPlan = commerceProfile?.plan_type;
  }
  if (!normalizedPlan || !PLAN_FEE_DEFAULTS[normalizedPlan]) normalizedPlan = 'marketplace_partner';

  const planDefaults = PLAN_FEE_DEFAULTS[normalizedPlan];
  let effectiveFeeRate = planDefaults.platform_fee_rate;
  if (operatorPlan?.marketplace_fee_rate != null && operatorPlan.marketplace_fee_rate >= 0) {
    effectiveFeeRate = operatorPlan.marketplace_fee_rate;
  } else if (commerceProfile?.commission_rate != null && commerceProfile.commission_rate >= 0) {
    effectiveFeeRate = commerceProfile.commission_rate;
  }

  const isManual = MANUAL_PAYMENT_METHODS.includes((paymentMethod || '').toLowerCase());
  const requiresFee = planDefaults.requires_platform_fee && effectiveFeeRate > 0;
  const platformFeeAmountDue = requiresFee ? Math.round(gross * effectiveFeeRate * 100) / 100 : 0;
  const hostNetAfterFee = Math.round((gross - platformFeeAmountDue) * 100) / 100;

  return {
    platform_fee_rate: effectiveFeeRate,
    platform_fee_amount_due: platformFeeAmountDue,
    host_net_after_fee: hostNetAfterFee,
    requires_platform_fee: requiresFee,
    fee_collection_status: platformFeeAmountDue > 0 ? 'due' : 'not_applicable',
    manual_collection_requires_platform_fee: isManual && requiresFee,
    is_manual_payment: isManual,
    plan_mode: normalizedPlan,
  };
}
// ---------------------------------------------------------------------------

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });

async function logEvent(base44, adminEmail, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: adminEmail,
      actor_email: adminEmail,
      actor_role: 'admin',
      target_entity: data.target_entity || 'BookingRequest',
      target_id: data.target_id || '',
      booking_id: data.booking_id || '',
      vehicle_id: data.vehicle_id || '',
      host_id: data.host_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: 'admin_panel',
      user_email: adminEmail,
      event_title: data.summary || data.event_type,
      event_status: data.event_status || 'success',
    });
  } catch (e) {
    console.error('[AuditLog]', e.message);
  }
}

// MooveTrax kill switch — real API call
async function moovetraxKillSwitch(deviceId, enable) {
  const partnerApiKey = Deno.env.get("MOOVETRAX_PARTNER_API_KEY") || "";
  const command = enable ? "kill" : "unkill";
  const params = new URLSearchParams({ key: deviceId, ...(partnerApiKey && { partner_api_key: partnerApiKey }) });
  const url = `https://www.moovetrax.com/api/${command}?${params.toString()}`;
  console.log(`[MooveTrax] ${command.toUpperCase()} device: ${deviceId}`);
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  console.log(`[MooveTrax] Response: ${text}`);
  return { ok: res.ok, response: text };
}

// Send SMS via Twilio
async function sendSMS(to, message) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!accountSid || !authToken || !from || !to) return;
  const body = new URLSearchParams({ To: to, From: from, Body: message });
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== "admin") {
      return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const { action, booking_request_id, amount, description, reason, extend_hours } = body;

    if (!booking_request_id || !action) {
      return Response.json({ error: "booking_request_id and action are required" }, { status: 400 });
    }

    const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_request_id });
    const booking = bookings[0];
    if (!booking) {
      return Response.json({ error: "Booking not found" }, { status: 404 });
    }

    switch (action) {

      case "refund": {
        if (!booking.stripe_payment_intent_id) {
          return Response.json({ error: "No payment intent found for this booking" }, { status: 400 });
        }
        const refundAmount = amount ? Math.round(amount * 100) : undefined;
        const refund = await stripe.refunds.create({
          payment_intent: booking.stripe_payment_intent_id,
          ...(refundAmount && { amount: refundAmount }),
          reason: "requested_by_customer",
          metadata: { booking_request_id, admin_email: user.email, reason: reason || "Admin initiated" },
        });

        await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
          payment_status: "refunded",
          admin_notes: `Refund issued by ${user.email}: $${amount || "full"} — ${reason || ""}`,
        });

        await base44.asServiceRole.entities.Notification.create({
          user_email: booking.user_email,
          title: "Refund Issued",
          body: `A refund of $${amount || "full amount"} has been issued for your ${booking.vehicle_name} rental. Please allow 5-10 business days.`,
          type: "payment",
          booking_request_id,
        });

        await logEvent(base44, user.email, {
          event_type: 'payment.refunded',
          target_id: booking_request_id,
          booking_id: booking_request_id,
          vehicle_id: booking.vehicle_id || '',
          host_id: booking.host_id || '',
          summary: `Admin refund $${amount || 'full'} for booking ${booking_request_id} — ${reason || 'no reason given'}`,
          metadata: { refund_id: refund.id, amount, reason },
        });

        return Response.json({ ok: true, refund_id: refund.id, status: refund.status });
      }

      case "charge_toll":
      case "charge_key_fee":
      case "charge_custom": {
        if (!booking.stripe_customer_id || !booking.stripe_payment_method_id) {
          return Response.json({ error: "No saved payment method for this customer" }, { status: 400 });
        }
        if (!amount || amount <= 0) {
          return Response.json({ error: "Amount is required and must be positive" }, { status: 400 });
        }

        const chargeDescription = action === "charge_toll"
          ? `uRide Toll Fee — ${description || booking.vehicle_name}`
          : action === "charge_key_fee"
          ? `uRide Lost Key Fee — ${booking.vehicle_name}`
          : `uRide Additional Charge — ${description || reason || "Admin charge"}`;

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: "usd",
          customer: booking.stripe_customer_id,
          payment_method: booking.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: chargeDescription,
          metadata: { booking_request_id, action, admin_email: user.email },
        });

        await base44.asServiceRole.entities.Notification.create({
          user_email: booking.user_email,
          title: action === "charge_toll" ? "Toll Fee Charged" : action === "charge_key_fee" ? "Lost Key Fee Charged" : "Additional Charge",
          body: `$${amount} was charged to your card on file. Reason: ${chargeDescription}`,
          type: "payment",
          booking_request_id,
        });

        // H1 FIX: Create PaymentLog for all admin charges
        const chargeData = paymentIntent.charges?.data?.[0];
        const paidAt = new Date().toISOString();
        await base44.asServiceRole.entities.PaymentLog.create({
          booking_request_id,
          host_id: booking.host_id || '',
          customer_email: booking.user_email,
          customer_name: booking.customer_full_name || '',
          vehicle_id: booking.vehicle_id || '',
          vehicle_name: booking.vehicle_name || '',
          week_number: booking.billing_week_number || 0,
          billing_period_start: paidAt.slice(0, 10),
          billing_period_end: paidAt.slice(0, 10),
          amount,
          currency: 'usd',
          payment_method: 'stripe',
          source_type: 'admin_manual',
          source_confidence: 'trusted',
          legacy_flag: false,
          external_reconcilable: true,
          dedupe_key: `admin:${action}:${paymentIntent.id}`,
          stripe_payment_intent_id: paymentIntent.id,
          stripe_charge_id: chargeData?.id || '',
          stripe_customer_id: booking.stripe_customer_id || '',
          stripe_payment_method_id: booking.stripe_payment_method_id || '',
          stripe_receipt_url: chargeData?.receipt_url || '',
          receipt_url: chargeData?.receipt_url || '',
          status: 'paid',
          recorded_by: user.email,
          notes: `${action} — ${description || reason || chargeDescription}`,
          paid_at: paidAt,
        }).catch(e => console.error('[AdminPaymentAction] PaymentLog create failed:', e.message));

        await logEvent(base44, user.email, {
          event_type: 'payment.succeeded',
          target_id: booking_request_id,
          booking_id: booking_request_id,
          vehicle_id: booking.vehicle_id || '',
          summary: `Admin charge $${amount} on booking ${booking_request_id} — ${action}: ${description || reason || ''}`,
          metadata: { action, amount, payment_intent_id: paymentIntent.id, description },
        });

        return Response.json({ ok: true, payment_intent_id: paymentIntent.id, status: paymentIntent.status });
      }

      case "extend_recovery_window": {
        const hours = Number(extend_hours || amount || 2);
        if (!hours || hours <= 0) {
          return Response.json({ error: "extend_hours must be a positive number" }, { status: 400 });
        }
        const currentBase = booking.starter_disable_scheduled_at ? new Date(booking.starter_disable_scheduled_at) : new Date();
        const extendedAt = new Date(Math.max(currentBase.getTime(), Date.now()) + hours * 60 * 60 * 1000);

        await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
          booking_status: "payment_due",
          starter_disable_scheduled_at: extendedAt.toISOString(),
          starter_disabled: false,
          moovetrax_kill_active: false,
        });

        await base44.asServiceRole.entities.Notification.create({
          user_email: booking.user_email,
          title: "Payment recovery window extended",
          body: `Your payment recovery window for ${booking.vehicle_name} has been extended. Please resolve payment before ${extendedAt.toLocaleString()}.`,
          type: "payment",
          booking_request_id,
        });

        await logEvent(base44, user.email, {
          event_type: 'payment.recovery_window_extended',
          target_id: booking_request_id,
          booking_id: booking_request_id,
          vehicle_id: booking.vehicle_id || '',
          host_id: booking.host_id || '',
          summary: `Admin extended payment recovery window by ${hours} hour(s) for booking ${booking_request_id}`,
          metadata: { reason, extend_hours: hours, starter_disable_scheduled_at: extendedAt.toISOString() },
        });

        return Response.json({ ok: true, action: "recovery_window_extended", starter_disable_scheduled_at: extendedAt.toISOString() });
      }

      case "reinstate": {
        await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
          booking_status: "active",
          payment_status: "paid",
          payment_failure_attempts: 0,
          payment_failure_started_at: null,
          starter_disable_scheduled_at: null,
          starter_disabled: false,
          moovetrax_kill_active: false,
          suspended_at: null,
        });

        if (booking.vehicle_id) {
          const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
          const vehicle = vehicles[0];
          if (vehicle?.moovetrax_device_id) {
            await moovetraxKillSwitch(vehicle.moovetrax_device_id, false);
          }
        }

        await base44.asServiceRole.entities.Notification.create({
          user_email: booking.user_email,
          title: "Rental Reinstated ✓",
          body: `Your rental for ${booking.vehicle_name} has been reinstated. Your vehicle is now active again.`,
          type: "booking",
          booking_request_id,
        });

        await logEvent(base44, user.email, {
          event_type: 'gps.reinstate_sent',
          target_id: booking_request_id,
          booking_id: booking_request_id,
          vehicle_id: booking.vehicle_id || '',
          summary: `Admin reinstated booking ${booking_request_id} — vehicle unkilled for ${booking.customer_full_name || booking.user_email}`,
          metadata: { reason },
        });

        return Response.json({ ok: true, action: "reinstated" });
      }

      case "kill_vehicle": {
        if (booking.vehicle_id) {
          const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
          const vehicle = vehicles[0];
          if (vehicle?.moovetrax_device_id) {
            await moovetraxKillSwitch(vehicle.moovetrax_device_id, true);
          }
        }
        await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
          moovetrax_kill_active: true,
          starter_disabled: true,
        });
        await base44.asServiceRole.entities.Notification.create({
          user_email: booking.user_email,
          title: "⚠️ Vehicle Remotely Disabled",
          body: `Your ${booking.vehicle_name} has been remotely disabled by fleet management. Please contact support.`,
          type: "booking",
          booking_request_id,
        });

        await logEvent(base44, user.email, {
          event_type: 'gps.kill_sent',
          target_id: booking_request_id,
          booking_id: booking_request_id,
          vehicle_id: booking.vehicle_id || '',
          summary: `Admin killed vehicle on booking ${booking_request_id} — ${reason || 'no reason given'}`,
          metadata: { reason },
        });

        return Response.json({ ok: true, action: "vehicle_killed" });
      }

      case "record_manual_payment": {
        // Permanent fix: log admin_manual payment and auto-restore booking if now current
        const {
          payment_method = 'zelle',
          week_number,
          amount: payAmount,
          billing_period_start,
          billing_period_end,
          external_reference = '',
          notes: payNotes = '',
        } = body;

        if (!payAmount || payAmount <= 0) {
          return Response.json({ error: "amount is required and must be positive" }, { status: 400 });
        }

        const weekNum = week_number || booking.billing_week_number || 0;
        const today = new Date().toISOString().slice(0, 10);
        const dedupeKey = `payment:admin_manual:${booking_request_id}:week:${weekNum}:amount:${payAmount}:date:${today}:method:${payment_method}:ref:${external_reference || 'none'}`;

        // --- CANONICAL FEE RESOLUTION ---
        // Fetch host plan and commerce profile for fee resolution
        const [hostPlanArr, commerceProfileArr] = await Promise.all([
          booking.host_id
            ? base44.asServiceRole.entities.OperatorPlanConfiguration.filter({ host_id: booking.host_id }, '-updated_date', 1)
            : Promise.resolve([]),
          booking.host_id
            ? base44.asServiceRole.entities.HostCommerceProfile.filter({ host_id: booking.host_id }, '-updated_date', 1)
            : Promise.resolve([]),
        ]);
        const hostPlan = hostPlanArr[0] || null;
        const commerceProfile = commerceProfileArr[0] || null;

        const feeResolution = resolvePlatformFee({
          planMode: hostPlan?.active_mode || hostPlan?.selected_mode,
          grossAmount: payAmount,
          paymentMethod: payment_method,
          operatorPlan: hostPlan,
          commerceProfile,
        });

        // Create the PaymentLog entry with canonical fee data
        const paymentLog = await base44.asServiceRole.entities.PaymentLog.create({
          booking_request_id,
          host_id: booking.host_id || '',
          customer_email: booking.user_email,
          customer_name: booking.customer_full_name || '',
          vehicle_id: booking.vehicle_id || '',
          vehicle_name: booking.vehicle_name || '',
          week_number: weekNum,
          billing_period_start: billing_period_start || today,
          billing_period_end: billing_period_end || today,
          amount: payAmount,
          currency: 'usd',
          payment_method,
          source_type: 'admin_manual',
          source_confidence: external_reference ? 'trusted' : 'partially_trusted',
          legacy_flag: false,
          external_reconcilable: !!external_reference,
          external_reference,
          dedupe_key: dedupeKey,
          stripe_payment_intent_id: null,
          stripe_charge_id: null,
          status: 'paid',
          recorded_by: user.email,
          notes: payNotes,
          paid_at: new Date().toISOString(),
          // Canonical fee fields
          platform_fee_rate: feeResolution.platform_fee_rate,
          platform_fee_amount_due: feeResolution.platform_fee_amount_due,
          host_net_after_platform_fee: feeResolution.host_net_after_fee,
          platform_fee_collection_status: feeResolution.fee_collection_status,
          manual_collection_requires_platform_fee: feeResolution.manual_collection_requires_platform_fee,
          plan_mode_at_payment: feeResolution.plan_mode,
        });

        // --- CREATE HOST RECEIVABLE IF FEE IS DUE ---
        let hostReceivable = null;
        if (feeResolution.platform_fee_amount_due > 0 && feeResolution.is_manual_payment) {
          const receivableDedupeKey = `manual_fee:${booking_request_id}:${paymentLog.id}`;
          // Idempotency: check for existing receivable on this payment log
          const existingReceivables = await base44.asServiceRole.entities.HostReceivable.filter({
            dedupe_key: receivableDedupeKey,
          });
          if (!existingReceivables.length) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7); // 7-day payment due window
            hostReceivable = await base44.asServiceRole.entities.HostReceivable.create({
              host_id: booking.host_id || '',
              booking_request_id,
              vehicle_id: booking.vehicle_id || '',
              customer_email: booking.user_email || '',
              payment_log_id: paymentLog.id,
              receivable_type: 'manual_payment_fee',
              source_payment_type: 'manual_payment',
              payment_method,
              gross_collected_amount: payAmount,
              platform_fee_rate: feeResolution.platform_fee_rate,
              platform_fee_amount_due: feeResolution.platform_fee_amount_due,
              host_net_after_fee: feeResolution.host_net_after_fee,
              plan_mode: feeResolution.plan_mode,
              original_amount: feeResolution.platform_fee_amount_due,
              remaining_amount: feeResolution.platform_fee_amount_due,
              recovered_amount: 0,
              status: 'open',
              due_date: dueDate.toISOString().slice(0, 10),
              description: `Platform fee (${(feeResolution.platform_fee_rate * 100).toFixed(0)}%) on $${payAmount} ${payment_method} payment — Week ${weekNum} — ${booking.vehicle_name || ''}`,
              created_by_admin: user.email,
              dedupe_key: receivableDedupeKey,
              created_at: new Date().toISOString(),
              offset_from_future_payouts: true,
              currency: 'usd',
              notes: `Admin recorded manual ${payment_method} payment of $${payAmount}. Platform fee of $${feeResolution.platform_fee_amount_due} due from host. Plan: ${feeResolution.plan_mode}`,
            });
          } else {
            hostReceivable = existingReceivables[0];
          }
        }

        // --- OPTION B GUARD: Void orphaned pending HostPayouts for this booking ---
        // Any HostPayout that is 'pending' with no stripe_transfer_id and no stripe_payment_intent_id
        // is an orphan (created before Stripe confirmed). Void them now that manual payment is recorded.
        if (booking.host_id) {
          const orphanPayouts = await base44.asServiceRole.entities.HostPayout.filter({
            booking_request_id: booking_request_id,
          });
          for (const op of orphanPayouts) {
            if (['pending', 'processing'].includes(op.status) && !op.stripe_transfer_id && !op.stripe_payment_intent_id) {
              await base44.asServiceRole.entities.HostPayout.update(op.id, {
                status: 'failed',
                hold_reason: 'admin_override',
                hold_notes: `VOIDED: Orphaned HostPayout — no Stripe transfer. Manual ${payment_method} payment of $${payAmount} recorded by ${user.email} on ${new Date().toISOString().slice(0,10)}. Accounting handled via HostReceivable + PaymentLog.`,
                held_at: new Date().toISOString(),
                held_by: user.email,
              }).catch(e => console.warn('[record_manual_payment] orphan payout void failed:', e.message));
              console.log(`[record_manual_payment] Voided orphaned HostPayout ${op.id} for booking ${booking_request_id}`);
            }
          }
        }

        // Determine if booking is in a delinquent state that needs restoration
        const delinquentStatuses = ['payment_due', 'grace_period', 'suspended'];
        const needsRestore = delinquentStatuses.includes(booking.booking_status) ||
          booking.starter_disabled ||
          booking.moovetrax_kill_active;

        let restored = false;
        let telematicsNote = null;

        if (needsRestore) {
          // Update booking to active/paid — clear all failure and restriction flags
          await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
            booking_status: 'active',
            payment_status: 'paid',
            moovetrax_kill_active: false,
            starter_disabled: false,
            starter_disable_pending: false,
            final_reminder_sent: false,
            payment_failure_attempts: 0,
            payment_failure_reason: '',
            payment_failure_started_at: null,
            starter_disable_scheduled_at: null,
            suspended_at: null,
            suspension_triggered_at: null,
            grace_period_started_at: null,
            grace_period_ends_at: null,
          });

          // Update vehicle status
          if (booking.vehicle_id) {
            await base44.asServiceRole.entities.Vehicle.update(booking.vehicle_id, {
              status: 'Active Rental',
            }).catch(e => console.warn('[record_manual_payment] vehicle update failed:', e.message));
          }

          // Handle telematics starter restore if device exists
          if (booking.vehicle_id) {
            const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
            const vehicle = vehicles[0];
            const hasDevice = vehicle?.telematics_provider && vehicle.telematics_provider !== 'none' && vehicle.telematics_device_id;
            const hasMoovetrax = vehicle?.moovetrax_device_id;

            if (hasDevice || hasMoovetrax) {
              // Use existing sendTelematicsCommand via SDK
              await base44.asServiceRole.functions.invoke('sendTelematicsCommand', {
                vehicle_id: booking.vehicle_id,
                command_type: 'starter_restore',
                reason: `Admin manual payment recorded — booking restored by ${user.email}`,
              }).catch(e => console.warn('[record_manual_payment] starter_restore command failed:', e.message));
              telematicsNote = 'starter_restore_command_sent';
            } else {
              telematicsNote = 'no_telematics_device_restore_not_required';
            }
          }

          // Resolve any open PaymentOperationalAlerts for this booking
          const openAlerts = await base44.asServiceRole.entities.PaymentOperationalAlert.filter({
            booking_id: booking_request_id,
          });
          for (const alert of openAlerts) {
            if (!['resolved', 'dismissed', 'closed'].includes(alert.status)) {
              await base44.asServiceRole.entities.PaymentOperationalAlert.update(alert.id, {
                status: 'resolved',
                resolved_at: new Date().toISOString(),
                resolved_by: user.email,
                resolution_notes: `Auto-resolved: admin manual ${payment_method} payment of $${payAmount} recorded by ${user.email}`,
                manually_actioned: true,
                manually_actioned_at: new Date().toISOString(),
                manually_actioned_by: user.email,
                action_taken: 'manual_payment_recorded',
              });
            }
          }

          // Notify customer
          await base44.asServiceRole.entities.Notification.create({
            user_email: booking.user_email,
            title: '✅ Payment Received — Account Restored',
            body: `Your $${payAmount} payment for ${booking.vehicle_name} has been recorded. Your account is now in good standing.`,
            type: 'payment',
            booking_request_id,
          });

          // Log ActivityEvent
          await logEvent(base44, user.email, {
            event_type: 'admin_manual_payment_restored_booking',
            target_id: booking_request_id,
            booking_id: booking_request_id,
            vehicle_id: booking.vehicle_id || '',
            host_id: booking.host_id || '',
            summary: `Admin recorded manual ${payment_method} payment of $${payAmount} — booking restored to active. ${telematicsNote || ''}`,
            metadata: {
              payment_method,
              amount: payAmount,
              week_number: weekNum,
              previous_status: booking.booking_status,
              telematics_note: telematicsNote,
              recorded_by: user.email,
            },
            event_status: 'success',
          });

          restored = true;
        } else {
          // Booking already active — just log the payment, no state change needed
          await logEvent(base44, user.email, {
            event_type: 'payment.manual_recorded',
            target_id: booking_request_id,
            booking_id: booking_request_id,
            vehicle_id: booking.vehicle_id || '',
            host_id: booking.host_id || '',
            summary: `Admin recorded manual ${payment_method} payment of $${payAmount} — week ${weekNum} — booking already active`,
            metadata: { payment_method, amount: payAmount, week_number: weekNum, recorded_by: user.email },
            event_status: 'success',
          });
        }

        return Response.json({
          ok: true,
          action: 'record_manual_payment',
          restored,
          telematics_note: telematicsNote,
          week_number: weekNum,
          amount: payAmount,
          payment_method,
          dedupe_key: dedupeKey,
          fee_resolution: {
            plan_mode: feeResolution.plan_mode,
            platform_fee_rate: feeResolution.platform_fee_rate,
            platform_fee_amount_due: feeResolution.platform_fee_amount_due,
            host_net_after_fee: feeResolution.host_net_after_fee,
            fee_collection_status: feeResolution.fee_collection_status,
          },
          host_receivable_id: hostReceivable?.id || null,
          host_receivable_status: hostReceivable?.status || null,
        });
      }

      case "unkill_vehicle": {
        if (booking.vehicle_id) {
          const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
          const vehicle = vehicles[0];
          if (vehicle?.moovetrax_device_id) {
            await moovetraxKillSwitch(vehicle.moovetrax_device_id, false);
          }
        }
        await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
          moovetrax_kill_active: false,
          starter_disabled: false,
        });
        await base44.asServiceRole.entities.Notification.create({
          user_email: booking.user_email,
          title: "✅ Vehicle Restored",
          body: `Your ${booking.vehicle_name} has been restored and is ready to drive.`,
          type: "booking",
          booking_request_id,
        });

        await logEvent(base44, user.email, {
          event_type: 'gps.reinstate_sent',
          target_id: booking_request_id,
          booking_id: booking_request_id,
          vehicle_id: booking.vehicle_id || '',
          summary: `Admin restored vehicle on booking ${booking_request_id}`,
          metadata: { reason },
        });

        return Response.json({ ok: true, action: "vehicle_restored" });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("[AdminPaymentAction] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});