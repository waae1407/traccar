import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { device_id, delay_seconds } = body;

    if (!device_id || typeof delay_seconds !== 'number' || delay_seconds < 0 || delay_seconds > 30) {
      return Response.json({ error: 'Invalid parameters. device_id required, delay_seconds must be 0-30' }, { status: 400 });
    }

    const device = await base44.asServiceRole.entities.TelematicsDevice.get(device_id);
    if (!device) {
      return Response.json({ error: 'Device not found' }, { status: 404 });
    }

    await base44.asServiceRole.entities.TelematicsDevice.update(device_id, {
      post_heartbeat_release_delay_seconds: delay_seconds
    });

    return Response.json({
      success: true,
      device_id,
      delay_seconds,
      message: `Delay updated to ${delay_seconds}s`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});