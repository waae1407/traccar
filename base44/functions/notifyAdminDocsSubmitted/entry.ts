import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const APP_URL = "https://uridehub.com";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { host_id } = await req.json();
    if (!host_id) return Response.json({ error: "Missing host_id" }, { status: 400 });

    const hosts = await base44.asServiceRole.entities.Host.filter({ id: host_id });
    const host = hosts[0];
    if (!host) return Response.json({ error: "Host not found" }, { status: 404 });

    const admins = await base44.asServiceRole.entities.User.filter({ role: "admin" });

    const emailBody = `
<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#3b82f6,#6366f1);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center;">
    <h1 style="color:white;margin:0;font-size:22px;font-weight:800;">📋 Docs Ready for Review</h1>
  </div>
  <div style="background:#fafafa;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;">
    <p style="font-size:15px;color:#374151;margin:0 0 16px;"><strong>${host.full_name}</strong> has submitted their verification documents and is ready for review.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af;width:100px;">Name</td><td style="font-size:14px;font-weight:600;color:#111;">${host.full_name}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af;">Email</td><td style="font-size:14px;color:#111;">${host.email}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#9ca3af;">Docs</td><td style="font-size:14px;color:#111;">
        ${host.id_front_url ? '✅ ID Front' : '❌ ID Front'} &nbsp;
        ${host.id_back_url ? '✅ ID Back' : '❌ ID Back'} &nbsp;
        ${host.selfie_url ? '✅ Selfie' : '❌ Selfie'}
      </td></tr>
    </table>
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${APP_URL}/admin/hosts" style="background:linear-gradient(135deg,#3b82f6,#6366f1);color:white;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:15px;">Review Documents →</a>
    </div>
  </div>
</div>`;

    for (const admin of admins) {
      if (admin.email) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: admin.email,
          subject: `📋 Host Docs Submitted — ${host.full_name} is ready for review`,
          body: emailBody,
          from_name: "uRide Alerts",
        });
      }
    }

    console.log(`[NotifyAdminDocsSubmitted] ✓ Notified ${admins.length} admin(s) — host: ${host.full_name}`);
    return Response.json({ success: true });
  } catch (error) {
    console.error("[NotifyAdminDocsSubmitted] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});