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

const APP_URL = "https://uridehub.com";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const { host_id } = await req.json();
    if (!host_id) return Response.json({ error: "Missing host_id" }, { status: 400 });

    const hosts = await base44.asServiceRole.entities.Host.filter({ id: host_id });
    const host = hosts[0];
    if (!host) return Response.json({ error: "Host not found" }, { status: 404 });

    // Update verification status
    await base44.asServiceRole.entities.Host.update(host_id, { verification_status: "docs_requested" });

    // Ensure the user has at least "host" role so the portal link in the email works
    const users = await base44.asServiceRole.entities.User.filter({ email: host.email });
    if (users[0] && users[0].role !== "host" && users[0].role !== "admin") {
      await base44.asServiceRole.entities.User.update(users[0].id, { role: "host" });
    }

    const firstName = host.full_name?.split(" ")[0] || "there";

    await sendEmail(host.email, "Action Required: Upload Your Verification Documents — uRide Host", `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#e91e8c,#7c3aed);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center;">
          <h1 style="color:white;margin:0;font-size:22px;font-weight:800;">Documents Required 📋</h1>
        </div>
        <div style="background:#fafafa;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;">
          <p style="font-size:15px;color:#374151;margin:0 0 16px;">Hi ${firstName},</p>
          <p style="font-size:15px;color:#374151;margin:0 0 20px;">To complete your host verification, please upload the following documents in your host portal:</p>
          <ul style="font-size:14px;color:#374151;line-height:2;">
            <li>✅ Government-issued Photo ID (front &amp; back)</li>
            <li>✅ Selfie holding your ID</li>
            <li>✅ EIN Confirmation Letter (if business entity)</li>
          </ul>
          <div style="text-align:center;margin:24px 0;">
            <a href="${APP_URL}/host/verification" style="background:linear-gradient(135deg,#e91e8c,#7c3aed);color:white;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:15px;">Upload Documents →</a>
          </div>
          <p style="font-size:13px;color:#9ca3af;">Questions? Reply to this email — The uRide Team</p>
        </div>
      </div>`, "uRide Verification");

    // In-app notification too
    await base44.asServiceRole.entities.Notification.create({
      user_email: host.email,
      title: "📋 Documents Required",
      body: "Please upload your verification documents (ID, selfie, EIN letter) to proceed with your host application.",
      type: "system",
    });

    console.log(`[RequestHostDocs] ✓ Sent docs request to ${host.email}`);
    return Response.json({ success: true });
  } catch (error) {
    console.error("[RequestHostDocs] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});