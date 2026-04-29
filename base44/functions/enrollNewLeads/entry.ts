// Scheduled daily — finds users not yet enrolled as leads and enrolls them
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

    // Get all non-admin users
    const users = await base44.asServiceRole.entities.User.list("-created_date", 300);
    const nonAdmins = users.filter(u => u.role !== "admin" && u.email);

    // Get all existing lead records
    const existingLeads = await base44.asServiceRole.entities.LeadFollowUp.list("-created_date", 500);
    const enrolledEmails = new Set(existingLeads.map(l => l.user_email));

    const toEnroll = nonAdmins.filter(u => !enrolledEmails.has(u.email));
    console.log(`[EnrollLeads] ${toEnroll.length} new users to enroll`);

    for (const user of toEnroll) {
      await base44.asServiceRole.entities.LeadFollowUp.create({
        user_email: user.email,
        user_name: user.full_name || "",
        user_phone: user.phone || "",
        subscribed: true,
        enrolled_at: new Date().toISOString(),
        follow_up_count: 0,
        unsubscribe_token: generateToken(user.email),
      });
      console.log(`[EnrollLeads] Enrolled ${user.email}`);
    }

    return Response.json({ ok: true, enrolled: toEnroll.length });
  } catch (error) {
    console.error("[EnrollLeads] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});