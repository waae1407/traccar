import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
async function sendEmail(to, subject, html, fromName = "uRide") {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${fromName} <noreply@uridehub.com>`, to: [to], subject, html }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.message || "Email failed"); }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      booking_request_id, user_email, amount, vehicle_name, booking_type,
      weekly_rate, vehicle_id, start_date, end_date, rental_days,
    } = await req.json();

    // Pickup details are intentionally not included in payment receipts.
    // They unlock only after the booking is approved or active.

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
      <td style="padding: 4px 0; color: #374151;">Payment Processing - Stripe (3.05%):</td>
      <td style="padding: 4px 0; text-align: right; color: #6b7280;">Included</td>
    </tr>
    <tr>
      <td style="padding: 4px 0; font-weight: bold; color: #111; padding-top: 10px;">Total paid:</td>
      <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #111; padding-top: 10px;">$${(amount || 0).toFixed(2)}</td>
    </tr>
  </table>

  <hr style="border: none; border-top: 1px dashed #d1d5db; margin: 20px 0;" />

  <p style="margin: 0 0 4px; font-size: 14px; color: #374151;">Processed by Stripe</p>
  <p style="margin: 0 0 2px; font-size: 13px; color: #6b7280;">Pickup details unlock after booking approval.</p>

  ${isRecurring ? `
  <hr style="border: none; border-top: 1px dashed #d1d5db; margin: 20px 0;" />
  <p style="margin: 0 0 4px; font-size: 13px; color: #1d4ed8; font-weight: 600;">📋 Recurring Billing</p>
  <p style="margin: 0; font-size: 13px; color: #1e40af;">You have authorized UrideHub to charge <strong>$${weekly_rate}/week</strong> automatically. Cancel anytime via support.</p>
  ` : ""}

  <hr style="border: none; border-top: 1px dashed #d1d5db; margin: 20px 0;" />
  <p style="margin: 0; font-size: 13px; color: #6b7280;">Questions? Contact <strong>support@uridehub.com</strong></p>
</div>`;

    // M3 FIX: email failure returns success so checkout flow is never blocked
    try {
      await sendEmail(user_email, `Payment Confirmed — $${amount} · ${vehicle_name || "UrideHub Booking"} · ${receiptRef}`, emailBody, "uRide");
    } catch (emailErr) {
      console.error('[sendPaymentReceipt] Email delivery failed:', emailErr.message);
      // Log but do not propagate — receipt email failure must never fail the payment confirmation
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.ActivityEvent.create({
          event_type: 'email_delivery_failed', actor_id: 'sendPaymentReceipt', actor_email: 'automation@uridehub.com',
          actor_role: 'automation', target_entity: 'BookingRequest', target_id: booking_request_id || '',
          booking_id: booking_request_id || '',
          summary: `Payment receipt email failed for ${user_email}: ${emailErr.message}`,
          metadata: { error: emailErr.message, email_type: 'payment_receipt', booking_request_id },
          source: 'sendPaymentReceipt', event_status: 'error',
        });
      } catch (_) {}
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[sendPaymentReceipt] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});