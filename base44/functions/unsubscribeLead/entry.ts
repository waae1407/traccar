// Public endpoint — no auth required
// Called via link in email/SMS: /api/unsubscribeLead?token=xxx&email=xxx
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { token, email } = body;

    if (!email) {
      return Response.json({ error: "Missing email" }, { status: 400 });
    }

    const leads = await base44.asServiceRole.entities.LeadFollowUp.filter({ user_email: email });
    if (leads.length === 0) {
      return Response.json({ ok: true, message: "Already unsubscribed or not found" });
    }

    const lead = leads[0];

    // Validate token if provided
    if (token && lead.unsubscribe_token && token !== lead.unsubscribe_token) {
      return Response.json({ error: "Invalid unsubscribe token" }, { status: 403 });
    }

    await base44.asServiceRole.entities.LeadFollowUp.update(lead.id, {
      subscribed: false,
      unsubscribed_at: new Date().toISOString(),
    });

    console.log(`[LeadUnsubscribe] Unsubscribed ${email}`);
    return Response.json({ ok: true, message: "You have been unsubscribed from uRide follow-up messages." });
  } catch (error) {
    console.error("[LeadUnsubscribe] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});