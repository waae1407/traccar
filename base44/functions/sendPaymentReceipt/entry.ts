import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { booking_request_id, user_email, amount, vehicle_name, booking_type, weekly_rate } = await req.json();

    const isRecurring = booking_type === "Weekly" || booking_type === "Rent-to-Own" || booking_type === "Monthly";

    const emailBody = `
<div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
  <div style="background: linear-gradient(135deg, #e91e8c, #7c3aed); padding: 28px 32px; border-radius: 16px 16px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 22px;">Payment Received ✓</h1>
    <p style="color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px;">uRide · Receipt</p>
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