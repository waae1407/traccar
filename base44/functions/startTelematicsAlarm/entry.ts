import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALARM_ASCII_ACTION = '2,3';
const DEFAULT_MAX_DURATION_SECONDS = 90;
const DEFAULT_PULSE_INTERVAL_SECONDS = 10;
const DEFAULT_MAX_PULSES = 9;

function sanitizeIdentifier(value = '') { return String(value).replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80); }
function bytesToHex(bytes) { return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase(); }
function asciiToHex(input = '') { return bytesToHex(new TextEncoder().encode(input)); }
function normalizeFixedHex(value, fallback, expectedBytes, name) {
  const hex = String(value || fallback || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (hex.length !== expectedBytes * 2) throw new Error(`${name} must be exactly ${expectedBytes} bytes of hex.`);
  return hex;
}
function buildMt20WrappedCommand(asciiCommand) {
  const optionalEnv = Deno.env.toObject();
  const sMarkHex = '0D0A2A4B5700';
  const packetLenHex = '4400';
  const cmdHex = '0200';
  const nGisIpHex = normalizeFixedHex(optionalEnv.MT20_GIS_IP_HEX, '741E649C', 4, 'MT20_GIS_IP_HEX');
  const nPortHex = normalizeFixedHex(optionalEnv.MT20_APP_PORT_HEX, '5B9A', 2, 'MT20_APP_PORT_HEX');
  const sEndHex = '0D0A';
  const sDataBytes = new TextEncoder().encode(asciiCommand);
  const paddedSData = new Uint8Array(50);
  paddedSData.set(sDataBytes);
  const sDataHex = bytesToHex(paddedSData);
  return { ascii: asciiCommand, hex: `${sMarkHex}${packetLenHex}${cmdHex}${nGisIpHex}${nPortHex}${sDataHex}${sEndHex}`, sDataHex };
}
function buildAlarmPulse(deviceId) {
  const now = new Date();
  const hhmmss = [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()].map(n => String(n).padStart(2, '0')).join('');
  const ascii = `*KW,${sanitizeIdentifier(deviceId)},007,${hhmmss},${ALARM_ASCII_ACTION}#`;
  return buildMt20WrappedCommand(ascii);
}
function joinUrl(baseUrl, path) { return `${baseUrl.replace(/\/+$/, '')}${path}`; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function isReturnState(vehicle) { return ['Dropoff Submitted', 'Return Pending Host Review', 'Retired'].includes(vehicle?.status); }

async function resolveContext(base44, body) {
  let vehicle = null;
  let device = null;
  if (body.vehicle_id) vehicle = (await base44.asServiceRole.entities.Vehicle.filter({ id: body.vehicle_id }))[0] || null;
  if (body.telematics_device_id) device = (await base44.asServiceRole.entities.TelematicsDevice.filter({ id: body.telematics_device_id }))[0] || null;
  if (!device && vehicle) device = (await base44.asServiceRole.entities.TelematicsDevice.filter({ vehicle_id: vehicle.id }))[0] || null;
  if (!vehicle && device?.vehicle_id) vehicle = (await base44.asServiceRole.entities.Vehicle.filter({ id: device.vehicle_id }))[0] || null;
  if (!vehicle) throw new Error('Vehicle not found.');
  if (!device) throw new Error('No telematics device is assigned to this vehicle.');
  const provider = (await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: device.provider_key }))[0] || {};
  return { vehicle, device, provider };
}
async function assertPermission(base44, user, vehicle) {
  if (user.role === 'admin') return;
  if (user.role !== 'host') throw new Error('Only admins and hosts can trigger alarm mode.');
  const host = vehicle.host_id ? (await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id }))[0] : null;
  if (!host || (host.email !== user.email && host.user_id !== user.id)) throw new Error('Host can only trigger alarm for owned vehicles.');
}
async function sendPulse(base44, { session, vehicle, device, provider, pulseNumber }) {
  const now = new Date().toISOString();
  const built = buildAlarmPulse(device.unique_id || device.device_imei || device.traccar_device_id);
  let response = { dry_run: true };
  let status = 'sent';
  let failureReason = '';
  try {
    if (provider.provider_key === 'traccar_noran_mt20' && provider.execution_mode === 'production' && provider.allow_live_commands === true && device.traccar_device_id) {
      const baseUrl = String(Deno.env.get('TRACCAR_BASE_URL') || '');
      const username = String(Deno.env.get('TRACCAR_USERNAME') || '');
      const password = String(Deno.env.get('TRACCAR_PASSWORD') || '');
      if (!baseUrl || !username || !password) throw new Error('Traccar credentials are not configured.');
      const traccarPayload = { deviceId: Number(device.traccar_device_id), type: 'custom', attributes: { data: built.hex } };
      const res = await fetch(joinUrl(baseUrl, '/api/commands/send'), {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(traccarPayload)
      });
      const text = await res.text();
      try { response = JSON.parse(text); } catch { response = { raw: text }; }
      response.traccar_payload = traccarPayload;
      if (!res.ok) throw new Error(`Traccar alarm pulse failed (${res.status})`);
    }
  } catch (error) {
    status = 'failed';
    failureReason = error.message;
    response = { error: error.message };
  }
  const command = await base44.asServiceRole.entities.TelematicsCommand.create({
    company_id: vehicle.company_id || device.company_id || '',
    telematics_device_id: device.id,
    provider_key: device.provider_key,
    vehicle_id: vehicle.id,
    host_id: vehicle.host_id || device.host_id || '',
    command_type: 'alarm_pulse',
    alarm_session_id: session.id,
    pulse_number: pulseNumber,
    device_unique_id: device.unique_id || '',
    traccar_device_id: device.traccar_device_id || '',
    ascii_payload: built.ascii,
    hex_payload: built.hex,
    status,
    queue_status: status,
    confirmation_status: status === 'sent' ? 'sent' : 'failed',
    idempotency_key: `alarm:${session.id}:${pulseNumber}`,
    requested_by: session.started_by,
    requested_role: session.started_role,
    created_at: now,
    sent_at: now,
    failed_at: status === 'failed' ? now : '',
    failure_reason: failureReason,
    provider_response: response,
    request_payload: { alarm_session_id: session.id, pulse_number: pulseNumber, software_alarm_mode: true }
  });
  await base44.asServiceRole.entities.TelematicsEvent.create({
    company_id: vehicle.company_id || device.company_id || '',
    telematics_device_id: device.id,
    provider_key: device.provider_key,
    vehicle_id: vehicle.id,
    event_type: status === 'sent' ? 'alarm_pulse_sent' : 'alarm_pulse_failed',
    source: 'command',
    raw_payload: { alarm_session_id: session.id, pulse_number: pulseNumber, command_id: command.id, response },
    created_at: now
  });
  await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, { pulses_sent: pulseNumber, last_command_id: command.id });
  if (status === 'failed') throw new Error(failureReason || 'Alarm pulse failed.');
  return command;
}
async function runAlarmCycle(base44, sessionId) {
  const initialSession = (await base44.asServiceRole.entities.TelematicsAlarmSession.filter({ id: sessionId }))[0];
  const startPulse = Number(initialSession?.pulses_sent || 0) + 1;
  for (let pulse = startPulse; pulse <= DEFAULT_MAX_PULSES; pulse += 1) {
    const session = (await base44.asServiceRole.entities.TelematicsAlarmSession.filter({ id: sessionId }))[0];
    if (!session || session.status !== 'active') return;
    const device = (await base44.asServiceRole.entities.TelematicsDevice.filter({ id: session.telematics_device_id }))[0];
    const vehicle = (await base44.asServiceRole.entities.Vehicle.filter({ id: session.vehicle_id }))[0];
    const provider = (await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: session.provider_key }))[0] || {};
    if (!device || device.online_status === 'offline') {
      await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, { status: 'failed', ended_at: new Date().toISOString(), cancel_reason: 'device_offline' });
      return;
    }
    if (isReturnState(vehicle)) {
      await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, { status: 'cancelled', ended_at: new Date().toISOString(), cancel_reason: 'vehicle_returned' });
      return;
    }
    try {
      await sendPulse(base44, { session, vehicle, device, provider, pulseNumber: pulse });
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
    const { vehicle, device, provider } = await resolveContext(base44, body);
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
      await sendPulse(base44, { session, vehicle, device, provider, pulseNumber: 1 });
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
    return Response.json({ error: error.message }, { status: 500 });
  }
});