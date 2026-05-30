import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

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