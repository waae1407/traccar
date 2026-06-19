import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_MAX_DURATION_SECONDS = 90;
const DEFAULT_PULSE_INTERVAL_SECONDS = 10;
const DEFAULT_MAX_PULSES = 9;

function isReturnState(vehicle) { return ['Dropoff Submitted', 'Return Pending Host Review', 'Retired'].includes(vehicle?.status); }

async function resolveContext(base44, body) {
  let vehicle = null;
  let device = null;
  if (body.vehicle_id) {
    try { vehicle = (await base44.asServiceRole.entities.Vehicle.filter({ id: body.vehicle_id }))[0] || null; } catch { vehicle = null; }
  }
  if (body.telematics_device_id) {
    try { device = (await base44.asServiceRole.entities.TelematicsDevice.filter({ id: body.telematics_device_id }))[0] || null; } catch { device = null; }
  }
  if (!device && vehicle) device = (await base44.asServiceRole.entities.TelematicsDevice.filter({ vehicle_id: vehicle.id }))[0] || null;
  if (!vehicle && device?.vehicle_id) {
    try { vehicle = (await base44.asServiceRole.entities.Vehicle.filter({ id: device.vehicle_id }))[0] || null; } catch { vehicle = null; }
  }
  if (!vehicle) throw new Error('Vehicle not found.');
  if (!device) throw new Error('No telematics device is assigned to this vehicle.');
  return { vehicle, device };
}

async function assertPermission(base44, user, vehicle) {
  if (user.role === 'admin') return;
  if (user.role !== 'host') throw new Error('Only admins and hosts can trigger alarm mode.');
  const host = vehicle.host_id ? (await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id }))[0] : null;
  if (!host || (host.email !== user.email && host.user_id !== user.id)) throw new Error('Host can only trigger alarm for owned vehicles.');
}

// Send a single alarm pulse immediately via sendTelematicsCommand
async function sendPulse(base44, { session, vehicle, pulseNumber }) {
  const response = await base44.functions.invoke('sendTelematicsCommand', {
    vehicle_id: vehicle.id,
    command_type: 'alarm_pulse',
    alarm_session_id: session.id,
    pulse_number: pulseNumber,
    source: 'software_alarm_mode'
  });
  const commandId = response?.data?.command_id || '';
  await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, {
    pulses_sent: pulseNumber,
    last_command_id: commandId
  });
  return response.data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { vehicle, device } = await resolveContext(base44, body);
    await assertPermission(base44, user, vehicle);
    if (device.online_status === 'offline') return Response.json({ error: 'Device is offline.' }, { status: 400 });
    if (isReturnState(vehicle)) return Response.json({ error: 'Vehicle is in return state.' }, { status: 400 });

    // Block duplicate active sessions
    const active = await base44.asServiceRole.entities.TelematicsAlarmSession.filter({ vehicle_id: vehicle.id, status: 'active' });
    if (active[0]) return Response.json({ error: 'An alarm session is already active for this vehicle.', session: active[0] }, { status: 409 });

    // Rate limit: max 3 starts in 2 minutes
    const recent = (await base44.asServiceRole.entities.TelematicsAlarmSession.filter({ vehicle_id: vehicle.id }))
      .filter(s => new Date(s.started_at || 0).getTime() > Date.now() - 2 * 60 * 1000);
    if (recent.length >= 3) return Response.json({ error: 'Alarm start rate limit reached. Please wait before retrying.' }, { status: 429 });

    // Create the session
    const session = await base44.asServiceRole.entities.TelematicsAlarmSession.create({
      vehicle_id: vehicle.id,
      host_id: vehicle.host_id || device.host_id || '',
      telematics_device_id: device.id,
      provider_key: device.provider_key,
      started_by: user.email,
      started_role: user.role || 'user',
      status: 'active',
      started_at: new Date().toISOString(),
      max_duration_seconds: DEFAULT_MAX_DURATION_SECONDS,
      pulse_interval_seconds: DEFAULT_PULSE_INTERVAL_SECONDS,
      max_pulses: DEFAULT_MAX_PULSES,
      pulses_sent: 0
    });

    // Fire pulse 1 immediately and return — the noranAlarmPulseScheduler automation
    // handles subsequent pulses by polling active sessions every 10 seconds.
    try {
      await sendPulse(base44, { session, vehicle, pulseNumber: 1 });
    } catch (error) {
      await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, {
        status: 'failed',
        ended_at: new Date().toISOString(),
        cancel_reason: error.message
      });
      return Response.json({ error: `First pulse failed: ${error.message}`, session }, { status: 500 });
    }

    const refreshedSession = (await base44.asServiceRole.entities.TelematicsAlarmSession.filter({ id: session.id }))[0] || session;
    return Response.json({ ok: true, session: refreshedSession });
  } catch (error) {
    const status = error.message === 'Vehicle not found.' || error.message === 'No telematics device is assigned to this vehicle.' ? 404 : 500;
    return Response.json({ error: error.message }, { status });
  }
});