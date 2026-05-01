import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const LOGO_URL = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

function emailWrapper(headline, subtitle, bodyContent) {
  return `
<div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
  <div style="background: linear-gradient(135deg, #e91e8c, #7c3aed); padding: 32px 32px 28px; border-radius: 16px 16px 0 0; text-align: center;">
    <img src="${LOGO_URL}" alt="uRide" style="width: 56px; height: 56px; border-radius: 14px; border: 2px solid rgba(255,255,255,0.35); display: block; margin: 0 auto 10px;" />
    <div style="color: white; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 16px;">uRide</div>
    <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">${headline}</h1>
    <p style="color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px;">${subtitle}</p>
  </div>
  <div style="background: #fafafa; padding: 28px 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
    ${bodyContent}
    <p style="margin: 24px 0 0; font-size: 12px; color: #9ca3af; text-align: center;">Questions? Reply to this email · uridehub.com</p>
  </div>
</div>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Find bookings billing tomorrow
    const activeBookings = await base44.asServiceRole.entities.BookingRequest.filter({
      autopay_enabled: true,
    });

    const warningTargets = activeBookings.filter((b) => {
      if (!["approved", "confirmed", "active"].includes(b.booking_status)) return false;
      if (b.clean_return_status === "approved_clean") return false;
      return b.next_billing_date === tomorrowStr;
    });

    console.log(`[PreChargeWarnings] Sending ${warningTargets.length} 24hr warnings`);

    for (const booking of warningTargets) {
      const weekNum = (booking.billing_week_number || 1) + 1;
      const amount = booking.weekly_rate || 0;

      await base44.asServiceRole.entities.Notification.create({
        user_email: booking.user_email,
        title: `📅 Upcoming Charge Tomorrow — $${amount}`,
        body: `Your Week ${weekNum} rental payment of $${amount} for ${booking.vehicle_name} will be charged tomorrow. Make sure your card is up to date.`,
        type: "payment",
        booking_request_id: booking.id,
      });

      const firstName = booking.customer_full_name?.split(" ")[0] || "there";
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: booking.user_email,
        subject: `Upcoming charge tomorrow: $${amount} — ${booking.vehicle_name}`,
        body: emailWrapper("Upcoming Payment Reminder", "Your weekly rental charge is scheduled for tomorrow", `
          <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi ${firstName},</p>
          <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">This is a heads-up that your rental payment will be automatically charged tomorrow.</p>

          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="margin: 0 0 12px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Payment Details</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Vehicle</td><td style="padding: 6px 0; font-weight: 700; text-align: right; font-size: 13px;">${booking.vehicle_name}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Week</td><td style="padding: 6px 0; font-weight: 700; text-align: right; font-size: 13px;">Week ${weekNum}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Amount</td><td style="padding: 6px 0; font-weight: 700; text-align: right; font-size: 15px; color: #111;">$${amount}</td></tr>
              <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Charge Date</td><td style="padding: 6px 0; font-weight: 700; text-align: right; font-size: 13px; color: #d97706;">Tomorrow</td></tr>
            </table>
          </div>

          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 13px; color: #1d4ed8; font-weight: 600;">💡 Want to end your rental?</p>
            <p style="margin: 6px 0 0; font-size: 12px; color: #1e40af;">Complete the drop-off photo inspection in the uRide app. Billing stops automatically once your photos are reviewed and approved.</p>
          </div>

          <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
        `),
        from_name: "uRide",
      });
    }

    return Response.json({ ok: true, warnings_sent: warningTargets.length });
  } catch (error) {
    console.error("[PreChargeWarnings] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});