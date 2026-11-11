// Shared email utility — every message goes out in the one uRide layout.
// Call via base44.functions.invoke('sendEmail', { to, subject, body, from_name })
// or 'sendBrandedEmail' directly when you also have facts / action_url.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { to, subject, body, from_name } = await req.json();

    if (!to || !subject || !body) {
      return Response.json({ error: "Missing required fields: to, subject, body" }, { status: 400 });
    }

    const res = await base44.asServiceRole.functions.invoke('sendBrandedEmail', {
      to,
      subject,
      body,
      from_name,
    });

    return Response.json(res.data ?? { success: true });
  } catch (error) {
    console.error("[sendEmail] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});