import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function assertPermission(base44, user, session) {
  if (user.role === 'admin') return;
  if (user.role !== 'host') throw new Error('Only admins and hosts can cancel alarm mode.');
  const vehicle = (await base44.asServiceRole.entities.Vehicle.filter({ id: session.vehicle_id }))[0];
  const host = vehicle?.host_id ? (await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id }))[0] : null;
  if (!host || (host.email !== user.email && host.user_id !== user.id)) throw new Error('Host can only cancel alarm for owned vehicles.');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    let session = null;
    if (body.alarm_session_id) session = (await base44.asServiceRole.entities.TelematicsAlarmSession.filter({ id: body.alarm_session_id }))[0] || null;
    if (!session && body.vehicle_id) session = (await base44.asServiceRole.entities.TelematicsAlarmSession.filter({ vehicle_id: body.vehicle_id, status: 'active' }))[0] || null;
    if (!session) return Response.json({ error: 'No active alarm session found.' }, { status: 404 });
    await assertPermission(base44, user, session);
    const updated = await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, {
      status: 'cancelled',
      ended_at: new Date().toISOString(),
      cancel_reason: body.reason || 'manual_cancel'
    });
    return Response.json({ ok: true, session: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});