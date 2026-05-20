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
const LOGO_URL = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

async function logEvent(base44, data) {
  try {
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: data.event_type,
      actor_id: data.actor_id || 'admin',
      actor_email: data.actor_email || 'admin',
      actor_role: data.actor_role || 'admin',
      target_entity: data.target_entity || '',
      target_id: data.target_id || '',
      host_id: data.host_id || '',
      summary: data.summary || '',
      metadata: data.metadata || {},
      source: data.source || 'admin_panel',
      user_email: data.actor_email || 'admin',
      event_title: data.summary || data.event_type,
      event_status: 'success',
    });
  } catch (e) {
    console.error('[AuditLog]', e.message);
  }
}

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

    // Generate a one-time brand builder token
    const token = crypto.randomUUID();
    await base44.asServiceRole.entities.Host.update(host_id, { brand_builder_token: token });

    const emailBody = `
<div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111;">

  <!-- Header -->
  <div style="background: linear-gradient(135deg, #e91e8c, #7c3aed); padding: 32px 32px 28px; border-radius: 16px 16px 0 0; text-align: center;">
    <img src="${LOGO_URL}" alt="uRide" style="width: 56px; height: 56px; border-radius: 14px; border: 2px solid rgba(255,255,255,0.35); display: block; margin: 0 auto 10px;" />
    <div style="color: white; font-size: 22px; font-weight: 800; margin-bottom: 8px;">uRide</div>
    <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800;">🎉 You're Approved</h1>
    <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Welcome to uRide — your rental business starts now.</p>
  </div>

  <div style="background: #fafafa; padding: 28px 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">

    <p style="font-size: 16px; color: #374151; margin: 0 0 8px;">Hi ${firstName},</p>
    <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 8px;">You're officially approved to host on uRide.</p>
    <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 28px; font-style: italic;">You're no longer just listing cars — you're running your own rental business.</p>

    <!-- Next Steps -->
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <p style="margin: 0 0 16px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.08em;">🚀 What happens next — You can now:</p>
      <div>
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
          <div style="background: #e91e8c; color: white; width: 24px; height: 24px; border-radius: 50%; font-size: 12px; font-weight: 700; flex-shrink: 0; text-align: center; line-height: 24px;">1</div>
          <div><strong style="font-size: 14px;">Connect your bank via Stripe</strong><br><span style="font-size: 13px; color: #6b7280;">Set up automated payouts — takes 5 minutes</span></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
          <div style="background: #e91e8c; color: white; width: 24px; height: 24px; border-radius: 50%; font-size: 12px; font-weight: 700; flex-shrink: 0; text-align: center; line-height: 24px;">2</div>
          <div><strong style="font-size: 14px;">Add your vehicles</strong><br><span style="font-size: 13px; color: #6b7280;">Upload photos, set rates, add pickup details</span></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
          <div style="background: #e91e8c; color: white; width: 24px; height: 24px; border-radius: 50%; font-size: 12px; font-weight: 700; flex-shrink: 0; text-align: center; line-height: 24px;">3</div>
          <div><strong style="font-size: 14px;">Upload compliance docs</strong><br><span style="font-size: 13px; color: #6b7280;">Insurance, registration, and inspection</span></div>
        </div>
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <div style="background: #7c3aed; color: white; width: 24px; height: 24px; border-radius: 50%; font-size: 12px; font-weight: 700; flex-shrink: 0; text-align: center; line-height: 24px;">4</div>
          <div><strong style="font-size: 14px;">Launch your branded storefront</strong><br><span style="font-size: 13px; color: #6b7280;">Build your public store page and start getting bookings</span></div>
        </div>
      </div>
    </div>

    <!-- CTA -->
    <div style="text-align: center; margin-bottom: 12px;">
      <a href="${APP_URL}/host/brand?token=${token}" style="display: inline-block; background: linear-gradient(135deg, #e91e8c, #7c3aed); color: white; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none;">
        🚀 Build My Store →
      </a>
    </div>
    <div style="text-align: center; margin-bottom: 28px;">
      <a href="${APP_URL}/host/dashboard" style="font-size: 13px; color: #9ca3af; text-decoration: underline;">Go to Host Dashboard</a>
    </div>

    <!-- Earnings Breakdown -->
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
      <p style="margin: 0 0 6px; font-size: 14px; color: #166534; font-weight: 700;">💰 How your earnings work</p>
      <p style="margin: 0 0 16px; font-size: 13px; color: #14532d; line-height: 1.6;">Every booking is processed securely through Stripe. Here's exactly how the math works:</p>

      <!-- Example table -->
      <div style="background: white; border-radius: 10px; padding: 16px; margin-bottom: 16px; border: 1px solid #d1fae5;">
        <p style="margin: 0 0 12px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em;">🧾 Example on a $300 weekly rental</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #374151;">Renter pays</td>
            <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #374151;">$300.00</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 6px 0; color: #6b7280;">Stripe processing fee (~3.05%)</td>
            <td style="padding: 6px 0; text-align: right; color: #ef4444;">−$9.15</td>
          </tr>
          <tr style="border-top: 1px solid #f3f4f6;">
            <td style="padding: 6px 0; color: #6b7280;">uRide platform fee (8%)</td>
            <td style="padding: 6px 0; text-align: right; color: #ef4444;">−$24.00</td>
          </tr>
          <tr style="border-top: 2px solid #d1fae5;">
            <td style="padding: 8px 0 4px; color: #166534; font-weight: 700; font-size: 14px;">Your payout</td>
            <td style="padding: 8px 0 4px; text-align: right; color: #166534; font-weight: 800; font-size: 16px;">$266.85</td>
          </tr>
        </table>
      </div>

      <p style="margin: 0 0 8px; font-size: 13px; color: #166534; font-weight: 600;">⚡ What this means for you:</p>
      <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #14532d; line-height: 2;">
        <li>You keep <strong>~88–90%</strong> of each booking</li>
        <li>No hidden fees — full transparency on every payout</li>
        <li>Your earnings grow as your business grows</li>
      </ul>
    </div>

    <!-- Why hosts switch -->
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
      <p style="margin: 0 0 12px; font-size: 13px; font-weight: 700; color: #111;">🔥 Why hosts are switching to uRide</p>
      <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #374151; line-height: 2.2;">
        <li>Full control of your pricing and policies</li>
        <li>Your own branded storefront — share your link, get bookings</li>
        <li>Direct access to your customers and data</li>
        <li>Lower platform fees than traditional rental platforms</li>
      </ul>
      <p style="margin: 14px 0 0; font-size: 13px; color: #6b7280; font-style: italic;">You're not working <em>for</em> a platform — you're building your own.</p>
    </div>

    <!-- Payouts -->
    <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 14px; margin-bottom: 20px;">
      <p style="margin: 0 0 6px; font-size: 13px; color: #6d28d9; font-weight: 700;">💸 Payouts</p>
      <p style="margin: 0; font-size: 13px; color: #5b21b6; line-height: 1.6;">Your earnings are automatically sent to your bank via Stripe Connect — typically within 2 business days. No manual work. No chasing payments.</p>
    </div>

    <!-- Pro tip -->
    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px; margin-bottom: 24px;">
      <p style="margin: 0 0 6px; font-size: 13px; color: #92400e; font-weight: 700;">🛠️ Pro tip to get your first booking fast</p>
      <ul style="margin: 6px 0 0; padding-left: 18px; font-size: 13px; color: #78350f; line-height: 2;">
        <li>Add <strong>high-quality vehicle photos</strong></li>
        <li>Set <strong>competitive weekly pricing</strong></li>
        <li>Enable <strong>flexible rental options</strong></li>
      </ul>
      <p style="margin: 10px 0 0; font-size: 12px; color: #92400e;">Small improvements = faster bookings.</p>
    </div>

    <p style="margin: 0 0 4px; font-size: 13px; color: #374151; line-height: 1.8;">You set your prices. You control your business. We simply power it.</p>
    <p style="margin: 0 0 16px; font-size: 13px; color: #374151; font-weight: 600;">Welcome to uRide,<br>The uRide Team</p>
    <p style="margin: 0; font-size: 12px; color: #9ca3af;">Questions? <a href="mailto:support@uridehub.com" style="color: #9ca3af;">support@uridehub.com</a> · uridehub.com</p>
  </div>
</div>`;

    await sendEmail(host_email, `Welcome to uRide Hosts, ${firstName}! Your application was approved 🎉`, emailBody, "uRide");

    // Create in-app notification
    await base44.asServiceRole.entities.Notification.create({
      user_email: host_email,
      title: "🎉 Host Application Approved!",
      body: "Welcome to the uRide Host Program! Set up your Stripe payouts and add your first vehicle.",
      type: "system",
    });

    console.log(`[ApproveHost] ✓ Approved and emailed host ${host_id}`);

    await logEvent(base44, {
      event_type: 'host.approved',
      actor_id: 'admin',
      actor_email: 'admin@uridehub.com',
      actor_role: 'admin',
      target_entity: 'Host',
      target_id: host_id,
      target_label: host_name || host_email,
      host_id: host_id,
      summary: `Fleet Partner approved: ${host_name || host_email}`,
      metadata: { host_email, host_name },
      source: 'admin_panel',
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("[ApproveHost] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});