import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const APP_URL = "https://uridehub.com";
const LOGO_URL = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    // Support both direct call and entity automation payload
    const hostData = payload.data || payload;
    const host_id = hostData.id || payload.event?.entity_id;

    // Fetch host if we only have id
    let host = hostData;
    if (host_id && !hostData.full_name) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ id: host_id });
      host = hosts[0];
    }

    if (!host) return Response.json({ error: "Host not found" }, { status: 404 });

    // Get all admin users to notify
    const admins = await base44.asServiceRole.entities.User.filter({ role: "admin" });

    const emailBody = `
<div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
  <div style="background: linear-gradient(135deg, #e91e8c, #7c3aed); padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
    <img src="${LOGO_URL}" alt="uRide" style="width: 48px; height: 48px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.35); display: block; margin: 0 auto 10px;" />
    <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 800;">🚨 New Host Application</h1>
  </div>
  <div style="background: #fafafa; padding: 28px 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
    <p style="font-size: 15px; color: #374151; margin: 0 0 20px;">A new host has submitted an application and is awaiting your review.</p>
    
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; font-size: 13px; color: #9ca3af; width: 120px;">Name</td><td style="font-size: 14px; font-weight: 600; color: #111;">${host.full_name}</td></tr>
        <tr><td style="padding: 6px 0; font-size: 13px; color: #9ca3af;">Email</td><td style="font-size: 14px; color: #111;">${host.email}</td></tr>
        <tr><td style="padding: 6px 0; font-size: 13px; color: #9ca3af;">Phone</td><td style="font-size: 14px; color: #111;">${host.phone || "—"}</td></tr>
        <tr><td style="padding: 6px 0; font-size: 13px; color: #9ca3af;">Business</td><td style="font-size: 14px; color: #111;">${host.business_name || "Individual"}</td></tr>
        <tr><td style="padding: 6px 0; font-size: 13px; color: #9ca3af;">Location</td><td style="font-size: 14px; color: #111;">${host.city || "—"}, ${host.state || "—"}</td></tr>
        <tr><td style="padding: 6px 0; font-size: 13px; color: #9ca3af;">Referral</td><td style="font-size: 14px; color: #111;">${host.referral_source || "—"}</td></tr>
      </table>
    </div>

    ${host.bio ? `<div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 20px;"><p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #9ca3af; text-transform: uppercase;">Their Message</p><p style="margin: 0; font-size: 14px; color: #374151;">${host.bio}</p></div>` : ""}

    <div style="text-align: center; margin-bottom: 20px;">
      <a href="${APP_URL}/admin/hosts" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">
        Review Application →
      </a>
    </div>

    <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">uRide Admin Portal · admin@uridehub.com</p>
  </div>
</div>`;

    for (const admin of admins) {
      if (admin.email) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: admin.email,
          subject: `🚨 New Host Application — ${host.full_name} (${host.city || ""} ${host.state || ""})`,
          body: emailBody,
          from_name: "uRide Alerts",
        });
      }
    }

    console.log(`[NotifyAdminNewHost] ✓ Notified ${admins.length} admin(s) of new host: ${host.full_name}`);
    return Response.json({ success: true, admins_notified: admins.length });
  } catch (error) {
    console.error("[NotifyAdminNewHost] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});