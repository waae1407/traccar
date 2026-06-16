import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { to, body } = await req.json();
    if (!to || !body) return Response.json({ error: 'Missing to or body' }, { status: 400 });

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const from = Deno.env.get('TWILIO_PHONE_NUMBER');

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }),
    });

    const result = await response.json();
    if (!response.ok) return Response.json({ error: result.message || 'Twilio error', details: result }, { status: 400 });

    return Response.json({ ok: true, sid: result.sid, to, body });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});