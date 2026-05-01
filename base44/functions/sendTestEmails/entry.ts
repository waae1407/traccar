import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const LOGO_URL = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";
const APP_URL = "https://uridehub.com";

function emailWrapper(headline, subtitle, bodyContent) {
  return `
<div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
  <div style="background: linear-gradient(135deg, #e91e8c, #7c3aed); padding: 28px 32px; border-radius: 16px 16px 0 0;">
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
      <img src="${LOGO_URL}" alt="uRide" style="width: 48px; height: 48px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.3);" />
      <span style="color: white; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">uRide</span>
    </div>
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
    const { to } = await req.json();
    if (!to) return Response.json({ error: "Missing 'to' email" }, { status: 400 });

    const results = [];

    // 1. Lead Follow-Up Email
    const leadBody = emailWrapper("Hey Dan, your ride is waiting!", "Get on the road with uRide", `
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi Dan,</p>
      <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">We noticed you created an account on uRide but haven't booked your vehicle yet. We'd love to help you get on the road!</p>
      <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0 0 12px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Why drivers choose uRide</p>
        <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #374151; line-height: 2;">
          <li><strong>$0 deposit</strong> — no money upfront</li>
          <li><strong>Flexible weekly payments</strong> — cancel anytime</li>
          <li><strong>Approved in 24 hours</strong> — fast and easy</li>
          <li><strong>Rent-to-Own</strong> — drive toward ownership</li>
          <li><strong>Uber &amp; Lyft ready</strong> vehicles available</li>
        </ul>
      </div>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/book-now" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Browse Available Vehicles →</a>
      </div>
      <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
    `);
    await base44.asServiceRole.integrations.Core.SendEmail({ to, subject: "[TEST] Your perfect ride is waiting, Dan", body: leadBody, from_name: "uRide" });
    results.push("lead_followup: sent");

    // 2. Abandoned Checkout Email
    const abandonedBody = emailWrapper("You're almost there!", "Complete Your Booking", `
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi Dan,</p>
      <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">You started booking the <strong>2023 Toyota Camry</strong> but didn't finish the <strong>payment</strong> step. It only takes a few minutes to complete.</p>
      <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0 0 12px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Your Reserved Vehicle</p>
        <p style="margin: 0 0 16px; font-size: 18px; font-weight: 700; color: #111;">2023 Toyota Camry</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Weekly Rate</td><td style="padding: 6px 0; font-weight: 700; text-align: right; color: #111; font-size: 14px;">$299/week</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Security Deposit</td><td style="padding: 6px 0; font-weight: 700; text-align: right; color: #16a34a; font-size: 14px;">$0 Required</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Pending Step</td><td style="padding: 6px 0; font-weight: 700; text-align: right; color: #d97706; font-size: 14px;">Payment</td></tr>
        </table>
      </div>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/checkout" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">Continue My Booking →</a>
      </div>
      <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
    `);
    await base44.asServiceRole.integrations.Core.SendEmail({ to, subject: "[TEST] You're almost there — complete your uRide booking", body: abandonedBody, from_name: "uRide" });
    results.push("abandoned_checkout: sent");

    // 3. Payment Receipt Email
    const receiptBody = emailWrapper("Payment Received ✓", "Receipt", `
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151;">Hi Dan! Your payment was successful and your booking is now under review.</p>
      <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Vehicle</td><td style="padding: 6px 0; font-weight: 600; text-align: right; font-size: 13px;">2023 Toyota Camry</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Booking Type</td><td style="padding: 6px 0; font-weight: 600; text-align: right; font-size: 13px;">Weekly</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Amount Paid Today</td><td style="padding: 6px 0; font-weight: 700; text-align: right; font-size: 15px; color: #111;">$299</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Recurring Amount</td><td style="padding: 6px 0; font-weight: 600; text-align: right; font-size: 13px; color: #6b7280;">$299/week</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Booking Status</td><td style="padding: 6px 0; font-weight: 600; text-align: right; font-size: 13px; color: #d97706;">Pending Review</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Reference</td><td style="padding: 6px 0; font-weight: 600; text-align: right; font-size: 12px; font-family: monospace;">#ABC12345</td></tr>
        </table>
      </div>
      <div style="background: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
        <p style="margin: 0; font-size: 14px; color: #166534; font-weight: 700;">📍 Your Pickup Address</p>
        <p style="margin: 6px 0 0; font-size: 15px; color: #111; font-weight: 600;">1234 Main St, Houston, TX 77001</p>
        <p style="margin: 4px 0 0; font-size: 12px; color: #16a34a;">🕐 Mon–Fri 9am–5pm</p>
      </div>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px;">
        <p style="margin: 0; font-size: 13px; color: #166534; font-weight: 600;">What happens next?</p>
        <p style="margin: 6px 0 0; font-size: 12px; color: #14532d;">Our team will review your booking within 24 hours. You'll receive a notification once it's approved.</p>
      </div>
      <p style="margin: 20px 0 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
    `);
    await base44.asServiceRole.integrations.Core.SendEmail({ to, subject: "[TEST] Payment Confirmed — $299 · 2023 Toyota Camry", body: receiptBody, from_name: "uRide" });
    results.push("payment_receipt: sent");

    // 4. Pre-Charge Warning Email
    const prechargeBody = emailWrapper("Upcoming Payment Reminder", "Your weekly rental charge is scheduled for tomorrow", `
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">Hi Dan,</p>
      <p style="margin: 0 0 24px; font-size: 15px; color: #374151; line-height: 1.6;">This is a heads-up that your rental payment will be automatically charged tomorrow.</p>
      <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0 0 12px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Payment Details</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Vehicle</td><td style="padding: 6px 0; font-weight: 700; text-align: right; font-size: 13px;">2023 Toyota Camry</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Week</td><td style="padding: 6px 0; font-weight: 700; text-align: right; font-size: 13px;">Week 3</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Amount</td><td style="padding: 6px 0; font-weight: 700; text-align: right; font-size: 15px; color: #111;">$299</td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Charge Date</td><td style="padding: 6px 0; font-weight: 700; text-align: right; font-size: 13px; color: #d97706;">Tomorrow</td></tr>
        </table>
      </div>
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 13px; color: #1d4ed8; font-weight: 600;">💡 Want to end your rental?</p>
        <p style="margin: 6px 0 0; font-size: 12px; color: #1e40af;">Complete the drop-off photo inspection in the uRide app. Billing stops automatically once your photos are reviewed and approved.</p>
      </div>
      <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
    `);
    await base44.asServiceRole.integrations.Core.SendEmail({ to, subject: "[TEST] Upcoming charge tomorrow: $299 — 2023 Toyota Camry", body: prechargeBody, from_name: "uRide" });
    results.push("pre_charge_warning: sent");

    console.log(`[TestEmails] Sent 4 test emails to ${to}`);
    return Response.json({ ok: true, sent_to: to, results });
  } catch (error) {
    console.error("[TestEmails] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});