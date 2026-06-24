import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const APP_URL = 'https://uridehub.com';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { user_email, title, body: message, url } = body;

    if (!user_email || !title || !message) {
      return Response.json({ error: 'user_email, title, and body are required' }, { status: 400 });
    }

    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    const restKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    if (!appId || !restKey) {
      return Response.json({ error: 'OneSignal not configured' }, { status: 503 });
    }

    const res = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${restKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: appId,
        include_aliases: { external_id: [user_email] },
        target_channel: 'push',
        headings: { en: String(title).slice(0, 100) },
        contents: { en: String(message).slice(0, 4000) },
        ...(url ? { url: url.startsWith('http') ? url : `${APP_URL}${url}` } : {}),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return Response.json({ error: data.errors?.[0] || 'Push failed' }, { status: 500 });
    }

    return Response.json({ ok: true, notification_id: data.id, recipients: data.recipients || 0 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});