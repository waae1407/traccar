// Triggered by entity automation when a new User is created
// Auto-enrolls them in the lead follow-up sequence
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function generateToken(email) {
  const str = email + Date.now().toString();
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36) + Date.now().toString(36);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const user = payload?.data;
    if (!user?.email) return Response.json({ ok: true, skipped: "no email" });

    // Skip admin users
    if (user.role === "admin") return Response.json({ ok: true, skipped: "admin" });

    // Check if already enrolled
    const existing = await base44.asServiceRole.entities.LeadFollowUp.filter({ user_email: user.email });
    if (existing.length > 0) return Response.json({ ok: true, skipped: "already enrolled" });

    await base44.asServiceRole.entities.LeadFollowUp.create({
      user_email: user.email,
      user_name: user.full_name || "",
      user_phone: user.phone || "",
      user_role: user.role || "user",
      subscribed: true,
      enrolled_at: new Date().toISOString(),
      follow_up_count: 0,
      unsubscribe_token: generateToken(user.email),
    });

    console.log(`[LeadEnroll] Enrolled ${user.email}`);
    return Response.json({ ok: true, enrolled: user.email });
  } catch (error) {
    console.error("[LeadEnroll] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});