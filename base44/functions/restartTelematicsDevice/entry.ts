import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Sends MT20 restart command via Traccar API (POST /api/commands/send).
// Uses full 68-byte MT20-wrapped packet — same format as production commands.
// Admin-only. Does not send UDP directly. Traccar manages the UDP session.
//
// Correct MT20 restart command per protocol spec:
//   *KW,<DEVICE_ID>,099,HHMMSS,RESETSYSTEM#

// ── MT20 wrapper constants ──
const MT20_S_MARK_HEX  = '0D0A2A4B5700';
const MT20_PKT_LEN_HEX = '4400';
const MT20_CMD_HEX     = '0200';
const MT20_GIS_IP_HEX  = '741E649C';
const MT20_PORT_HEX    = '5B9A';
const MT20_S_END_HEX   = '0D0A';
const MT20_SDATA_BYTES = 50;
const MT20_TOTAL_BYTES = 68;

function sanitizeDeviceId(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_:-]/g, '').slice(0, 80);
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function asciiToHexRaw(input = '') {
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

// Build the correct MT20 restart ASCII payload
function buildRestartAscii(uniqueId) {
  const hhmmss = currentHhmmss();
  const cleanId = sanitizeDeviceId(uniqueId);
  // Correct format per MT20 spec: code 099 with RESETSYSTEM parameter
  return `*KW,${cleanId},099,${hhmmss},RESETSYSTEM#`;
}

// Wrap ASCII into full 68-byte MT20 control packet
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

async function traccarFetch(path, options = {}) {
  const baseUrl  = String(Deno.env.get('TRACCAR_BASE_URL') || '').trim();
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
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`Traccar API failed (${response.status}): ${text}`);
  return data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json();
    const dryRun = body.dry_run === true;
    const uniqueId = sanitizeDeviceId(body.unique_id || body.device_id);
    if (!uniqueId) return Response.json({ error: 'unique_id is required' }, { status: 400 });

    // Look up device in Traccar
    const devices = await traccarFetch('/api/devices', { method: 'GET' });
    const list = Array.isArray(devices) ? devices : [];
    const traccarDevice = list.find((d) => String(d.uniqueId || '').toUpperCase() === uniqueId)
      || list.find((d) => String(d.name || '').toUpperCase().includes(uniqueId));
    if (!traccarDevice) return Response.json({ error: `Device ${uniqueId} not found in Traccar` }, { status: 404 });

    const traccarDeviceId = Number(traccarDevice.id);
    if (!Number.isFinite(traccarDeviceId)) return Response.json({ error: 'Invalid Traccar numeric device ID.' }, { status: 400 });

    // Build correct MT20 restart command
    const ascii = buildRestartAscii(uniqueId);
    const built = buildMt20WrappedCommand(ascii);

    const traccarPayload = { deviceId: traccarDeviceId, type: 'custom', attributes: { data: built.fullHex } };

    // Dry-run: return command preview without sending
    if (dryRun) {
      return Response.json({
        ok: true,
        dry_run: true,
        unique_id: uniqueId,
        traccar_device_id: String(traccarDevice.id),
        ascii_command: built.asciiCommand,
        hex_command: built.fullHex,
        mt20_total_bytes: built.totalBytes,
        format: 'mt20_wrapped_68byte',
        traccar_payload: traccarPayload,
        note: 'Dry-run only. No command was sent. Confirm ASCII payload before running live.'
      });
    }

    // Send via Traccar API — Traccar manages the UDP session
    const result = await traccarFetch('/api/commands/send', { method: 'POST', body: JSON.stringify(traccarPayload) });

    // Log in Base44
    const localDevices = await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: uniqueId });
    const localDevice = localDevices[0];
    const now = new Date().toISOString();

    if (localDevice) {
      const traccarCommandId = result?.id || result?.commandId || null;
      await base44.asServiceRole.entities.TelematicsCommand.create({
        telematics_device_id: localDevice.id,
        provider_key: 'traccar_noran_mt20',
        vehicle_id: localDevice.vehicle_id || '',
        host_id: localDevice.host_id || '',
        command_type: 'restart',
        provider_command_name: 'custom',
        ascii_payload: built.asciiCommand,
        hex_payload: built.fullHex,
        transmission_format: 'mt20_wrapped_hex',
        request_payload: { traccar_device_id: String(traccarDevice.id), restart: true, format: 'mt20_wrapped_68byte' },
        status: 'sent_to_traccar',
        queue_status: 'sent_to_traccar',
        confirmation_status: 'sent',
        confirmation_required: false,
        provider_response: result || {},
        traccar_command_id: traccarCommandId ? String(traccarCommandId) : null,
        provider_command_id: traccarCommandId ? String(traccarCommandId) : null,
        traccar_api_response: result || {},
        traccar_api_called_at: now,
        sent_to_traccar_at: now,
        command_released_at: now,
        source_function: 'restartTelematicsDevice',
        payload_length_bytes: built.totalBytes,
        requested_by: user.email,
        requested_role: user.role || 'admin',
        failure_reason: '',
        created_at: now,
        sent_at: now
      });
    }

    return Response.json({
      ok: true,
      dry_run: false,
      unique_id: uniqueId,
      traccar_device_id: String(traccarDevice.id),
      ascii_command: built.asciiCommand,
      hex_command: built.fullHex,
      mt20_total_bytes: built.totalBytes,
      format: 'mt20_wrapped_68byte',
      traccar_response: result,
      note: 'Restart command (MT20 code 099, RESETSYSTEM) sent. Device should reboot within 10-30 seconds.'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});