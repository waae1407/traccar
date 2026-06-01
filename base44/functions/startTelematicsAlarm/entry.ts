import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_MAX_DURATION_SECONDS = 90;
const DEFAULT_PULSE_INTERVAL_SECONDS = 10;
const DEFAULT_MAX_PULSES = 9;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
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
async function sendPulse(base44, { session, vehicle, pulseNumber }) {
  const response = await base44.functions.invoke('sendTelematicsCommand', {
    vehicle_id: vehicle.id,
    command_type: 'alarm_pulse',
    alarm_session_id: session.id,
    pulse_number: pulseNumber,
    source: 'software_alarm_mode'
  });
  const commandId = response?.data?.command_id || '';
  await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, { pulses_sent: pulseNumber, last_command_id: commandId });
  return response.data;
}
async function runAlarmCycle(base44, sessionId) {
  const initialSession = (await base44.asServiceRole.entities.TelematicsAlarmSession.filter({ id: sessionId }))[0];
  const startPulse = Number(initialSession?.pulses_sent || 0) + 1;
  for (let pulse = startPulse; pulse <= DEFAULT_MAX_PULSES; pulse += 1) {
    const session = (await base44.asServiceRole.entities.TelematicsAlarmSession.filter({ id: sessionId }))[0];
    if (!session || session.status !== 'active') return;
    const device = (await base44.asServiceRole.entities.TelematicsDevice.filter({ id: session.telematics_device_id }))[0];
    const vehicle = (await base44.asServiceRole.entities.Vehicle.filter({ id: session.vehicle_id }))[0];
    if (!device || device.online_status === 'offline') {
      await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, { status: 'failed', ended_at: new Date().toISOString(), cancel_reason: 'device_offline' });
      return;
    }
    if (isReturnState(vehicle)) {
      await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, { status: 'cancelled', ended_at: new Date().toISOString(), cancel_reason: 'vehicle_returned' });
      return;
    }
    try {
      await sendPulse(base44, { session, vehicle, pulseNumber: pulse });
    } catch (error) {
      await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, { status: 'failed', ended_at: new Date().toISOString(), cancel_reason: error.message });
      return;
    }
    if (pulse >= DEFAULT_MAX_PULSES || Date.now() - new Date(session.started_at).getTime() >= DEFAULT_MAX_DURATION_SECONDS * 1000) {
      await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, { status: 'completed', ended_at: new Date().toISOString(), cancel_reason: 'timeout_or_max_pulses' });
      return;
    }
    await sleep(DEFAULT_PULSE_INTERVAL_SECONDS * 1000);
  }
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
    const active = await base44.asServiceRole.entities.TelematicsAlarmSession.filter({ vehicle_id: vehicle.id, status: 'active' });
    if (active[0]) return Response.json({ error: 'An alarm session is already active for this vehicle.', session: active[0] }, { status: 409 });
    const recent = (await base44.asServiceRole.entities.TelematicsAlarmSession.filter({ vehicle_id: vehicle.id })).filter(s => new Date(s.started_at || 0).getTime() > Date.now() - 2 * 60 * 1000);
    if (recent.length >= 3) return Response.json({ error: 'Alarm start rate limit reached. Please wait before retrying.' }, { status: 429 });
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
    try {
      await sendPulse(base44, { session, vehicle, pulseNumber: 1 });
    } catch (error) {
      await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, { status: 'failed', ended_at: new Date().toISOString(), cancel_reason: error.message });
      return Response.json({ error: error.message }, { status: 500 });
    }
    const refreshedSession = (await base44.asServiceRole.entities.TelematicsAlarmSession.filter({ id: session.id }))[0] || session;
    const cycle = runAlarmCycle(base44, session.id);
    if (globalThis.EdgeRuntime?.waitUntil) globalThis.EdgeRuntime.waitUntil(cycle);
    else cycle.catch((error) => console.error('[alarm-cycle]', error.message));
    return Response.json({ ok: true, session: refreshedSession });
  } catch (error) {
    const status = error.message === 'Vehicle not found.' || error.message === 'No telematics device is assigned to this vehicle.' ? 404 : 500;
    return Response.json({ error: error.message }, { status });
  }
});