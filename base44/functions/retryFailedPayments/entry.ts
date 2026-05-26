import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });

// MooveTrax kill switch
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

async function createPaymentAlert(base44, payload) {
  try {
    await base44.asServiceRole.functions.invoke('createPaymentOperationalAlert', payload);
  } catch (e) {
    console.error('[PaymentOperationalAlert]', e.message);
  }
}

// Send SMS via Twilio
async function sendSMS(to, message) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_PHONE_NUMBER");
  if (!accountSid || !authToken || !from || !to) return;
  const body = new URLSearchParams({ To: to, From: from, Body: message });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const data = await res.json();
  console.log(`[SMS] Sent to ${to}: ${data.sid || data.message}`);
  return data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Find all bookings with failed payments that haven't been suspended yet
    const failedBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      payment_status: "failed",
    });

    const retryTargets = failedBookings.filter((b) => {
      // Skip bookings managed by the grace period automation (processGracePeriod)
      if (["payment_due", "grace_period", "suspended"].includes(b.booking_status)) return false;
      if (!b.stripe_payment_method_id || !b.stripe_customer_id) return false;
      if ((b.payment_failure_attempts || 0) >= 3) return false;
      if (!b.last_payment_failure_at) return false;

      // Only retry if last attempt was at least 1 hour ago
      const lastAttempt = new Date(b.last_payment_failure_at);
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return lastAttempt <= hourAgo;
    });

    console.log(`[RetryPayments] Found ${retryTargets.length} bookings to retry`);

    for (const booking of retryTargets) {
      const attemptNum = (booking.payment_failure_attempts || 0) + 1;
      const amount = booking.weekly_rate || 0;
      const amountCents = Math.round(amount * 100);

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: "usd",
          customer: booking.stripe_customer_id,
          payment_method: booking.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          description: `uRide retry attempt ${attemptNum} — ${booking.vehicle_name || ""}`,
          metadata: { billing_context: 'rental_marketplace_payment', booking_request_id: booking.id, retry_attempt: String(attemptNum) },
        });

        if (paymentIntent.status === "succeeded") {
          // Payment recovered — UNKILL vehicle
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + 7);
          const nextBillingDate = nextDate.toISOString().split("T")[0];

          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            payment_status: "paid",
            payment_failure_attempts: 0,
            payment_failure_reason: null,
            next_billing_date: nextBillingDate,
            moovetrax_kill_active: false,
          });

          // Unkill vehicle
          if (booking.vehicle_id) {
            const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
            const vehicle = vehicles[0];
            if (vehicle?.moovetrax_device_id) {
              await moovetraxKillSwitch(vehicle.moovetrax_device_id, false);
            }
          }

          // In-app notification
          await base44.asServiceRole.entities.Notification.create({
            user_email: booking.user_email,
            title: "Payment Recovered ✓",
            body: `Your payment of $${amount} for ${booking.vehicle_name} was successfully processed. Your vehicle is restored!`,
            type: "payment",
            booking_request_id: booking.id,
          });

          // SMS recovery alert
          if (booking.customer_phone) {
            await sendSMS(booking.customer_phone,
              `✅ uRide: Payment received! Your ${booking.vehicle_name} has been restored. Thank you!`
            );
          }

          // Email recovery
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: booking.user_email,
            subject: `✅ Payment Received — Your Vehicle is Restored`,
            body: `Hi ${booking.customer_full_name || ""},\n\nGreat news! Your payment of $${amount} for your ${booking.vehicle_name} rental has been successfully processed.\n\nYour vehicle is now fully restored and ready to drive.\n\nNext billing: ${nextBillingDate}\n\nThank you,\nuRide Team`,
          });

          await createPaymentAlert(base44, { alert_type: 'retry_successful', severity: 'info', billing_context: 'weekly_billing', booking_id: booking.id, host_id: booking.host_id || '', customer_id: booking.user_id || '', vehicle_id: booking.vehicle_id || '', renter_email: booking.user_email || '', stripe_payment_intent_id: paymentIntent.id, related_entity_type: 'BookingRequest', related_entity_id: booking.id, title: 'Retry successful', message: `Payment retry succeeded for ${booking.vehicle_name || booking.id}.`, recommended_action: 'Confirm retry recovery and close related open alerts if appropriate.', financial_impact_amount: amount, currency: paymentIntent.currency || 'usd', retry_attempts: attemptNum, source: 'retryFailedPayments' });
          console.log(`[RetryPayments] ✓ Payment recovered for ${booking.id}`);
        }
      } catch (err) {
        console.error(`[RetryPayments] Attempt ${attemptNum} failed for ${booking.id}:`, err.message);
        await createPaymentAlert(base44, { alert_type: 'payment_retry_scheduled', severity: attemptNum >= 3 ? 'critical' : 'warning', billing_context: 'weekly_billing', booking_id: booking.id, host_id: booking.host_id || '', customer_id: booking.user_id || '', vehicle_id: booking.vehicle_id || '', renter_email: booking.user_email || '', related_entity_type: 'BookingRequest', related_entity_id: booking.id, title: 'Payment retry failed', message: `Retry attempt ${attemptNum} failed for ${booking.vehicle_name || booking.id}: ${err.message}`, recommended_action: 'Monitor retry outcome and contact renter if another attempt fails.', financial_impact_amount: amount, currency: 'usd', retry_attempts: attemptNum, last_retry_result: err.message, source: 'retryFailedPayments' });

        // ANY failure = kill immediately + SMS + email alert
        if (booking.vehicle_id) {
          const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
          const vehicle = vehicles[0];
          if (vehicle?.moovetrax_device_id) {
            await moovetraxKillSwitch(vehicle.moovetrax_device_id, true);
          }
        }

        if (attemptNum >= 3) {
          // 3 attempts exhausted — SUSPEND
          console.log(`[RetryPayments] 3 attempts exhausted for ${booking.id} — SUSPENDING`);

          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            booking_status: "suspended",
            payment_status: "failed",
            payment_failure_attempts: attemptNum,
            payment_failure_reason: err.message,
            last_payment_failure_at: new Date().toISOString(),
            suspended_at: new Date().toISOString(),
            moovetrax_kill_active: true,
          });

          // In-app notification
          await base44.asServiceRole.entities.Notification.create({
            user_email: booking.user_email,
            title: "⚠️ Rental Suspended — Action Required",
            body: `Your rental for ${booking.vehicle_name} has been suspended after 3 failed payment attempts. Your vehicle has been remotely disabled. Please contact support immediately.`,
            type: "payment",
            booking_request_id: booking.id,
          });

          // SMS
          if (booking.customer_phone) {
            await sendSMS(booking.customer_phone,
              `🚨 uRide URGENT: Your ${booking.vehicle_name} has been DISABLED after 3 failed payments. Open the app to pay now and restore access immediately.`
            );
          }

          // Email
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: booking.user_email,
            subject: `🚨 URGENT: Your Vehicle Has Been Disabled`,
            body: `Hi ${booking.customer_full_name || ""},\n\nYour rental for ${booking.vehicle_name} has been suspended after 3 failed payment attempts.\n\n⛔ Your vehicle has been remotely disabled.\n\nTo restore access, please update your payment method in the app immediately.\n\nIf you believe this is an error, please contact our support team right away.\n\nThe uRide Team`,
          });

          // Admin alert
          await base44.asServiceRole.entities.Notification.create({
            user_email: "admin",
            title: `🚨 Rental Suspended: ${booking.customer_full_name || booking.user_email}`,
            body: `Booking for ${booking.vehicle_name} suspended after 3 failed payment attempts. Kill switch activated.`,
            type: "alert",
            booking_request_id: booking.id,
          });

        } else {
          // First or second failure — still kill immediately
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            payment_status: "failed",
            payment_failure_attempts: attemptNum,
            payment_failure_reason: err.message,
            last_payment_failure_at: new Date().toISOString(),
            moovetrax_kill_active: true,
          });

          // In-app notification
          await base44.asServiceRole.entities.Notification.create({
            user_email: booking.user_email,
            title: `⚠️ Payment Failed — Vehicle Disabled`,
            body: `Your payment for ${booking.vehicle_name} failed. Your vehicle has been temporarily disabled. We'll retry in 1 hour. Pay now to restore immediately.`,
            type: "payment",
            booking_request_id: booking.id,
          });

          // SMS — immediate kill alert
          if (booking.customer_phone) {
            await sendSMS(booking.customer_phone,
              `⚠️ uRide: Your payment for ${booking.vehicle_name} failed. Your vehicle has been disabled. Open the app to resolve now or we'll retry in 1 hour.`
            );
          }

          // Email
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: booking.user_email,
            subject: `⚠️ Payment Failed — Your Vehicle Has Been Temporarily Disabled`,
            body: `Hi ${booking.customer_full_name || ""},\n\nYour weekly payment of $${amount} for ${booking.vehicle_name} failed.\n\n🚫 Your vehicle has been temporarily disabled.\n\nWe will retry your payment in 1 hour. To restore your vehicle sooner, please open the app and update your payment method.\n\nAttempt: ${attemptNum} of 3\n\nThe uRide Team`,
          });
        }
      }
    }

    return Response.json({ ok: true, retried: retryTargets.length });
  } catch (error) {
    console.error("[RetryPayments] Fatal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});