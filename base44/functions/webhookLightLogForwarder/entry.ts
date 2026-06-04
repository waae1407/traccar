import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PROVIDER_KEY = 'traccar_noran_mt20';
const MIN_VOLTAGE = 5;
const MAX_VOLTAGE = 30;
const COMMAND_REPLY_WINDOW_MINUTES = 10;
const COMMAND_RESULT_FIELDS = {
  locate: 'locate_result',
  status: 'status_result',
  lock: 'lock_result',
  unlock: 'unlock_result',
  horn: 'horn_result',
  lights: 'lights_result',
  horn_lights: 'horn_lights_result',
  alarm_pulse: 'alarm_pulse_result',
  disable_starter: 'starter_disable_result',
  restore_starter: 'starter_restore_result'
};
const IGNORED_PACKET_TYPES = new Set([0x0000]);
const MEANINGFUL_PACKET_TYPES = new Map([
  [0x0003, 'mt20_alarm_upload'],
  [0x0008, 'mt20_position_upload'],
  [0x0032, 'mt20_new_position_upload'],
  [0x0038, 'mt20_query_response'],
  [0x8009, 'mt20_command_response']
]);

function getSecret(req, body) {
  return String(req.headers.get('x-webhook-secret') || req.headers.get('x-telematics-secret') || body.webhook_secret || '').trim();
}

function createWebhookClient(req) {
  const headers = new Headers(req.headers);
  headers.delete('authorization');
  headers.delete('cookie');
  return createClientFromRequest(new Request(req.url, { method: req.method, headers }));
}

function rawHexFromBody(body) {
  const value = body.raw_packet_hex || body.packet_hex || body.raw_hex || body.raw_log_line || body.traccar_raw_log || body.message || body.data || '';
  const text = String(value || '').trim();
  if (!text) return '';

  const exactHex = text.replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '');
  if (/^(?:0x)?[a-fA-F0-9]+$/.test(text) && exactHex.length >= 12) return text;

  const hexTokens = text.match(/[a-fA-F0-9]{12,}/g) || [];
  return hexTokens.length ? hexTokens[hexTokens.length - 1] : text;
}

function cleanHex(value) {
  return String(value || '').replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}

function hexToBytes(value) {
  const hex = cleanHex(value);
  if (hex.length < 12 || hex.length % 2 !== 0) return null;
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return bytes;
}

function readUInt16LE(bytes, offset) {
  if (!bytes || offset + 1 >= bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32LE(bytes, offset) {
  if (!bytes || offset + 3 >= bytes.length) return null;
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readTrailingSignedByte(bytes) {
  let offset = bytes.length - 1;
  while (offset >= 0 && [0x00, 0x0d, 0x0a].includes(bytes[offset])) offset--;
  if (offset < 0) return null;
  return bytes[offset] > 127 ? bytes[offset] - 256 : bytes[offset];
}

function decodeStatusBits(byteValue = 0) {
  const hasBit = (bit) => ((byteValue >> bit) & 1) === 1;
  return {
    gpsLocated: hasBit(0),
    smokeDetected: hasBit(1),
    unlocked: hasBit(2),
    bluetoothOn: hasBit(3),
    doorOpen: hasBit(4),
    trunkOpen: hasBit(5),
    accOn: hasBit(6),
    starterKilled: hasBit(7)
  };
}

function asciiFromBytes(bytes) {
  return bytes
    .filter((byte) => byte >= 32 && byte <= 126)
    .map((byte) => String.fromCharCode(byte))
    .join('')
    .replace(/[\u0000\r\n]/g, '')
    .trim();
}

function extractDeviceId(bytes, body) {
  const explicit = String(body.device_unique_id || body.unique_id || body.device_id || body.imei || '').trim();
  if (explicit) return explicit;
  const ascii = asciiFromBytes(bytes);
  const match = ascii.match(/[A-Z]{2}\d{2}[A-Z0-9]{4,}/i);
  return match ? match[0] : '';
}

function formatPacketType(packetType) {
  return `0x${packetType.toString(16).padStart(4, '0')}`;
}

function parseMt20Voltage0032(body) {
  const rawHex = rawHexFromBody(body);
  const bytes = hexToBytes(rawHex);
  if (!bytes) return null;

  for (let i = 0; i < bytes.length - 6; i++) {
    const packetType = readUInt16LE(bytes, i + 2);
    if (packetType !== 0x0032) continue;

    const nbat = bytes[i + 5];
    const voltage = nbat / 10;
    if (!Number.isFinite(voltage) || voltage < MIN_VOLTAGE || voltage > MAX_VOLTAGE) return null;

    return {
      message_type: 'mt20_voltage_0032',
      event_type: 'mt20_voltage_forwarded_log',
      source: 'forwarded_log_mt20_0032_nBAT',
      raw_packet_hex: cleanHex(rawHex),
      packet_type: '0x0032',
      nBAT: nbat,
      voltage,
      device_unique_id: extractDeviceId(bytes, body) || asciiFromBytes(bytes.slice(i + 20, Math.min(bytes.length, i + 40))) || '',
      device_updates: {
        battery_voltage: voltage,
        power_voltage: voltage,
        external_voltage: voltage,
        voltage,
        voltage_source: 'forwarded_log_mt20_0032_nBAT',
        online_status: 'online'
      }
    };
  }

  return null;
}

function parseMt20CommandResponse8009(body) {
  const rawHex = rawHexFromBody(body);
  const bytes = hexToBytes(rawHex);
  if (!bytes) return null;

  for (let i = 0; i < bytes.length - 12; i++) {
    const packetType = readUInt16LE(bytes, i + 2);
    if (packetType !== 0x8009) continue;

    const bEnable = bytes[i + 10];
    const status_bits = decodeStatusBits(bEnable);
    const cErrorCode = readTrailingSignedByte(bytes.slice(i));
    const lockState = status_bits.unlocked ? 'unlocked' : 'locked';
    const starterState = status_bits.starterKilled ? 'disabled' : 'restored';

    return {
      message_type: 'mt20_command_response_8009',
      event_type: 'mt20_command_response_forwarded_log',
      source: 'forwarded_log_mt20_8009',
      raw_packet_hex: cleanHex(rawHex),
      packet_type: '0x8009',
      packet_offset: i,
      bEnable,
      status_bits,
      lock_state: lockState,
      starter_state: starterState,
      cErrorCode,
      device_unique_id: extractDeviceId(bytes.slice(i), body),
      device_updates: { online_status: 'online' }
    };
  }

  return null;
}

function parseMeaningfulMt20Packet(body) {
  const rawHex = rawHexFromBody(body);
  const bytes = hexToBytes(rawHex);
  if (!bytes) return null;

  for (let i = 0; i < bytes.length - 4; i++) {
    const packetType = readUInt16LE(bytes, i + 2);
    if (packetType === null || IGNORED_PACKET_TYPES.has(packetType)) continue;
    if (!MEANINGFUL_PACKET_TYPES.has(packetType)) continue;
    const packetTypeHex = formatPacketType(packetType);
    return {
      message_type: MEANINGFUL_PACKET_TYPES.get(packetType),
      event_type: `${MEANINGFUL_PACKET_TYPES.get(packetType)}_forwarded_log`,
      source: `forwarded_log_${packetTypeHex}`,
      raw_packet_hex: cleanHex(rawHex),
      packet_type: packetTypeHex,
      packet_offset: i,
      device_unique_id: extractDeviceId(bytes.slice(i), body),
      device_updates: { online_status: 'online' }
    };
  }
  return null;
}

const MESSAGE_HANDLERS = [
  { name: 'mt20_voltage_0032', parse: parseMt20Voltage0032 },
  { name: 'mt20_command_response_8009', parse: parseMt20CommandResponse8009 },
  { name: 'meaningful_mt20_packet', parse: parseMeaningfulMt20Packet }
];

function parseForwardedMessage(body) {
  for (const handler of MESSAGE_HANDLERS) {
    const parsed = handler.parse(body);
    if (parsed) return parsed;
  }
  return null;
}

async function findDevice(base44, body, parsed) {
  const candidates = [
    body.device_unique_id,
    body.unique_id,
    body.device_id,
    body.traccar_device_id,
    body.provider_device_id,
    body.imei,
    parsed.device_unique_id
  ].map((value) => String(value || '').trim()).filter(Boolean);

  const fields = ['unique_id', 'device_imei', 'provider_device_id', 'traccar_device_id', 'moovetrax_device_id'];
  for (const candidate of candidates) {
    for (const field of fields) {
      const matches = await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: PROVIDER_KEY, [field]: candidate });
      if (matches[0]) return matches[0];
    }
  }
  return null;
}

function normalizeTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function evaluateCommandReply(command, parsed) {
  if (parsed.packet_type === '0x0038') {
    return { result: 'pass', reason: 'Device query/status reply received after command.' };
  }
  if (!Number.isFinite(parsed.cErrorCode)) {
    return { result: 'fail', reason: 'Malformed MT20 command response: missing cErrorCode.' };
  }
  if (parsed.cErrorCode <= 0) {
    return { result: 'fail', reason: `Device replied with failure code ${parsed.cErrorCode}.` };
  }
  if (command.command_type === 'lock' && parsed.lock_state !== 'locked') {
    return { result: 'fail', reason: 'Device replied successfully but lock state did not report locked.' };
  }
  if (command.command_type === 'unlock' && parsed.lock_state !== 'unlocked') {
    return { result: 'fail', reason: 'Device replied successfully but lock state did not report unlocked.' };
  }
  if (command.command_type === 'disable_starter' && parsed.starter_state !== 'disabled') {
    return { result: 'fail', reason: 'Device replied successfully but starter state did not report disabled.' };
  }
  if (command.command_type === 'restore_starter' && parsed.starter_state !== 'restored') {
    return { result: 'fail', reason: 'Device replied successfully but starter state did not report restored.' };
  }
  return { result: 'pass', reason: 'Device reply confirmed by forwarded MT20 command response.' };
}

function isReplyCompatibleWithCommand(command, parsed) {
  const commandType = command?.command_type;
  if (parsed?.packet_type === '0x8009') return ['lock', 'unlock', 'horn', 'lights', 'horn_lights', 'alarm_pulse', 'disable_starter', 'restore_starter'].includes(commandType);
  if (['0x0008', '0x0032', '0x0038'].includes(parsed?.packet_type)) return ['locate', 'status'].includes(commandType);
  return false;
}

async function findMatchingCommand(base44, device, timestamp, parsed) {
  if (!device?.id) return null;
  const replyTime = new Date(timestamp).getTime();
  const commands = await base44.asServiceRole.entities.TelematicsCommand.filter({ telematics_device_id: device.id });
  const candidates = commands
    .filter((command) => {
      const status = command.queue_status || command.status;
      if (!['queued', 'sending', 'sent', 'delivered', 'pending'].includes(status)) return false;
      if (command.provider_key !== PROVIDER_KEY) return false;
      if (!isReplyCompatibleWithCommand(command, parsed)) return false;
      const sentTime = new Date(command.sent_at || command.created_at || command.created_date || 0).getTime();
      if (!Number.isFinite(sentTime)) return false;
      const ageMinutes = Math.abs(replyTime - sentTime) / 60000;
      return ageMinutes <= COMMAND_REPLY_WINDOW_MINUTES;
    })
    .sort((a, b) => new Date(b.sent_at || b.created_at || b.created_date || 0).getTime() - new Date(a.sent_at || a.created_at || a.created_date || 0).getTime());
  return candidates.length === 1 ? candidates[0] : null;
}

async function updateCommandTestSession(base44, command, evaluation, parsed, timestamp) {
  const resultField = COMMAND_RESULT_FIELDS[command.command_type];
  if (!resultField) return null;
  const isAdminTest = command.request_payload?.admin_device_command_test === true || command.request_payload?.source === 'admin_test';
  if (!isAdminTest) return null;

  const sessions = await base44.asServiceRole.entities.TelematicsDeviceTestSession.filter({ device_id: command.telematics_device_id, status: 'in_progress' });
  const session = sessions
    .sort((a, b) => new Date(b.started_at || b.created_date || 0).getTime() - new Date(a.started_at || a.created_date || 0).getTime())[0];
  if (!session) return null;

  const resultDetails = {
    ...(session.result_details || {}),
    [resultField]: {
      result: evaluation.result,
      reason: evaluation.reason,
      command_id: command.id,
      command_type: command.command_type,
      packet_type: parsed.packet_type,
      raw_packet_hex: parsed.raw_packet_hex,
      processed_at: timestamp
    }
  };

  return await base44.asServiceRole.entities.TelematicsDeviceTestSession.update(session.id, {
    [resultField]: evaluation.result,
    result_details: resultDetails
  });
}

function isCommandReply(parsed) {
  return ['0x8009', '0x0038'].includes(parsed?.packet_type);
}

async function processCommandResponse(base44, device, parsed, timestamp) {
  const command = await findMatchingCommand(base44, device, timestamp, parsed);
  if (!command) return { command_matched: false, reason: 'No pending command matched this MT20 reply.' };

  const evaluation = evaluateCommandReply(command, parsed);
  const pass = evaluation.result === 'pass';
  const updateData = {
    status: pass ? 'executed' : 'failed',
    queue_status: pass ? 'executed' : 'failed',
    confirmation_status: pass ? 'executed' : 'failed',
    acknowledged_at: timestamp,
    device_acknowledged_at: timestamp,
    provider_response: {
      ...(command.provider_response || {}),
      mt20_forwarded_reply: parsed,
      mt20_reply_evaluation: evaluation
    },
    failure_reason: pass ? '' : evaluation.reason
  };
  if (pass) {
    updateData.executed_at = timestamp;
    updateData.confirmed_at = timestamp;
  } else {
    updateData.failed_at = timestamp;
  }

  await base44.asServiceRole.entities.TelematicsCommand.update(command.id, updateData);
  const session = await updateCommandTestSession(base44, command, evaluation, parsed, timestamp);

  await base44.asServiceRole.entities.TelematicsEvent.create({
    company_id: command.company_id || device?.company_id || '',
    telematics_device_id: command.telematics_device_id || device?.id || '',
    provider_key: PROVIDER_KEY,
    vehicle_id: command.vehicle_id || device?.vehicle_id || '',
    event_type: pass ? `command_${command.command_type}_confirmed` : `command_${command.command_type}_reply_failed`,
    source: 'webhook',
    raw_payload: { command_id: command.id, parsed_forwarded_log: parsed, evaluation },
    created_at: timestamp
  }).catch((error) => console.warn('Command response event log skipped:', error.message));

  return { command_matched: true, command_id: command.id, command_type: command.command_type, result: evaluation.result, reason: evaluation.reason, session_updated: !!session };
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Malformed payload' }, { status: 400 });
    }

    const expectedSecret = String(Deno.env.get('TRACCAR_WEBHOOK_SECRET') || '').trim();
    if (!expectedSecret || getSecret(req, body) !== expectedSecret) {
      return Response.json({ error: 'Invalid webhook secret' }, { status: 401 });
    }

    const providerKey = String(body.provider_key || PROVIDER_KEY).trim();
    if (providerKey !== PROVIDER_KEY) {
      return Response.json({ error: 'Unsupported provider_key' }, { status: 400 });
    }

    const base44 = createWebhookClient(req);
    const now = new Date().toISOString();
    const parsed = parseForwardedMessage(body);
    if (!parsed) {
      const rawHex = rawHexFromBody(body);
      await base44.asServiceRole.entities.TelematicsEvent.create({
        company_id: '',
        telematics_device_id: '',
        provider_key: PROVIDER_KEY,
        vehicle_id: '',
        event_type: 'forwarded_log_unparsed',
        source: 'webhook',
        raw_payload: {
          ...body,
          raw_packet_hex: rawHex || '',
          diagnostic_reason: 'No supported forwarded log message found',
          supported_message_types: MESSAGE_HANDLERS.map((handler) => handler.name)
        },
        created_at: now
      }).catch((error) => console.warn('Unparsed forwarded log capture skipped:', error.message));
      return Response.json({
        ignored: true,
        captured: true,
        reason: 'No supported forwarded log message found',
        supported_message_types: MESSAGE_HANDLERS.map((handler) => handler.name)
      });
    }

    const timestamp = normalizeTimestamp(body.timestamp || body.deviceTime || body.serverTime || now);
    const device = await findDevice(base44, body, parsed);

    const rawPayload = { ...body, parsed_forwarded_log: parsed };
    if (Number.isFinite(parsed.voltage)) {
      rawPayload.battery_voltage = parsed.voltage;
      rawPayload.power_voltage = parsed.voltage;
      rawPayload.external_voltage = parsed.voltage;
      rawPayload.voltage = parsed.voltage;
      rawPayload.voltage_source = parsed.source;
      rawPayload.voltage_last_seen_at = timestamp;
    }

    let event = null;
    await base44.asServiceRole.entities.TelematicsEvent.create({
      company_id: device?.company_id || '',
      telematics_device_id: device?.id || '',
      provider_key: PROVIDER_KEY,
      vehicle_id: device?.vehicle_id || '',
      event_type: parsed.event_type,
      source: 'webhook',
      raw_payload: rawPayload,
      created_at: now
    }).then((createdEvent) => {
      event = createdEvent;
    }).catch((error) => console.warn('Forwarded log event skipped:', error.message));

    if (device && parsed.device_updates) {
      await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
        ...parsed.device_updates,
        ...(Number.isFinite(parsed.voltage) ? { voltage_last_seen_at: timestamp } : {}),
        last_seen_at: timestamp
      }).catch((error) => console.warn('Device update skipped:', error.message));
    }

    const command_processing = isCommandReply(parsed)
      ? await processCommandResponse(base44, device, parsed, timestamp)
      : null;

    return Response.json({
      ok: true,
      message_type: parsed.message_type,
      event_id: event?.id || '',
      device_updated: !!device,
      device_id: device?.id || '',
      voltage: parsed.voltage,
      packet_type: parsed.packet_type,
      source: parsed.source,
      command_processing
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});