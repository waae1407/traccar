import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { booking_request_id, user_email, amount, vehicle_name, booking_type, weekly_rate, vehicle_id } = await req.json();

    // Fetch vehicle to get pickup address
    let pickupAddress = null;
    let pickupHours = null;
    if (vehicle_id) {
      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: vehicle_id });
      if (vehicles[0]?.pickup_address) {
        pickupAddress = vehicles[0].pickup_address;
        pickupHours = vehicles[0].pickup_hours || null;
      }
    }

    // Push in-app notification about address reveal
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

    const emailBody = `
<div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
  <div style="background: linear-gradient(135deg, #e91e8c, #7c3aed); padding: 32px 32px 28px; border-radius: 16px 16px 0 0; text-align: center;">
    <img src="https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg" alt="uRide" style="width: 56px; height: 56px; border-radius: 14px; border: 2px solid rgba(255,255,255,0.35); display: block; margin: 0 auto 10px;" />
    <div style="color: white; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 16px;">uRide</div>
    <h1 style="color: white; margin: 0; font-size: 22px;">Payment Received ✓</h1>
    <p style="color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px;">Receipt</p>
  </div>
  <div style="background: #fafafa; padding: 28px 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
    <p style="margin: 0 0 20px; font-size: 15px; color: #374151;">Hi! Your payment was successful and your booking is now under review.</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Vehicle</td><td style="padding: 6px 0; font-weight: 600; text-align: right; font-size: 13px;">${vehicle_name || "—"}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Booking Type</td><td style="padding: 6px 0; font-weight: 600; text-align: right; font-size: 13px;">${booking_type || "—"}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Amount Paid Today</td><td style="padding: 6px 0; font-weight: 700; text-align: right; font-size: 15px; color: #111;">$${amount?.toLocaleString() || "0"}</td></tr>
        ${isRecurring && weekly_rate ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Recurring Amount</td><td style="padding: 6px 0; font-weight: 600; text-align: right; font-size: 13px; color: #6b7280;">$${weekly_rate}/week</td></tr>` : ""}
        <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Booking Status</td><td style="padding: 6px 0; font-weight: 600; text-align: right; font-size: 13px; color: #d97706;">Pending Review</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Reference</td><td style="padding: 6px 0; font-weight: 600; text-align: right; font-size: 12px; font-family: monospace;">#${booking_request_id?.slice(-8)?.toUpperCase()}</td></tr>
      </table>
    </div>

    ${isRecurring ? `
    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: #1d4ed8; font-weight: 600;">📋 Recurring Billing Notice</p>
      <p style="margin: 6px 0 0; font-size: 12px; color: #1e40af;">You have authorized uRide to charge <strong>$${weekly_rate}/week</strong> automatically. You may cancel anytime by contacting uRide support or through your account.</p>
    </div>` : ""}

    ${pickupAddress ? `
    <div style="background: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
      <p style="margin: 0; font-size: 14px; color: #166534; font-weight: 700;">📍 Your Pickup Address</p>
      <p style="margin: 6px 0 0; font-size: 15px; color: #111; font-weight: 600;">${pickupAddress}</p>
      ${pickupHours ? `<p style="margin: 4px 0 0; font-size: 12px; color: #16a34a;">🕐 ${pickupHours}</p>` : ""}
    </div>` : ""}

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px;">
      <p style="margin: 0; font-size: 13px; color: #166534; font-weight: 600;">What happens next?</p>
      <p style="margin: 6px 0 0; font-size: 12px; color: #14532d;">Our team will review your booking within 24 hours. You'll receive a notification once it's approved. Your vehicle will be ready on your selected start date.</p>
    </div>

    <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af; text-align: center;">Questions? Contact uRide support · uridehub.com</p>
  </div>
</div>`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: user_email,
      subject: `Payment Confirmed — $${amount} · ${vehicle_name || "uRide Booking"} #${booking_request_id?.slice(-8)?.toUpperCase()}`,
      body: emailBody,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('[sendPaymentReceipt] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});