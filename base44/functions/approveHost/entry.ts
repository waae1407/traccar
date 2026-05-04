import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const APP_URL = "https://uridehub.com";
const LOGO_URL = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { host_id, host_email, host_name } = await req.json();

    if (!host_id || !host_email) return Response.json({ error: "Missing required fields" }, { status: 400 });

    // Update user role to "host" if exists
    const users = await base44.asServiceRole.entities.User.filter({ email: host_email });
    if (users[0]) {
      await base44.asServiceRole.entities.User.update(users[0].id, { role: "host" });
    }

    const firstName = host_name?.split(" ")[0] || "there";

    const emailBody = `
<div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
  <div style="background: linear-gradient(135deg, #e91e8c, #7c3aed); padding: 32px 32px 28px; border-radius: 16px 16px 0 0; text-align: center;">
    <img src="${LOGO_URL}" alt="uRide" style="width: 56px; height: 56px; border-radius: 14px; border: 2px solid rgba(255,255,255,0.35); display: block; margin: 0 auto 10px;" />
    <div style="color: white; font-size: 22px; font-weight: 800; margin-bottom: 8px;">uRide</div>
    <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800;">Welcome to the Host Program! 🎉</h1>
  </div>
  <div style="background: #fafafa; padding: 28px 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
    <p style="font-size: 16px; color: #374151; margin: 0 0 20px;">Hi ${firstName},</p>
    <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 24px;">Your uRide host application has been <strong style="color: #16a34a;">approved!</strong> You can now list your vehicles and start earning 80% of every rental automatically via Stripe.</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <p style="margin: 0 0 16px; font-size: 12px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Your Next Steps</p>
      <div style="space-y: 12px;">
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
          <div style="background: #e91e8c; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0;">1</div>
          <div><strong style="font-size: 14px;">Connect your bank via Stripe</strong><br><span style="font-size: 13px; color: #6b7280;">Set up automated payouts — takes 5 minutes</span></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
          <div style="background: #e91e8c; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0;">2</div>
          <div><strong style="font-size: 14px;">Add your vehicles</strong><br><span style="font-size: 13px; color: #6b7280;">Upload photos, set rates, add pickup details</span></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
          <div style="background: #e91e8c; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0;">3</div>
          <div><strong style="font-size: 14px;">Upload compliance docs</strong><br><span style="font-size: 13px; color: #6b7280;">Insurance, registration, and inspection</span></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <div style="background: #7c3aed; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0;">4</div>
          <div><strong style="font-size: 14px;">Launch your branded storefront</strong><br><span style="font-size: 13px; color: #6b7280;">Build your public store page and start getting bookings</span></div>
        </div>
      </div>
    </div>

    <div style="text-align: center; margin-bottom: 16px;">
      <a href="${APP_URL}/host/brand" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">
        🚀 Build My Store →
      </a>
    </div>
    <div style="text-align: center; margin-bottom: 24px;">
      <a href="${APP_URL}/host/dashboard" style="font-size: 13px; color: #9ca3af; text-decoration: underline;">
        Go to Host Dashboard
      </a>
    </div>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: #166534; font-weight: 600;">💰 How your earnings work</p>
      <p style="margin: 6px 0 0; font-size: 13px; color: #14532d;">You keep 80% of every rental. uRide keeps 20%. Payments go directly to your bank account within 2 business days via Stripe Connect — fully automated, no manual work needed.</p>
    </div>

    <p style="margin: 0; font-size: 13px; color: #374151; font-weight: 600;">— The uRide Team</p>
    <p style="margin: 8px 0 0; font-size: 12px; color: #9ca3af;">Questions? Reply to this email · uridehub.com</p>
  </div>
</div>`;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: host_email,
      subject: `Welcome to uRide Hosts, ${firstName}! Your application was approved 🎉`,
      body: emailBody,
      from_name: "uRide",
    });

    // Create in-app notification
    await base44.asServiceRole.entities.Notification.create({
      user_email: host_email,
      title: "🎉 Host Application Approved!",
      body: "Welcome to the uRide Host Program! Set up your Stripe payouts and add your first vehicle.",
      type: "system",
    });

    console.log(`[ApproveHost] ✓ Approved and emailed host ${host_id}`);
    return Response.json({ success: true });
  } catch (error) {
    console.error("[ApproveHost] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});