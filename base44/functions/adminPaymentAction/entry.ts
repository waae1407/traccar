import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), { apiVersion: "2023-10-16" });

// Moovetrax stub — replace with real credentials when available
async function moovetraxKillSwitch(deviceId, enable) {
  console.log(`[Moovetrax STUB] ${enable ? "KILLING" : "RESTORING"} vehicle device: ${deviceId}`);
  return { stubbed: true, deviceId, killActive: enable };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== "admin") {
      return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const { action, booking_request_id, amount, description, reason } = body;

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
        const refundAmount = amount ? Math.round(amount * 100) : undefined; // undefined = full refund
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

        return Response.json({ ok: true, payment_intent_id: paymentIntent.id, status: paymentIntent.status });
      }

      case "reinstate": {
        // Admin manually reinstates after suspended — re-enable vehicle
        await base44.asServiceRole.entities.BookingRequest.update(booking_request_id, {
          booking_status: "active",
          payment_status: "paid",
          payment_failure_attempts: 0,
          moovetrax_kill_active: false,
          suspended_at: null,
        });

        // Re-enable vehicle via Moovetrax
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

        return Response.json({ ok: true, action: "reinstated" });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error("[AdminPaymentAction] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});