import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Diagnostic test suite — sends the full MT20-wrapped 68-byte command format
// to validate that Traccar correctly routes commands to the device via UDP.
// Admin-only. Uses same command builder as production sendTelematicsCommand.

const COMMAND_SEQUENCE = [
  { command_type: 'locate',          ascii_suffix: null,       action_code: '000', action_args: null },
  { command_type: 'status',          ascii_suffix: null,       action_code: '000', action_args: null },
  { command_type: 'lock',            ascii_suffix: '3,1',      action_code: '007', action_args: '3,1' },
  { command_type: 'unlock',          ascii_suffix: '4,1',      action_code: '007', action_args: '4,1' },
  { command_type: 'horn_lights',     ascii_suffix: '2,3',      action_code: '007', action_args: '2,3' },
  { command_type: 'disable_starter', ascii_suffix: '1,1',      action_code: '007', action_args: '1,1' },
  { command_type: 'restore_starter', ascii_suffix: '1,0',      action_code: '007', action_args: '1,0' }
];

// ── MT20 wrapper constants (identical to sendTelematicsCommand production path) ──
const MT20_S_MARK_HEX   = '0D0A2A4B5700';
const MT20_PKT_LEN_HEX  = '4400';
const MT20_CMD_HEX      = '0200';
const MT20_GIS_IP_HEX   = '741E649C'; // default — matches sendTelematicsCommand
const MT20_PORT_HEX     = '5B9A';
const MT20_S_END_HEX    = '0D0A';
const MT20_SDATA_BYTES  = 50;
const MT20_TOTAL_BYTES  = 68;

function sanitizeDeviceId(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_:-]/g, '').slice(0, 80);
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function asciiToHex(input = '') {
  return bytesToHex(new TextEncoder().encode(input));
}

function normalizeFixedHex(value, fallback, expectedBytes, name) {
  const hex = String(value || fallback || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (hex.length !== expectedBytes * 2) throw new Error(`${name} must be exactly ${expectedBytes} bytes.`);
  return hex;
}

function currentHhmmss() {
  const now = new Date();
  return [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()]
    .map((n) => String(n).padStart(2, '0')).join('');
}

// Build ASCII payload per MT20 protocol spec
function buildAsciiPayload(uniqueId, actionCode, actionArgs) {
  const hhmmss = currentHhmmss();
  const cleanId = sanitizeDeviceId(uniqueId);
  return actionArgs
    ? `*KW,${cleanId},${actionCode},${hhmmss},${actionArgs}#`
    : `*KW,${cleanId},${actionCode},${hhmmss}#`;
}

// Wrap ASCII into full 68-byte MT20 control packet (identical to sendTelematicsCommand)
function buildMt20WrappedCommand(asciiCommand) {
  const envObj = Deno.env.toObject();
  const gisIpHex = normalizeFixedHex(envObj.MT20_GIS_IP_HEX, MT20_GIS_IP_HEX, 4, 'MT20_GIS_IP_HEX');
  const portHex  = normalizeFixedHex(envObj.MT20_APP_PORT_HEX, MT20_PORT_HEX, 2, 'MT20_APP_PORT_HEX');
  const sDataBytes = new TextEncoder().encode(asciiCommand);
  if (sDataBytes.length > MT20_SDATA_BYTES) throw new Error(`MT20 ASCII command exceeds ${MT20_SDATA_BYTES} bytes: ${asciiCommand}`);
  const paddedSData = new Uint8Array(MT20_SDATA_BYTES);
  paddedSData.set(sDataBytes);
  const sDataHex = bytesToHex(paddedSData);
  const fullHex = `${MT20_S_MARK_HEX}${MT20_PKT_LEN_HEX}${MT20_CMD_HEX}${gisIpHex}${portHex}${sDataHex}${MT20_S_END_HEX}`;
  const totalBytes = fullHex.length / 2;
  if (totalBytes !== MT20_TOTAL_BYTES) throw new Error(`MT20 packet must be ${MT20_TOTAL_BYTES} bytes, got ${totalBytes}.`);
  if (!fullHex.startsWith(MT20_S_MARK_HEX)) throw new Error('MT20 packet has invalid sMark.');
  if (!fullHex.endsWith(MT20_S_END_HEX)) throw new Error('MT20 packet has invalid sEnd.');
  return { asciiCommand, sDataHex, fullHex, totalBytes };
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

// ── HEARTBEAT FRESHNESS GATE ──
const MAX_HEARTBEAT_AGE_MS = 10000;
const HEARTBEAT_POLL_INTERVAL_MS = 500;
const HEARTBEAT_POLL_TIMEOUT_MS = 30000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ensureFreshHeartbeat(base44, uniqueId) {
  const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: uniqueId });
  const device = devices[0];
  if (!device) return { fresh: false, reason: 'device_not_found', age_ms: null };

  const lastHb = new Date(device.last_heartbeat_received_at || 0).getTime();
  const ageMs = Date.now() - lastHb;

  if (ageMs <= MAX_HEARTBEAT_AGE_MS) {
    return { fresh: true, age_ms: ageMs, waited: false };
  }

  const startTime = Date.now();
  while (Date.now() - startTime < HEARTBEAT_POLL_TIMEOUT_MS) {
    await sleep(HEARTBEAT_POLL_INTERVAL_MS);
    const refreshed = (await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: uniqueId }))[0];
    if (!refreshed) return { fresh: false, reason: 'device_not_found', age_ms: null, waited: true, wait_ms: Date.now() - startTime };
    const newHb = new Date(refreshed.last_heartbeat_received_at || 0).getTime();
    if (newHb > lastHb) {
      return { fresh: true, age_ms: Date.now() - newHb, waited: true, wait_ms: Date.now() - startTime };
    }
  }

  return { fresh: false, age_ms: ageMs, waited: true, wait_ms: HEARTBEAT_POLL_TIMEOUT_MS, reason: 'timeout_no_heartbeat' };
}

async function traccarFetch(path, options = {}) {
  const baseUrl   = String(Deno.env.get('TRACCAR_BASE_URL') || '').trim();
  const username  = String(Deno.env.get('TRACCAR_USERNAME') || '').trim();
  const password  = String(Deno.env.get('TRACCAR_PASSWORD') || '').trim();
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
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`Traccar API failed (${response.status}): ${text || response.statusText}`);
  return data;
}

async function findTraccarDevice(uniqueId) {
  const devices = await traccarFetch('/api/devices', { method: 'GET' });
  const list = Array.isArray(devices) ? devices : [];
  return list.find((d) => String(d.uniqueId || '').toUpperCase() === uniqueId)
    || list.find((d) => String(d.name || '').toUpperCase() === uniqueId)
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

async function recordCommand(base44, user, localDevice, commandType, built, traccarDeviceId, result, status, failureReason = '') {
  const now = new Date().toISOString();
  const traccarCommandId = result?.id || result?.commandId || null;
  const commandRecord = await base44.asServiceRole.entities.TelematicsCommand.create({
    telematics_device_id: localDevice.id,
    provider_key: 'traccar_noran_mt20',
    vehicle_id: localDevice.vehicle_id || '',
    host_id: localDevice.host_id || '',
    command_type: commandType,
    provider_command_name: 'custom',
    ascii_payload: built.asciiCommand,
    hex_payload: built.fullHex,
    transmission_format: 'mt20_wrapped_hex',
    request_payload: { traccar_device_id: traccarDeviceId, suite_run: true, format: 'mt20_wrapped_68byte' },
    status: status === 'sent' ? 'sent_to_traccar' : status,
    queue_status: status === 'sent' ? 'sent_to_traccar' : status,
    confirmation_status: status === 'sent' ? 'sent' : 'failed',
    confirmation_required: ['disable_starter', 'restore_starter'].includes(commandType),
    provider_response: result || {},
    traccar_command_id: traccarCommandId ? String(traccarCommandId) : null,
    provider_command_id: traccarCommandId ? String(traccarCommandId) : null,
    traccar_api_response: result || {},
    traccar_api_called_at: now,
    sent_to_traccar_at: now,
    command_released_at: now,
    source_function: 'sendTraccarCommandSuite',
    payload_length_bytes: built.totalBytes,
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
    event_type: `command_${commandType}_${status}`,
    source: 'command',
    raw_payload: {
      suite_run: true,
      command_id: commandRecord.id,
      ascii_payload: built.asciiCommand,
      hex_payload: built.fullHex,
      mt20_total_bytes: built.totalBytes,
      format: 'mt20_wrapped_68byte',
      response: result || {},
      failure_reason: failureReason
    },
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
    const dryRun = body.dry_run === true;
    const uniqueId = sanitizeDeviceId(body.device_id || body.unique_id);
    if (!uniqueId) return Response.json({ error: 'device_id is required' }, { status: 400 });

    const traccarDevice = await findTraccarDevice(uniqueId);
    if (!traccarDevice?.id) return Response.json({ error: `Device ${uniqueId} was not found in Traccar.` }, { status: 404 });

    console.log(`[sendTraccarCommandSuite] DEVICE FOUND | unique_id=${uniqueId} | traccar_id=${traccarDevice.id} | status=${traccarDevice.status} | lastUpdate=${traccarDevice.lastUpdate} | positionId=${traccarDevice.positionId}`);

    const localDevice = await upsertLocalDevice(base44, uniqueId, traccarDevice);
    const traccarDeviceId = Number(traccarDevice.id);
    if (!Number.isFinite(traccarDeviceId)) return Response.json({ error: 'Invalid Traccar numeric device ID.' }, { status: 400 });

    console.log(`[sendTraccarCommandSuite] STARTING SUITE | dry_run=${dryRun} | traccar_device_id=${traccarDeviceId} | base44_device_id=${localDevice.id} | commands=${COMMAND_SEQUENCE.map(c => c.command_type).join(',')}`);


    // ── Heartbeat freshness check before sending suite ──
    if (!dryRun) {
      const freshness = await ensureFreshHeartbeat(base44, uniqueId);
      console.log(`[SUITE_HEARTBEAT_FRESHNESS] device=${uniqueId} fresh=${freshness.fresh} age_ms=${freshness.age_ms} waited=${freshness.waited} wait_ms=${freshness.wait_ms || 0}`);

      if (!freshness.fresh) {
        return Response.json({
          error: 'Device heartbeat stale — UDP session expired. Command suite not sent.',
          unique_id: uniqueId,
          heartbeat_age_seconds: Math.round((freshness.age_ms || 0) / 1000),
          max_age_seconds: MAX_HEARTBEAT_AGE_MS / 1000,
          waited_seconds: Math.round((freshness.wait_ms || 0) / 1000),
          suggestion: 'Try again — system will wait for next heartbeat automatically.'
        }, { status: 503 });
      }
    }

    const results = [];

    for (const cmd of COMMAND_SEQUENCE) {
      const ascii = buildAsciiPayload(uniqueId, cmd.action_code, cmd.action_args);
      let built;
      try {
        built = buildMt20WrappedCommand(ascii);
      } catch (buildError) {
        results.push({ command_type: cmd.command_type, status: 'build_failed', ascii_payload: ascii, error: buildError.message });
        continue;
      }

      const traccarPayload = { deviceId: traccarDeviceId, type: 'custom', attributes: { data: built.fullHex } };

      if (dryRun) {
        results.push({
          command_type: cmd.command_type,
          status: 'dry_run',
          ascii_payload: built.asciiCommand,
          hex_payload: built.fullHex,
          mt20_total_bytes: built.totalBytes,
          traccar_payload: traccarPayload,
          format: 'mt20_wrapped_68byte'
        });
        continue;
      }

      const submitTimestamp = new Date().toISOString();
      console.log(`[sendTraccarCommandSuite] SUBMIT ${cmd.command_type} | traccar_device_id=${traccarDeviceId} | ascii="${built.asciiCommand}" | hex_bytes=${built.totalBytes} | payload=${JSON.stringify(traccarPayload)}`);

      try {
        const result = await traccarFetch('/api/commands/send', { method: 'POST', body: JSON.stringify(traccarPayload) });
        const receiveTimestamp = new Date().toISOString();
        console.log(`[sendTraccarCommandSuite] ACCEPTED ${cmd.command_type} | traccar_device_id=${traccarDeviceId} | traccar_response=${JSON.stringify(result)} | submit_at=${submitTimestamp} | receive_at=${receiveTimestamp}`);

        // Immediately query Traccar command queue to confirm it was created
        let queuedCommand = null;
        try {
          const queuedList = await traccarFetch(`/api/commands?deviceId=${traccarDeviceId}`, { method: 'GET' });
          queuedCommand = Array.isArray(queuedList) ? queuedList : [];
          console.log(`[sendTraccarCommandSuite] QUEUE CHECK ${cmd.command_type} | device=${traccarDeviceId} | queued_count=${queuedCommand.length} | queued=${JSON.stringify(queuedCommand)}`);
        } catch (queueErr) {
          console.warn(`[sendTraccarCommandSuite] QUEUE CHECK FAILED ${cmd.command_type} | ${queueErr.message}`);
        }

        await recordCommand(base44, user, localDevice, cmd.command_type, built, String(traccarDevice.id), result, 'sent');
        results.push({
          command_type: cmd.command_type,
          status: 'sent',
          ascii_payload: built.asciiCommand,
          hex_payload: built.fullHex,
          mt20_total_bytes: built.totalBytes,
          traccar_device_id: traccarDeviceId,
          submit_timestamp: submitTimestamp,
          receive_timestamp: receiveTimestamp,
          traccar_response: result,
          traccar_queue_after_send: queuedCommand
        });
      } catch (error) {
        const failTimestamp = new Date().toISOString();
        console.error(`[sendTraccarCommandSuite] REJECTED ${cmd.command_type} | traccar_device_id=${traccarDeviceId} | error=${error.message} | payload=${JSON.stringify(traccarPayload)} | at=${failTimestamp}`);
        await recordCommand(base44, user, localDevice, cmd.command_type, built, String(traccarDevice.id), null, 'failed', error.message);
        results.push({
          command_type: cmd.command_type,
          status: 'failed',
          ascii_payload: built.asciiCommand,
          hex_payload: built.fullHex,
          traccar_device_id: traccarDeviceId,
          traccar_payload_submitted: traccarPayload,
          submit_timestamp: submitTimestamp,
          error: error.message
        });
      }
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      device_id: uniqueId,
      traccar_device_id: String(traccarDevice.id),
      format: 'mt20_wrapped_68byte',
      commands: results
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});