import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { host_id } = await req.json();
    if (!host_id) return Response.json({ error: 'Missing host_id' }, { status: 400 });

    const response = await base44.functions.invoke('enableUridePayments', { host_id });
    return Response.json({
      ...response.data,
      deprecated_route: true,
      authoritative_function: 'enableUridePayments'
    });
  } catch (error) {
    console.error('[StripeConnectDeprecatedRoute] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});