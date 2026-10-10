import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const hostId = body.host_id;

    if (!hostId) return Response.json({ error: 'host_id required' }, { status: 400 });

    // Find all active, unacknowledged safety events for this host
    const { items } = await base44.entities.TelematicsSafetyEvent.filter({
      host_id: hostId,
      is_active: true,
      acknowledged_at: { $exists: false },
    }, { limit: 500 });

    if (items.length === 0) {
      return Response.json({ acknowledged: 0 });
    }

    const now = new Date().toISOString();
    const ids = items.map((e) => e.id);

    // Bulk update: set acknowledged_at + acknowledged_by on all matching events
    await base44.entities.TelematicsSafetyEvent.updateMany(
      { id: { $in: ids } },
      { $set: { acknowledged_at: now, acknowledged_by: user.email } }
    );

    return Response.json({ acknowledged: ids.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});