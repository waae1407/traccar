import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const COMMAND_SEQUENCE = [
  { command_type: 'locate', action: null },
  { command_type: 'status', action: null },
  { command_type: 'lock', action: '3,1' },
  { command_type: 'unlock', action: '4,1' },
  { command_type: 'horn_lights', action: '2,3' },
  { command_type: 'disable_starter', action: '1,1' },
  { command_type: 'restore_starter', action: '1,0' }
];

function cleanDeviceId(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_:-]/g, '').slice(0, 80);
}

function asciiToHex(input = '') {
  return Array.from(input).map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function currentHhmmss() {
  const now = new Date();
  return [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()].map((n) => String(n).padStart(2, '0')).join('');
}

function buildCommand(uniqueId, action) {
  const hhmmss = currentHhmmss();
  const ascii = action ? `*KW,${uniqueId},007,${hhmmss},${action}#` : `*KW,${uniqueId},000,${hhmmss}#`;
  return { ascii, hex: asciiToHex(ascii) };
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function traccarFetch(path, options = {}) {
  const baseUrl = String(Deno.env.get('TRACCAR_BASE_URL') || '').trim();
  const username = String(Deno.env.get('TRACCAR_USERNAME') || '').trim();
  const password = String(Deno.env.get('TRACCAR_PASSWORD') || '').trim();
  if (!baseUrl || !username || !password) throw new Error('Traccar credentials are not configured.');

  const response = await fetch(joinUrl(baseUrl, path), {
    ...options,
    headers: {
      Authorization: 'Basic ' + btoa(`${username}:${password}`),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = parseJson(text);
  if (!response.ok) throw new Error(`Traccar API failed (${response.status}): ${text || response.statusText}`);
  return data;
}

async function findTraccarDevice(uniqueId) {
  const devices = await traccarFetch('/api/devices', { method: 'GET' });
  const list = Array.isArray(devices) ? devices : [];
  return list.find((device) => String(device.uniqueId || '').toUpperCase() === uniqueId)
    || list.find((device) => String(device.name || '').toUpperCase() === uniqueId)
    || null;
}

async function upsertLocalDevice(base44, uniqueId, traccarDevice) {
  const existing = await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: uniqueId });
  const payload = {
    provider_key: 'traccar_noran_mt20',
    provider_type: 'traccar',
    unique_id: uniqueId,
    provider_device_id: String(traccarDevice.id),
    traccar_device_id: String(traccarDevice.id),
    model: 'Noran MT20',
    lifecycle_status: 'live_ready',
    assigned_status: existing[0]?.assigned_status || 'unassigned',
    install_status: existing[0]?.install_status || 'not_started',
    online_status: traccarDevice.status === 'online' ? 'online' : traccarDevice.status === 'offline' ? 'offline' : 'unknown',
    gps_enabled: true,
    lock_unlock_enabled: true,
    horn_light_enabled: true,
    created_at: existing[0]?.created_at || new Date().toISOString()
  };
  if (existing[0]) return await base44.asServiceRole.entities.TelematicsDevice.update(existing[0].id, payload);
  return await base44.asServiceRole.entities.TelematicsDevice.create(payload);
}

async function recordCommand(base44, user, localDevice, command, built, result, status, failureReason = '') {
  const now = new Date().toISOString();
  const commandRecord = await base44.asServiceRole.entities.TelematicsCommand.create({
    telematics_device_id: localDevice.id,
    provider_key: 'traccar_noran_mt20',
    vehicle_id: localDevice.vehicle_id || '',
    host_id: localDevice.host_id || '',
    command_type: command.command_type,
    provider_command_name: 'custom',
    ascii_payload: built.ascii,
    hex_payload: built.hex,
    request_payload: { traccar_device_id: localDevice.traccar_device_id, suite_run: true },
    status,
    queue_status: status,
    confirmation_status: status === 'sent' ? 'sent' : 'failed',
    confirmation_required: ['disable_starter', 'restore_starter'].includes(command.command_type),
    provider_response: result || {},
    requested_by: user.email,
    requested_role: user.role || 'admin',
    failure_reason: failureReason,
    created_at: now,
    sent_at: now,
    failed_at: status === 'failed' ? now : ''
  });
  await base44.asServiceRole.entities.TelematicsEvent.create({
    telematics_device_id: localDevice.id,
    provider_key: 'traccar_noran_mt20',
    vehicle_id: localDevice.vehicle_id || '',
    event_type: `command_${command.command_type}_${status}`,
    source: 'command',
    raw_payload: { suite_run: true, command_id: commandRecord.id, response: result || {}, failure_reason: failureReason },
    created_at: now
  });
  return commandRecord;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json();
    const uniqueId = cleanDeviceId(body.device_id || body.unique_id);
    if (!uniqueId) return Response.json({ error: 'device_id is required' }, { status: 400 });

    const traccarDevice = await findTraccarDevice(uniqueId);
    if (!traccarDevice?.id) return Response.json({ error: `Device ${uniqueId} was not found in Traccar.` }, { status: 404 });

    const localDevice = await upsertLocalDevice(base44, uniqueId, traccarDevice);
    const results = [];

    for (const command of COMMAND_SEQUENCE) {
      const built = buildCommand(uniqueId, command.action);
      try {
        const result = await traccarFetch('/api/commands/send', {
          method: 'POST',
          body: JSON.stringify({ deviceId: Number(traccarDevice.id), type: 'custom', attributes: { data: built.hex } })
        });
        await recordCommand(base44, user, localDevice, command, built, result, 'sent');
        results.push({ command_type: command.command_type, status: 'sent', ascii_payload: built.ascii, hex_payload: built.hex, result });
      } catch (error) {
        await recordCommand(base44, user, localDevice, command, built, null, 'failed', error.message);
        results.push({ command_type: command.command_type, status: 'failed', ascii_payload: built.ascii, hex_payload: built.hex, error: error.message });
      }
    }

    return Response.json({ ok: true, device_id: uniqueId, traccar_device_id: String(traccarDevice.id), commands: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});