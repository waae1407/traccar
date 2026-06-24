import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    if (!appId) return Response.json({ error: 'OneSignal not configured' }, { status: 503 });

    return Response.json({ app_id: appId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});