import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });

// Moovetrax stub — replace with real credentials when available
async function moovetraxKillSwitch(deviceId, enable) {
  console.log(`[Moovetrax STUB] ${enable ? "KILLING" : "RESTORING"} vehicle device: ${deviceId}`);
  // TODO: Replace with actual Moovetrax API call when credentials are available
  return { stubbed: true, deviceId, killActive: enable };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Find all bookings with failed payments that haven't been suspended yet
    const failedBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      payment_status: "failed",
    });

    const retryTargets = failedBookings.filter((b) => {
      if (b.booking_status === "suspended") return false;
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
          metadata: { booking_request_id: booking.id, retry_attempt: String(attemptNum) },
        });

        if (paymentIntent.status === "succeeded") {
          // Payment recovered!
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + 7);
          const nextBillingDate = nextDate.toISOString().split("T")[0];

          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            payment_status: "paid",
            payment_failure_attempts: 0,
            payment_failure_reason: null,
            next_billing_date: nextBillingDate,
          });

          await base44.asServiceRole.entities.Notification.create({
            user_email: booking.user_email,
            title: "Payment Recovered ✓",
            body: `Your payment of $${amount} for ${booking.vehicle_name} was successfully processed. You're all good!`,
            type: "payment",
            booking_request_id: booking.id,
          });

          console.log(`[RetryPayments] ✓ Payment recovered for ${booking.id}`);
        }
      } catch (err) {
        console.error(`[RetryPayments] Attempt ${attemptNum} failed for ${booking.id}:`, err.message);

        if (attemptNum >= 3) {
          // 3rd attempt failed — SUSPEND and trigger kill switch
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

          // Notify customer
          await base44.asServiceRole.entities.Notification.create({
            user_email: booking.user_email,
            title: "⚠️ Rental Suspended — Action Required",
            body: `Your rental for ${booking.vehicle_name} has been suspended due to 3 failed payment attempts. The vehicle has been remotely disabled. Please update your payment method immediately to reinstate your rental.`,
            type: "payment",
            booking_request_id: booking.id,
          });

          // Notify all admins
          await base44.asServiceRole.entities.Notification.create({
            user_email: "admin",
            title: `🚨 Rental Suspended: ${booking.customer_full_name || booking.user_email}`,
            body: `Booking ${booking.id} (${booking.vehicle_name}) suspended after 3 failed payment attempts. Moovetrax kill switch activated. Manual action may be required.`,
            type: "alert",
            booking_request_id: booking.id,
          });

          // Trigger Moovetrax kill switch
          if (booking.vehicle_id) {
            const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: booking.vehicle_id });
            const vehicle = vehicles[0];
            if (vehicle?.moovetrax_device_id) {
              await moovetraxKillSwitch(vehicle.moovetrax_device_id, true);
            } else {
              console.warn(`[RetryPayments] No Moovetrax device ID for vehicle ${booking.vehicle_id}`);
            }
          }
        } else {
          // Update attempt count, will retry next hour
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            payment_failure_attempts: attemptNum,
            payment_failure_reason: err.message,
            last_payment_failure_at: new Date().toISOString(),
          });

          await base44.asServiceRole.entities.Notification.create({
            user_email: booking.user_email,
            title: `Payment Failed (Attempt ${attemptNum}/3)`,
            body: `Your payment for ${booking.vehicle_name} failed again. We'll retry in 1 hour. Please ensure your card is valid.`,
            type: "payment",
            booking_request_id: booking.id,
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