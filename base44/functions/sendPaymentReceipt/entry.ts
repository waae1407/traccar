import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      booking_request_id, user_email, amount, vehicle_name, booking_type,
      weekly_rate, vehicle_id, start_date, end_date, rental_days,
    } = await req.json();

    // Fetch vehicle for pickup address
    let pickupAddress = null;
    let pickupHours = null;
    if (vehicle_id) {
      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicle_id });
      if (vehicles[0]?.pickup_address) {
        pickupAddress = vehicles[0].pickup_address;
        pickupHours = vehicles[0].pickup_hours || null;
      }
    }

    if (pickupAddress) {
      await base44.asServiceRole.entities.Notification.create({
        user_email,
        title: "📍 Your Pickup Address is Ready!",
        body: `Payment confirmed for ${vehicle_name}. Your pickup location: ${pickupAddress}${pickupHours ? ` (${pickupHours})` : ""}`,
        type: "booking",
        booking_request_id,
      });
    }

    const isRecurring = booking_type === "Weekly" || booking_type === "Rent-to-Own" || booking_type === "Monthly";
    const receiptRef = `UR-${booking_request_id?.slice(-6)?.toUpperCase() || '000000'}`;

    // Build rental subtotal line
    const days = rental_days || 7;
    const rentalLine = weekly_rate
      ? `${days} days @ $${weekly_rate}/week`
      : booking_type || "Rental";

    const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

    const emailBody = `
<div style="font-family: 'Courier New', Courier, monospace; max-width: 560px; margin: 0 auto; color: #111; background: #f9fafb; padding: 32px; border-radius: 16px;">

  <p style="font-size: 18px; font-weight: bold; margin: 0 0 4px;">UrideHub</p>
  <p style="margin: 0 0 2px; font-size: 14px;">Receipt ${receiptRef}</p>
  <p style="margin: 0 0 20px; font-size: 14px; color: #6b7280;">${formatDate(new Date().toISOString())}</p>

  <p style="margin: 0 0 2px; font-size: 14px;"><strong>Customer:</strong> ${user?.full_name || user_email}</p>
  <p style="margin: 0 0 2px; font-size: 14px;"><strong>Booking:</strong> ${vehicle_name || "—"}</p>
  ${start_date && end_date ? `<p style="margin: 0 0 2px; font-size: 14px;"><strong>Rental Period:</strong> ${formatDate(start_date)} → ${formatDate(end_date)} (${days} days)</p>` : ""}

  <hr style="border: none; border-top: 1px dashed #d1d5db; margin: 20px 0;" />

  <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
    <tr>
      <td style="padding: 4px 0; color: #374151;">Rental subtotal (${rentalLine}):</td>
      <td style="padding: 4px 0; text-align: right; font-weight: 600;">$${(amount || 0).toFixed(2)}</td>
    </tr>
    <tr>
      <td style="padding: 4px 0; color: #374151;">Taxes (if applicable):</td>
      <td style="padding: 4px 0; text-align: right;">$0.00</td>
    </tr>
    <tr>
      <td style="padding: 4px 0; font-weight: bold; color: #111; padding-top: 10px;">Total paid:</td>
      <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #111; padding-top: 10px;">$${(amount || 0).toFixed(2)}</td>
    </tr>
  </table>

  <hr style="border: none; border-top: 1px dashed #d1d5db; margin: 20px 0;" />

  <p style="margin: 0 0 4px; font-size: 14px; color: #374151;">Processed by Stripe</p>
  <p style="margin: 0 0 2px; font-size: 13px; color: #6b7280;">Booking status: Pending Review — our team reviews within 24 hours.</p>

  ${pickupAddress ? `
  <hr style="border: none; border-top: 1px dashed #d1d5db; margin: 20px 0;" />
  <p style="margin: 0 0 4px; font-size: 14px; font-weight: bold; color: #166534;">📍 Pickup Address</p>
  <p style="margin: 0 0 2px; font-size: 14px; color: #111;">${pickupAddress}</p>
  ${pickupHours ? `<p style="margin: 0; font-size: 13px; color: #16a34a;">🕐 ${pickupHours}</p>` : ""}
  ` : ""}

  ${isRecurring ? `
  <hr style="border: none; border-top: 1px dashed #d1d5db; margin: 20px 0;" />
  <p style="margin: 0 0 4px; font-size: 13px; color: #1d4ed8; font-weight: 600;">📋 Recurring Billing</p>
  <p style="margin: 0; font-size: 13px; color: #1e40af;">You have authorized UrideHub to charge <strong>$${weekly_rate}/week</strong> automatically. Cancel anytime via support.</p>
  ` : ""}

  <hr style="border: none; border-top: 1px dashed #d1d5db; margin: 20px 0;" />
  <p style="margin: 0; font-size: 13px; color: #6b7280;">Questions? Contact <strong>support@uridehub.com</strong></p>
</div>`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: user_email,
      subject: `Payment Confirmed — $${amount} · ${vehicle_name || "UrideHub Booking"} · ${receiptRef}`,
      body: emailBody,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('[sendPaymentReceipt] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});