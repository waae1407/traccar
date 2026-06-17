import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PROVIDER_KEY = 'traccar_noran_mt20';
const MIN_VOLTAGE = 5;
const MAX_VOLTAGE = 30;
const COMMAND_REPLY_WINDOW_MINUTES = 10;
const RAW_ACK_MATCH_WINDOW_MINUTES = 2;
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
const MT20_ALARM_TYPES = {
  1: 'sos_alarm',
  2: 'overspeed_alarm',
  3: 'geofence_alarm',
  4: 'shock_alarm',
  9: 'power_alarm'
};
// ── HEARTBEAT-DELAY ONLY CONSTANTS ──
const NORAN_HEARTBEAT_EXPIRY_SECONDS = 90;
const UDP_MIN_COMMAND_SPACING_MS = 3000;
const UDP_PENDING_STATUS = 'pending_waiting_for_next_heartbeat';
const STARTER_COMMANDS = ['disable_starter', 'restore_starter'];

// Maps packet type codes to their session inbound type label.
// 0x000f = MT20 heartbeat/keepalive — refreshes UDP NAT port, must trigger session update.
const SESSION_INBOUND_PACKET_MAP = {
  0x000f: 'heartbeat',       // MT20 heartbeat/keepalive — primary UDP NAT refresh packet
  0x0000: 'handshake',       // login/handshake
  0x0008: 'position',        // position upload
  0x0032: 'position',        // new position upload
  0x0003: 'alarm',           // alarm upload
  0x8009: 'command_response' // command response
};

const IGNORED_PACKET_TYPES = new Set([]);
const MEANINGFUL_PACKET_TYPES = new Map([
  [0x000f, 'mt20_heartbeat'],      // heartbeat/keepalive — 0f000000 in tcpdump
  [0x0000, 'mt20_handshake'],
  [0x0003, 'mt20_alarm_upload'],
  [0x0008, 'mt20_position_upload'],
  [0x0032, 'mt20_new_position_upload'],
  [0x0038, 'mt20_query_response'],
  [0x8009, 'mt20_command_response']
]);
const ALARM_EVENT_TYPES = new Set(['sos_alarm', 'overspeed_alarm', 'geofence_alarm', 'shock_alarm', 'power_alarm', 'unknown_alarm']);
const ACTIVE_BOOKING_STATUSES = ['active', 'approved', 'confirmed'];
const ALARM_DETAILS = {
  sos_alarm: { title: 'Driver triggered SOS emergency button', safetyType: 'possible_accident', severity: 'critical', confidence: 'high', description: 'Driver emergency assistance may be needed' },
  shock_alarm: { title: 'Impact detected on vehicle', safetyType: 'possible_accident', severity: 'critical', confidence: 'medium', description: 'Sudden deceleration or collision detected' },
  geofence_alarm: { title: 'Vehicle zone boundary alert', safetyType: 'vehicle_movement_detected', severity: 'warning', confidence: 'medium', description: 'Vehicle entered/exited designated zone' },
  overspeed_alarm: { title: 'Excessive speed detected', safetyType: 'vehicle_movement_detected', severity: 'warning', confidence: 'medium', description: 'Vehicle exceeded configured speed limit' },
  power_alarm: { title: 'Device power loss detected', safetyType: 'vehicle_movement_detected', severity: 'warning', confidence: 'medium', description: 'Device lost power or experiencing low battery' },
  unknown_alarm: { title: 'Device safety alert', safetyType: 'vehicle_movement_detected', severity: 'warning', confidence: 'low', description: 'Device triggered unrecognized alarm event' }
};

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

function readFloatLE(bytes, offset) {
  if (!bytes || offset + 3 >= bytes.length) return null;
  return new DataView(new Uint8Array(bytes).buffer, offset, 4).getFloat32(0, true);
}

function decodePackedDateTime(value) {
  if (!Number.isFinite(value)) return '';
  const year = 2000 + ((value >>> 26) & 0x3f);
  const month = (value >>> 22) & 0x0f;
  const day = (value >>> 17) & 0x1f;
  const hour = (value >>> 12) & 0x1f;
  const minute = (value >>> 6) & 0x3f;
  const second = value & 0x3f;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return '';
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();
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
      device_unique_id: extractDeviceId(bytes, {}) || extractDeviceId(bytes, body) || asciiFromBytes(bytes.slice(i + 20, Math.min(bytes.length, i + 40))) || '',
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
  const isRawCommandAck = body.event_type === 'command_ack' || body.source === 'traccar_log_forwarder';

  for (let i = 0; i < bytes.length - 12; i++) {
    const packetType = readUInt16LE(bytes, i + 2);
    if (packetType !== 0x8009) continue;

    // bEnable status byte is at offset +10 from packet start (after length+commandId+position fields)
    const bEnable = bytes[i + 10];
    const status_bits = decodeStatusBits(bEnable);
    const lockState = status_bits.unlocked ? 'unlocked' : 'locked';
    const starterState = status_bits.starterKilled ? 'disabled' : 'restored';
    const accState = status_bits.accOn ? 'on' : 'off';

    // Trailing bytes: [...deviceId..., GSM, smoke, cErrorCode, 0x0D, 0x0A]
    const sliced = bytes.slice(i);
    const cErrorCode = readTrailingSignedByte(sliced);
    // GSM and smoke are 3rd and 2nd from last non-terminator bytes
    let gsm = null;
    let smoke = null;
    let vbat = null;
    // Walk back from end past 0x0D/0x0A terminators
    let tail = sliced.length - 1;
    while (tail >= 0 && [0x00, 0x0d, 0x0a].includes(sliced[tail])) tail--;
    // tail = cErrorCode position
    if (tail >= 2) {
      smoke = sliced[tail - 1];
      gsm   = sliced[tail - 2];
    }
    // VBAT is at fixed offset +5 from packet start (same position as nBAT in position packets)
    const vbatRaw = bytes[i + 5];
    if (Number.isFinite(vbatRaw) && vbatRaw > 0 && vbatRaw <= 250) {
      vbat = vbatRaw / 10;
    }

    // cErrorCode semantic
    let cErrorCode_status = 'unknown';
    if (Number.isFinite(cErrorCode)) {
      if (cErrorCode > 0) cErrorCode_status = 'ok';
      else if (cErrorCode < 0) cErrorCode_status = 'failed';
      else cErrorCode_status = 'unknown'; // 0 = ambiguous
    }

    const device_unique_id = extractDeviceId(sliced, {}) || extractDeviceId(sliced, body) || String(body.unique_id || body.device_unique_id || '').trim();

    return {
      message_type: 'mt20_command_response_8009',
      event_type: 'mt20_command_response_forwarded_log',
      source: 'forwarded_log_mt20_8009',
      raw_packet_hex: cleanHex(rawHex),
      packet_type: '0x8009',
      packet_offset: i,
      ack_only: isRawCommandAck,
      bEnable,
      status_bits,
      lock_state: lockState,
      starter_state: starterState,
      acc_state: accState,
      vbat,
      gsm,
      smoke,
      cErrorCode,
      cErrorCode_status,
      device_unique_id,
      device_updates: {
        online_status: 'online',
        ...(Number.isFinite(vbat) ? {
          battery_voltage: vbat,
          power_voltage: vbat,
          external_voltage: vbat,
          voltage: vbat,
          voltage_source: 'forwarded_log_mt20_8009_VBAT'
        } : {})
      }
    };
  }

  return null;
}

function parseMt20AlarmUpload0003(body) {
  const rawHex = rawHexFromBody(body);
  const bytes = hexToBytes(rawHex);
  if (!bytes) return null;

  for (let i = 0; i < bytes.length - 24; i++) {
    const packetType = readUInt16LE(bytes, i + 2);
    if (packetType !== 0x0003) continue;

    const bEnable = bytes[i + 4];
    const nBAT = bytes[i + 5];
    const speed = bytes[i + 6];
    const direction = readUInt16LE(bytes, i + 7);
    const longitude = readFloatLE(bytes, i + 9);
    const latitude = readFloatLE(bytes, i + 13);
    const timestamp = decodePackedDateTime(readUInt32LE(bytes, i + 17));
    const alarmByte = bytes[i + 32];
    const alarm_type = MT20_ALARM_TYPES[alarmByte] || 'unknown_alarm';
    const batteryVoltage = Number.isFinite(nBAT) ? nBAT / 10 : undefined;

    return {
      message_type: 'mt20_alarm_upload_0003',
      event_type: alarm_type,
      source: 'forwarded_log_mt20_0003_alarm_upload',
      raw_packet_hex: cleanHex(rawHex),
      packet_type: '0x0003',
      packet_offset: i,
      bEnable,
      status_bits: decodeStatusBits(bEnable),
      nBAT,
      alarm_byte: alarmByte,
      alarm_type,
      speed,
      direction,
      longitude,
      latitude,
      device_timestamp: timestamp,
      device_unique_id: extractDeviceId(bytes.slice(i), {}) || extractDeviceId(bytes.slice(i), body),
      voltage: Number.isFinite(batteryVoltage) ? batteryVoltage : undefined,
      device_updates: {
        online_status: 'online',
        ...(Number.isFinite(batteryVoltage) ? {
          battery_voltage: batteryVoltage,
          power_voltage: batteryVoltage,
          external_voltage: batteryVoltage,
          voltage: batteryVoltage,
          voltage_source: 'forwarded_log_mt20_0003_alarm_upload'
        } : {})
      }
    };
  }

  return null;
}

function parseMeaningfulMt20Packet(body) {
  const rawHex = rawHexFromBody(body);
  const bytes = hexToBytes(rawHex);
  if (!bytes) return null;

  // ── Special case: MT20 heartbeat (0x000f) — mirrors 0x0032 position path ──
  // Heartbeat packets are NOT length-prefixed. Format: [0f, 00, 00, 00, <device_id_ascii...>]
  // Bytes[0]|Bytes[1]<<8 = 0x000f.  The standard i+2 scanner would misread this as 0x0000.
  // Detect it directly by checking the raw 4-byte prefix before the loop.
  // Test vectors: 0f0000004e52303947353139303200 → NR09G51902
  if (bytes.length >= 4 && bytes[0] === 0x0f && bytes[1] === 0x00 && bytes[2] === 0x00 && bytes[3] === 0x00) {
    const device_unique_id = extractDeviceId(bytes.slice(4), {}) || extractDeviceId(bytes.slice(4), body);
    const parsed = {
      message_type: 'mt20_heartbeat',
      event_type: 'mt20_heartbeat_forwarded_log',
      source: 'forwarded_log_0x000f',
      raw_packet_hex: cleanHex(rawHex),
      packet_type: '0x000f',
      packet_offset: 0,
      device_unique_id,
      device_updates: { online_status: 'online' }
    };
    // Proof log: heartbeat parsed
    console.log(`[MT20_HEARTBEAT_PARSED] unique_id=${device_unique_id} packet_type=heartbeat command_id=0x0000 raw_hex_prefix=${(parsed.raw_packet_hex || '').slice(0, 20)} should_update_udp_session=true`);
    return parsed;
  }

  // ── Standard length-prefixed packets: [len_lo, len_hi, type_lo, type_hi, ...] ──
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
      device_unique_id: extractDeviceId(bytes.slice(i), {}) || extractDeviceId(bytes.slice(i), body),
      device_updates: { online_status: 'online' }
    };
  }
  return null;
}

const MESSAGE_HANDLERS = [
  { name: 'mt20_voltage_0032', parse: parseMt20Voltage0032 },
  { name: 'mt20_command_response_8009', parse: parseMt20CommandResponse8009 },
  { name: 'mt20_alarm_upload_0003', parse: parseMt20AlarmUpload0003 },
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
    parsed.device_unique_id,
    body.device_unique_id,
    body.unique_id,
    body.device_id,
    body.traccar_device_id,
    body.provider_device_id,
    body.imei
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
  // CRITICAL: Only position packets (0x0008/0x0032) complete locate commands
  // Heartbeat (0x000f) is NOT a command reply — filtered out by isCommandReply()
  if (['0x0008', '0x0032'].includes(parsed.packet_type)) {
    // Locate/status commands are completed by position replies
    if (['locate', 'status'].includes(command.command_type)) {
      return { result: 'pass', reason: `Device ${parsed.packet_type} position reply received after ${command.command_type} command.` };
    }
    // Other commands (lock, unlock, etc.) need 0x8009 ACK with status bits
    return { result: 'acknowledged', reason: `Device ${parsed.packet_type} position received but ${command.command_type} requires 0x8009 ACK.` };
  }
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
  // CRITICAL: Heartbeat (0x000f) is NEVER compatible with any command
  if (parsed?.packet_type === '0x000f') return false;
  // Command ACK (0x8009) compatible with all commands
  if (parsed?.packet_type === '0x8009') return ['locate', 'status', 'lock', 'unlock', 'horn', 'lights', 'horn_lights', 'alarm_pulse', 'disable_starter', 'restore_starter'].includes(commandType);
  // Position (0x0008/0x0032) and query (0x0038) only complete locate/status
  if (['0x0008', '0x0032', '0x0038'].includes(parsed?.packet_type)) return ['locate', 'status'].includes(commandType);
  return false;
}

// Use 0x8009 bEnable status bits to infer which command type this ACK most likely corresponds to.
// Returns the most likely command_type string, or null if ambiguous.
function inferCommandTypeFromStatusBits(parsed) {
  if (parsed?.packet_type !== '0x8009' || !parsed.status_bits) return null;
  const { unlocked, starterKilled } = parsed.status_bits;
  if (starterKilled === true) return 'disable_starter';
  if (starterKilled === false && parsed.cErrorCode_status === 'ok') return 'restore_starter';
  if (unlocked === true) return 'unlock';
  if (unlocked === false && parsed.cErrorCode_status === 'ok') return 'lock';
  return null;
}

// Score how well a command matches the decoded ACK status bits.
// Higher = better match. Used to break ties when multiple commands are pending.
function scoreCommandMatch(command, parsed, replyTime) {
  const sentTime = new Date(command.sent_at || command.created_at || command.created_date || 0).getTime();
  const ageSec = (replyTime - sentTime) / 1000;
  // Must be sent BEFORE the ACK arrived
  if (ageSec < 0) return -1;

  let score = 0;
  const inferredType = inferCommandTypeFromStatusBits(parsed);

  // Strong bonus if status bits align with command type
  if (inferredType && inferredType === command.command_type) score += 100;

  // Prefer commands sent closest to (but before) the ACK
  score += Math.max(0, 60 - ageSec); // up to +60 for recency

  return score;
}

// Classify match confidence based on how the match was determined.
function classifyMatchConfidence(bestCandidate, allCandidates, parsed) {
  const inferredType = inferCommandTypeFromStatusBits(parsed);
  const statusBitsAgree = inferredType && inferredType === bestCandidate.command_type;
  const uniqueMatch = allCandidates.length === 1;

  if (uniqueMatch && statusBitsAgree) return { confidence: 'high', reason: 'Only one pending command; status bits confirm command type.' };
  if (uniqueMatch) return { confidence: 'medium', reason: 'Only one pending command in window; status bits ambiguous.' };
  if (statusBitsAgree) return { confidence: 'medium', reason: `Multiple commands pending; status bits infer command type as "${inferredType}".` };
  return { confidence: 'low', reason: `Multiple commands pending (${allCandidates.length}); status bits ambiguous — matched by closest sent_at before ACK.` };
}

async function findMatchingCommand(base44, device, timestamp, parsed) {
  if (!device?.id) return null;
  const replyTime = new Date(timestamp).getTime();
  const commands = await base44.asServiceRole.entities.TelematicsCommand.filter({ telematics_device_id: device.id });
  const matchWindowMinutes = parsed.ack_only ? RAW_ACK_MATCH_WINDOW_MINUTES : COMMAND_REPLY_WINDOW_MINUTES;

  const candidates = commands.filter((command) => {
    const status = command.queue_status || command.status;
    // CRITICAL: Include sent_to_traccar and related statuses - commands are no longer "pending" after being sent
    const eligibleStatuses = ['queued', 'sending', 'sent', 'delivered', 'pending', 'pending_waiting_for_next_heartbeat', 'waiting_for_delay', 'sent_to_traccar', 'command_sent', 'released', 'executing', 'pending_ack', 'pending_device_ack', 'pending_position', 'pending_device_response'];
    if (!eligibleStatuses.includes(status)) return false;
    if (command.provider_key !== PROVIDER_KEY) return false;
    if (!isReplyCompatibleWithCommand(command, parsed)) return false;
    // Use sent_to_traccar_at if available, otherwise sent_at, otherwise created_at
    const sentTime = new Date(command.sent_to_traccar_at || command.sent_at || command.created_at || command.created_date || 0).getTime();
    if (!Number.isFinite(sentTime)) return false;
    // Command must have been sent BEFORE the ACK, within the match window
    const ageSec = (replyTime - sentTime) / 1000;
    if (ageSec < 0) return false; // ignore commands sent after ACK timestamp
    const ageMinutes = ageSec / 60;
    return ageMinutes <= matchWindowMinutes;
  });

  if (candidates.length === 0) return null;

  // Score all candidates — prefer closest sent_at + status bit alignment
  const scored = candidates
    .map((cmd) => ({ cmd, score: scoreCommandMatch(cmd, parsed, replyTime) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const best = scored[0].cmd;

  // If multiple candidates tie and none have status-bit alignment, do not match (ambiguous)
  if (candidates.length > 1) {
    const inferredType = inferCommandTypeFromStatusBits(parsed);
    const statusBitsAgree = inferredType && inferredType === best.command_type;
    if (!statusBitsAgree && scored.length > 1 && Math.abs(scored[0].score - scored[1].score) < 5) {
      // Too ambiguous — log but do not match
      console.warn(`[webhookLightLogForwarder] ACK ambiguous: ${candidates.length} candidates within ${matchWindowMinutes}min, scores too close. Skipping match.`);
      return null;
    }
  }

  const { confidence, reason } = classifyMatchConfidence(best, candidates, parsed);
  // Attach confidence metadata directly to best for use in processCommandResponse
  best._ack_match_confidence = confidence;
  best._ack_match_reason = reason;
  return best;
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
  // CRITICAL: Heartbeat (0x000f) is NOT a command reply — it only refreshes UDP session
  // Command replies are: position (0x0008/0x0032), query response (0x0038), command ACK (0x8009)
  return ['0x0008', '0x0032', '0x0038', '0x8009'].includes(parsed?.packet_type);
}

function isHeartbeatPacket(parsed) {
  // Heartbeat (0x000f) only refreshes UDP session, does NOT complete commands
  return parsed?.packet_type === '0x000f';
}

async function processCommandResponse(base44, device, parsed, timestamp) {
  const command = await findMatchingCommand(base44, device, timestamp, parsed);
  if (!command) return { command_matched: false, reason: 'No pending command matched this MT20 reply.' };

  if (parsed.packet_type === '0x000f') {
    console.warn(`[webhookLightLogForwarder] BUG: Heartbeat (0x000f) should not reach processCommandResponse — it should only refresh UDP session`);
    return { command_matched: false, reason: 'Heartbeat packets do not complete commands' };
  }

  const alreadySucceeded = ['delivered', 'acknowledged', 'executed'].includes(command.confirmation_status || '');

  const evaluation = parsed.ack_only
    ? { result: 'acknowledged', reason: 'Raw MT20 command ACK detected from Traccar log forwarder.' }
    : evaluateCommandReply(command, parsed);
  const pass = evaluation.result === 'pass';
  const ackOnly = parsed.ack_only === true;

  if (command.command_type === 'locate' && ['0x0008', '0x0032'].includes(parsed.packet_type)) {
    console.log(`[LOCATE_COMMAND_COMPLETE] command_id=${command.id} unique_id=${device.unique_id} packet_type=${parsed.packet_type} position_received=true locate_marked_executed=true evaluation_result=${evaluation.result}`);
  }

  const ackMatchConfidence = command._ack_match_confidence || 'low';
  const ackMatchReason = command._ack_match_reason || 'Matched by time window.';

  const mt20Ack8009 = parsed.packet_type === '0x8009' ? {
    raw_packet_hex: parsed.raw_packet_hex,
    bEnable: parsed.bEnable,
    status_bits: parsed.status_bits,
    lock_state: parsed.lock_state,
    starter_state: parsed.starter_state,
    acc_state: parsed.acc_state,
    vbat: parsed.vbat,
    gsm: parsed.gsm,
    smoke: parsed.smoke,
    cErrorCode: parsed.cErrorCode,
    cErrorCode_status: parsed.cErrorCode_status,
    device_unique_id: parsed.device_unique_id,
    ack_match_confidence: ackMatchConfidence,
    ack_match_reason: ackMatchReason,
    received_at: timestamp
  } : null;

  if (alreadySucceeded && !pass && !ackOnly) {
    console.warn(`[webhookLightLogForwarder] Skipping downgrade of already-succeeded command ${command.id} (current: ${command.confirmation_status}).`);
    await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
      provider_response: {
        ...(command.provider_response || {}),
        mt20_forwarded_reply: parsed,
        mt20_ack_8009: mt20Ack8009,
        mt20_reply_evaluation: evaluation,
        downgrade_prevented: true
      }
    }).catch(() => {});
    return { command_matched: true, command_id: command.id, command_type: command.command_type, result: 'no_downgrade', reason: 'Command already succeeded; downgrade prevented.', ack_match_confidence: ackMatchConfidence };
  }

  const newStatus = ackOnly ? 'acknowledged' : (pass ? 'executed' : 'failed');
  const newQueueStatus = ackOnly ? 'acknowledged' : (pass ? 'completed' : 'failed');
  const statusMessageMap = {
    acknowledged: 'Acknowledged by device',
    executed: 'Command executed successfully',
    completed: 'Command completed successfully',
    failed: 'No ACK received — device replied with failure'
  };
  const updateData = {
    status: newStatus,
    queue_status: newQueueStatus,
    confirmation_status: newStatus,
    acknowledged_at: timestamp,
    device_acknowledged_at: timestamp,
    device_ack_received_at: timestamp,
    udp_packet_observed: true,
    status_message: statusMessageMap[newStatus] || newStatus,
    ack_match_confidence: ackMatchConfidence,
    ack_match_reason: ackMatchReason,
    provider_response: {
      ...(command.provider_response || {}),
      mt20_forwarded_reply: parsed,
      mt20_ack_8009: mt20Ack8009,
      mt20_reply_evaluation: evaluation
    },
    failure_reason: pass || ackOnly ? '' : evaluation.reason,
    // Store ACK raw hex for validation
    ack_raw_hex: parsed.packet_type === '0x8009' ? parsed.raw_packet_hex : null,
    ack_received_at: timestamp
  };
  
  // For locate commands completed by position response
  if (pass && command.command_type === 'locate' && ['0x0008', '0x0032'].includes(parsed.packet_type)) {
    updateData.executed_at = timestamp;
    updateData.confirmed_at = timestamp;
  }
  
  // Add release validation metadata if this command was heartbeat-gated
  if (command.heartbeat_source_ip || command.heartbeat_received_at) {
    updateData.heartbeat_source_ip = command.heartbeat_source_ip;
    updateData.heartbeat_source_port = command.heartbeat_source_port;
    updateData.heartbeat_received_at = command.heartbeat_received_at;
    updateData.command_released_at = command.command_released_at || timestamp;
    updateData.release_reason = command.release_reason || 'fresh_mt20_heartbeat';
    updateData.traccar_api_sent_at = command.traccar_api_sent_at || timestamp;
    updateData.tcpdump_expected_target = command.tcpdump_expected_target || null;
  }
  if (pass) {
    updateData.executed_at = timestamp;
    updateData.confirmed_at = timestamp;
  } else if (!ackOnly) {
    updateData.failed_at = timestamp;
  }

  await base44.asServiceRole.entities.TelematicsCommand.update(command.id, updateData);
  const session = ackOnly ? null : await updateCommandTestSession(base44, command, evaluation, parsed, timestamp);

  await base44.asServiceRole.entities.TelematicsEvent.create({
    company_id: command.company_id || device?.company_id || '',
    telematics_device_id: command.telematics_device_id || device?.id || '',
    provider_key: PROVIDER_KEY,
    vehicle_id: command.vehicle_id || device?.vehicle_id || '',
    event_type: ackOnly ? `command_${command.command_type}_acknowledged` : (pass ? `command_${command.command_type}_confirmed` : `command_${command.command_type}_reply_failed`),
    source: 'webhook',
    raw_payload: { command_id: command.id, parsed_forwarded_log: parsed, evaluation },
    created_at: timestamp
  }).catch((error) => console.warn('Command response event log skipped:', error.message));

  return { command_matched: true, command_id: command.id, command_type: command.command_type, result: evaluation.result, reason: evaluation.reason, ack_match_confidence: ackMatchConfidence, ack_match_reason: ackMatchReason, session_updated: !!session };
}

function isActivePaidRental(booking) {
  return booking && ACTIVE_BOOKING_STATUSES.includes(booking.booking_status) && booking.payment_status !== 'failed';
}

async function getActiveBookingForVehicle(base44, vehicleId) {
  if (!vehicleId) return null;
  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ vehicle_id: vehicleId });
  return bookings.find(isActivePaidRental) || null;
}

async function getHost(base44, hostId) {
  if (!hostId) return null;
  return (await base44.asServiceRole.entities.Host.filter({ id: hostId }))[0] || null;
}

function alarmMessage(detail, device, parsed, recipient = 'admin') {
  const location = parsed.latitude !== undefined && parsed.longitude !== undefined ? ` ${parsed.latitude.toFixed(3)}°, ${parsed.longitude.toFixed(3)}°` : '';
  const speed = parsed.speed !== undefined && parsed.speed > 0 ? ` at ${parsed.speed} mph` : '';
  
  if (recipient === 'host') {
    return `${detail.title}${speed}. ${detail.description}. Last known location: ${location || 'updating'}. Immediate attention required.`;
  } else if (recipient === 'customer') {
    return `Your rental vehicle triggered a safety alert: ${detail.description.toLowerCase()}. Fleet operator has been notified. Are you safe?`;
  } else {
    // admin
    return `${detail.title} on device ${device?.unique_id || device?.id || 'unknown'}. ${detail.description}. Location: ${location || 'unknown'}${speed}.`;
  }
}

async function resolveAlarmRecipients(base44, payload) {
  if (payload.recipient_role === 'admin' && !payload.recipient_email) {
    return [];
  }
  return [{ email: payload.recipient_email || payload.user_email || '', phone: payload.recipient_phone || '' }].filter((recipient) => recipient.email || recipient.phone);
}

async function sendAlarmEmail(recipientEmail, payload) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey || !recipientEmail) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'uRide Alerts <alerts@uridehub.com>',
      to: [recipientEmail],
      subject: payload.title,
      text: `${payload.message || payload.body || ''}\n\nOpen: ${payload.action_url || '/'}`
    })
  });
  if (!response.ok) console.warn('Alarm email failed:', recipientEmail, await response.text());
  return response.ok;
}

async function sendAlarmSms(recipientPhone, payload) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!accountSid || !authToken || !fromPhone || !recipientPhone) return false;
  const body = new URLSearchParams({
    From: fromPhone,
    To: recipientPhone,
    Body: `${payload.title}: ${payload.message || payload.body || ''}`.slice(0, 1500)
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  if (!response.ok) console.warn('Alarm SMS failed:', recipientPhone, await response.text());
  return response.ok;
}

async function createScopedAlarmNotification(base44, payload) {
  const notification = await base44.asServiceRole.entities.Notification.create({
    ...payload,
    domain: 'telematics',
    type: 'telematics',
    delivery_channels: ['in_app', 'email', 'sms'],
    delivery_status: 'pending'
  });

  const recipients = await resolveAlarmRecipients(base44, payload);
  const results = [];
  for (const recipient of recipients) {
    results.push(await sendAlarmEmail(recipient.email, payload));
    results.push(await sendAlarmSms(recipient.phone, payload));
  }

  const attempted = recipients.length > 0;
  const delivered = results.some(Boolean);
  await base44.asServiceRole.entities.Notification.update(notification.id, {
    delivery_status: delivered ? 'sent' : attempted ? 'failed' : 'pending'
  }).catch(() => null);
}

// ── Heartbeat Session Tracking ──
async function updateDeviceUdpSession(base44, device, parsed, timestamp, body) {
  if (!device?.id) return;
  const packetType = parsed?.packet_type;
  const packetTypeNum = packetType ? parseInt(packetType, 16) : null;
  const inboundType = packetTypeNum !== null && SESSION_INBOUND_PACKET_MAP[packetTypeNum] ? SESSION_INBOUND_PACKET_MAP[packetTypeNum] : 'unknown';
  if (inboundType === 'unknown') return;

  const sourceIpRaw = String(body?.source_ip || body?.sourceIp || '').trim() || null;
  const sourcePort = sourceIpRaw && sourceIpRaw.includes(':') ? sourceIpRaw.split(':').pop() : null;
  const sourceIpOnly = sourceIpRaw && sourceIpRaw.includes(':') ? sourceIpRaw.split(':')[0] : sourceIpRaw;

  const updatePayload = {
    last_inbound_packet_at: timestamp,
    last_inbound_packet_type: inboundType,
    last_inbound_source: parsed.source || 'forwarded_log',
    last_inbound_raw_hex: (parsed.raw_packet_hex || '').slice(0, 20)
  };

  if (inboundType === 'heartbeat') {
    updatePayload.last_heartbeat_source_ip = sourceIpOnly || null;
    updatePayload.last_heartbeat_source_port = sourcePort || null;
    updatePayload.last_heartbeat_received_at = timestamp;
  }

  try {
    await base44.asServiceRole.entities.TelematicsDevice.update(device.id, updatePayload);
    if (inboundType === 'heartbeat') {
      console.log(`[HEARTBEAT_RECEIVED] unique_id=${device.unique_id || device.id} packet_type=0x000f last_heartbeat_at=${timestamp}`);
    }
  } catch (err) {
    console.error('[heartbeatUpdate] FAILED:', err.message);
  }
}

function isStarterCommand(commandType) {
  return STARTER_COMMANDS.includes(commandType);
}

async function dispatchPendingCommandViaTraccar(base44, command, device) {
  const baseUrl = String(Deno.env.get('TRACCAR_BASE_URL') || '').trim();
  const username = String(Deno.env.get('TRACCAR_USERNAME') || '').trim();
  const password = String(Deno.env.get('TRACCAR_PASSWORD') || '').trim();
  if (!baseUrl || !username || !password) throw new Error('Traccar credentials not configured for auto-dispatch.');

  const traccarDeviceId = Number(device.traccar_device_id);
  if (!Number.isFinite(traccarDeviceId)) throw new Error('Device has no valid Traccar device ID for auto-dispatch.');

  const hexPayload = command.hex_payload || command.wrapped_payload;
  if (!hexPayload) throw new Error('Pending command has no hex_payload to dispatch.');

  const traccarPayload = { deviceId: traccarDeviceId, type: 'custom', attributes: { data: hexPayload } };
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/commands/send`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${username}:${password}`),
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(traccarPayload)
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Traccar dispatch failed (${res.status}): ${text}`);
  return { traccar_payload: traccarPayload, traccar_response: data };
}

async function autoDispatchPendingCommands(base44, device, heartbeatTimestamp) {
  if (!device?.id || !heartbeatTimestamp) return 0;

  const now = new Date();
  const nowMs = Date.now();
  const expiryCutoff = new Date(nowMs - NORAN_HEARTBEAT_EXPIRY_SECONDS * 1000).toISOString();
  // CRITICAL: Use ?? not || to preserve 0
  const configuredDelay = device.post_heartbeat_release_delay_seconds ?? 0;

  // Find oldest pending command - includes ALL heartbeat-waiting statuses
  const pendingCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({
    telematics_device_id: device.id,
    queue_status: ['pending_waiting_for_next_heartbeat', 'waiting_for_delay', 'queued', 'pending']
  }, '-created_date', 10).catch(() => []);

  // MONITORING: Check for stuck commands (waiting_for_delay longer than configured delay + 10s buffer)
  for (const cmd of pendingCommands) {
    if (cmd.queue_status === 'waiting_for_delay' && cmd.heartbeat_received_at) {
      const heartbeatMs = new Date(cmd.heartbeat_received_at).getTime();
      const cmdConfiguredDelay = cmd.request_payload?.configured_delay_seconds ?? configuredDelay;
      const delayCompleteAt = heartbeatMs + (cmdConfiguredDelay * 1000);
      const secondsOverdue = Math.floor((nowMs - delayCompleteAt) / 1000);
      
      if (secondsOverdue > 10 && !cmd.sent_to_traccar_at) {
        // Command is stuck - flag it and create alert
        await base44.asServiceRole.entities.TelematicsCommand.update(cmd.id, {
          stuck_waiting_for_delay: true,
          stuck_seconds: secondsOverdue,
          last_stuck_check_at: now.toISOString()
        }).catch(() => {});
        
        // Create operational alert (deduplicated by 5-minute buckets)
        const bucket = Math.floor(nowMs / (5 * 60 * 1000));
        const dedupeKey = `stuck_command:${cmd.id}:${bucket}`;
        const existingAlert = (await base44.asServiceRole.entities.OperationalAlert.filter({ dedupe_key: dedupeKey }))[0];
        
        if (!existingAlert) {
          await base44.asServiceRole.entities.OperationalAlert.create({
            alert_type: 'command_failed',
            severity: 'warning',
            status: 'new',
            title: 'Command stuck in waiting_for_delay',
            message: `Command ${cmd.id} (${cmd.command_type}) for device ${device.unique_id} has been stuck for ${secondsOverdue}s after delay period completed.`,
            recommended_action: 'Review command and device heartbeat status. Consider manual release or re-send.',
            assigned_role: 'admin',
            source_entity_type: 'TelematicsCommand',
            source_entity_id: cmd.id,
            domain: 'telematics',
            action_url: '/admin/telematics-command-test',
            provider_key: PROVIDER_KEY,
            telematics_device_id: device.id,
            vehicle_id: device.vehicle_id || '',
            dedupe_key: dedupeKey,
            metadata: {
              command_type: cmd.command_type,
              configured_delay: cmdConfiguredDelay,
              seconds_overdue: secondsOverdue,
              heartbeat_received_at: cmd.heartbeat_received_at
            }
          }).catch(() => {});
        }
      }
    }
  }

  // Expire old commands (>90s without heartbeat)
  for (const cmd of pendingCommands) {
    const createdAt = cmd.created_at || cmd.created_date || '';
    if (createdAt && createdAt < expiryCutoff) {
      await base44.asServiceRole.entities.TelematicsCommand.update(cmd.id, {
        status: 'expired_no_heartbeat', queue_status: 'expired_no_heartbeat',
        confirmation_status: 'expired', failed_at: now.toISOString(),
        failure_reason: 'No heartbeat received within 90 seconds',
        status_message: 'Expired - no heartbeat'
      }).catch(() => {});
    }
  }

  // Find eligible command (not starter-locked without approval)
  const eligible = pendingCommands.find((cmd) => {
    const createdAt = cmd.created_at || cmd.created_date || '';
    if (!createdAt || createdAt < expiryCutoff) return false;
    if (isStarterCommand(cmd.command_type)) {
      const payload = cmd.request_payload || {};
      return (payload.starter_confirmation === true || payload.confirm_starter_command === true);
    }
    return true;
  });

  if (!eligible) return 0;

  // Enforce 3-second spacing
  const recentlySent = await base44.asServiceRole.entities.TelematicsCommand.filter(
    { telematics_device_id: device.id },
    '-created_date', 10
  ).catch(() => []);
  const tooRecent = recentlySent.some((cmd) => {
    if (cmd.id === eligible.id) return false;
    const sentMs = new Date(cmd.sent_at || cmd.created_at || cmd.created_date || 0).getTime();
    return (nowMs - sentMs) < UDP_MIN_COMMAND_SPACING_MS && ['sent', 'waiting_for_delay', 'sent_to_traccar'].includes(cmd.queue_status || cmd.status || '');
  });

  if (tooRecent) return 0;

  // HEARTBEAT-DELAY RULE: Handle both pending and waiting_for_delay commands
  const isWaitingForDelay = eligible.queue_status === 'waiting_for_delay';
  
  // For waiting_for_delay commands, use stored heartbeat_received_at (do NOT reset timer)
  // For pending commands, use the new heartbeatTimestamp
  const hbMs = isWaitingForDelay 
    ? (eligible.heartbeat_received_at ? new Date(eligible.heartbeat_received_at).getTime() : new Date(heartbeatTimestamp).getTime())
    : new Date(heartbeatTimestamp).getTime();
  
  // CRITICAL: If delay is 0, release immediately without waiting_for_delay state
  if (configuredDelay === 0) {
    // Immediate release - skip waiting_for_delay
  } else if (isWaitingForDelay) {
    // Command already in waiting_for_delay - check if delay period complete
    const delayCompleteAt = hbMs + (configuredDelay * 1000);
    if (nowMs < delayCompleteAt) {
      // Still waiting - update seconds remaining for monitoring
      const secondsRemaining = Math.ceil((delayCompleteAt - nowMs) / 1000);
      await base44.asServiceRole.entities.TelematicsCommand.update(eligible.id, {
        seconds_until_release: secondsRemaining,
        last_heartbeat_check_at: heartbeatTimestamp
      }).catch(() => {});
      return 0; // Not ready yet
    }
    // Delay complete - will release below
  } else {
    // New pending command - first heartbeat received
    const delayCompleteAt = hbMs + (configuredDelay * 1000);
    if (nowMs < delayCompleteAt) {
      // Still waiting for delay period - populate audit fields
      const secondsRemaining = Math.ceil((delayCompleteAt - nowMs) / 1000);
      await base44.asServiceRole.entities.TelematicsCommand.update(eligible.id, {
        queue_status: 'waiting_for_delay',
        status: 'waiting_for_delay',
        status_message: `Heartbeat received, waiting ${configuredDelay}s before sending`,
        heartbeat_received_at: heartbeatTimestamp,
        heartbeat_matched_at: new Date().toISOString(),
        configured_delay_seconds: configuredDelay,
        seconds_until_release: secondsRemaining,
        delay_complete_at: new Date(delayCompleteAt).toISOString()
      }).catch(() => {});
      return 0; // Not ready yet
    }
  }

  // Delay complete - send to Traccar
  try {
    const dispatchResult = await dispatchPendingCommandViaTraccar(base44, eligible, device);
    const traccarCommandId = dispatchResult.traccar_response?.id || dispatchResult.traccar_response?.commandId || null;
    const actualDelayMs = nowMs - hbMs;
    const releaseTriggeredBy = isWaitingForDelay ? 'webhook_waiting_for_delay' : 'webhook_immediate';

    await base44.asServiceRole.entities.TelematicsCommand.update(eligible.id, {
      queue_status: 'sent_to_traccar',
      status: 'sent_to_traccar',
      confirmation_status: 'sent',
      sent_at: now.toISOString(),
      sent_to_traccar_at: now.toISOString(),
      status_message: configuredDelay === 0 ? 'Released immediately on heartbeat (0s delay)' : `Sent to Traccar after ${configuredDelay}s delay`,
      traccar_api_response: dispatchResult.traccar_response || dispatchResult,
      transmission_format: 'mt20_wrapped_hex',
      provider_response: { ...dispatchResult, auto_dispatched: true, triggered_by: releaseTriggeredBy },
      heartbeat_received_at: eligible.heartbeat_received_at || heartbeatTimestamp,
      heartbeat_matched_at: eligible.heartbeat_matched_at || new Date().toISOString(),
      command_released_at: now.toISOString(),
      actual_heartbeat_to_release_delay_seconds: actualDelayMs / 1000,
      configured_delay_seconds: configuredDelay,
      delay_source: 'TelematicsDevice.post_heartbeat_release_delay_seconds',
      release_strategy: 'heartbeat_delay_only',
      release_triggered_by: releaseTriggeredBy,
      traccar_command_id: traccarCommandId
    });

    await base44.asServiceRole.entities.TelematicsEvent.create({
      telematics_device_id: device.id,
      provider_key: PROVIDER_KEY,
      vehicle_id: device.vehicle_id || '',
      event_type: `command_${eligible.command_type}_sent`,
      source: 'webhook',
      raw_payload: {
        auto_dispatched: true,
        pending_command_id: eligible.id,
        triggered_by: 'heartbeat_delay_release',
        dispatch_result: dispatchResult,
        configured_delay_seconds: configuredDelay,
        actual_delay_seconds: actualDelayMs / 1000
      },
      created_at: now.toISOString()
    }).catch(() => {});

    console.log(`[HEARTBEAT_DELAY_RELEASE] device=${device.unique_id} command=${eligible.command_type} configured_delay=${configuredDelay}s actual_delay=${(actualDelayMs/1000).toFixed(1)}s sent_to_traccar=true`);
    return 1;
  } catch (err) {
    console.warn('[heartbeatDelayRelease] Failed:', err.message);
    await base44.asServiceRole.entities.TelematicsCommand.update(eligible.id, {
      queue_status: 'failed',
      status: 'failed',
      failure_reason: `Heartbeat-delay release failed: ${err.message}`,
      failed_at: now.toISOString()
    }).catch(() => {});
  }
  return 0;
}

async function processAlarmUpload(base44, { device, parsed, event, rawPayload, timestamp }) {
  if (!ALARM_EVENT_TYPES.has(parsed?.event_type) || !device?.id) return null;

  const detail = ALARM_DETAILS[parsed.event_type] || ALARM_DETAILS.unknown_alarm;
  const booking = await getActiveBookingForVehicle(base44, device.vehicle_id);
  const host = await getHost(base44, device.host_id);
  const message = alarmMessage(detail, device, parsed);
  const now = new Date().toISOString();

  const safetyEvent = await base44.asServiceRole.entities.TelematicsSafetyEvent.create({
    event_type: detail.safetyType,
    confidence: detail.confidence,
    severity: detail.severity,
    vehicle_id: device.vehicle_id || '',
    host_id: device.host_id || '',
    booking_id: booking?.id || '',
    customer_id: booking?.user_id || '',
    telematics_device_id: device.id,
    provider_key: PROVIDER_KEY,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    speed: Number(parsed.speed || 0),
    acc_status: parsed.status_bits?.accOn === true ? 'on' : parsed.status_bits?.accOn === false ? 'off' : 'unknown',
    shock_detected: parsed.event_type === 'shock_alarm',
    started_at: timestamp || now,
    status: 'open',
    last_known_location: parsed.latitude !== undefined && parsed.longitude !== undefined ? `${parsed.latitude.toFixed(3)}, ${parsed.longitude.toFixed(3)}` : '',
    raw_telemetry_snapshot: {
      alarm_type: parsed.event_type,
      alarm_code: parsed.alarm_byte,
      packet_type: parsed.packet_type,
      raw_packet_hex: parsed.raw_packet_hex,
      status_bits: parsed.status_bits,
      bEnable: parsed.bEnable,
      nBAT: parsed.nBAT,
      battery_voltage: parsed.voltage,
      device_timestamp: parsed.device_timestamp || '',
      telematics_event_id: event?.id || '',
      parsed_forwarded_log: parsed,
      raw: rawPayload
    },
    created_by: 'system'
  });

  const bucket = Math.floor(new Date(timestamp || now).getTime() / (5 * 60 * 1000));
  const dedupeKey = `mt20_alarm:${device.id}:${parsed.event_type}:${bucket}`;
  const existingAlert = (await base44.asServiceRole.entities.OperationalAlert.filter({ dedupe_key: dedupeKey }))[0];
  const alertPayload = {
    alert_type: parsed.event_type === 'shock_alarm' || parsed.event_type === 'sos_alarm' ? 'command_failed' : 'provider_health_warning',
    severity: detail.severity,
    status: 'new',
    title: detail.title,
    message,
    recommended_action: 'Review the vehicle location, contact the assigned host or active renter if needed, and resolve the safety event.',
    assigned_role: 'admin',
    source_entity_type: 'TelematicsSafetyEvent',
    source_entity_id: safetyEvent.id,
    domain: 'telematics',
    action_url: '/admin/telematics-operations',
    provider_key: PROVIDER_KEY,
    telematics_device_id: device.id,
    vehicle_id: device.vehicle_id || '',
    host_id: device.host_id || '',
    dedupe_key: dedupeKey,
    metadata: { alarm_type: parsed.event_type, safety_event_id: safetyEvent.id, telematics_event_id: event?.id || '', booking_id: booking?.id || '' }
  };

  if (existingAlert) {
    await base44.asServiceRole.entities.OperationalAlert.update(existingAlert.id, {
      ...alertPayload,
      repeat_count: Number(existingAlert.repeat_count || 1) + 1,
      last_duplicate_at: now,
      status: existingAlert.status === 'resolved' ? 'new' : existingAlert.status
    });
  } else {
    await base44.asServiceRole.entities.OperationalAlert.create(alertPayload);
  }

  const shouldNotifyRecipients = ['sos_alarm', 'shock_alarm'].includes(parsed.event_type);

  if (!existingAlert && shouldNotifyRecipients) {
    const adminMsg = alarmMessage(detail, device, parsed, 'admin');
    const hostMsg = alarmMessage(detail, device, parsed, 'host');
    const customerMsg = alarmMessage(detail, device, parsed, 'customer');
    
    await createScopedAlarmNotification(base44, {
      recipient_role: 'admin',
      severity: detail.severity,
      title: detail.title,
      body: adminMsg,
      message: adminMsg,
      source_entity_type: 'TelematicsSafetyEvent',
      source_entity_id: safetyEvent.id,
      action_url: '/admin/telematics-operations'
    });
    if (host?.email) {
      await createScopedAlarmNotification(base44, {
        recipient_role: 'host',
        recipient_email: host.email,
        recipient_phone: host.phone || '',
        severity: detail.severity,
        title: detail.title,
        body: hostMsg,
        message: hostMsg,
        source_entity_type: 'TelematicsSafetyEvent',
        source_entity_id: safetyEvent.id,
        action_url: '/host/telematics'
      });
    }
    if (booking?.user_email) {
      await createScopedAlarmNotification(base44, {
        recipient_role: 'customer',
        recipient_email: booking.user_email,
        recipient_phone: booking.customer_phone || '',
        user_email: booking.user_email,
        user_id: booking.user_id || '',
        severity: detail.severity,
        title: detail.title,
        body: customerMsg,
        message: customerMsg,
        source_entity_type: 'TelematicsSafetyEvent',
        source_entity_id: safetyEvent.id,
        action_url: '/my-bookings'
      });
    }
  }

  return { safety_event_id: safetyEvent.id, alarm_type: parsed.event_type, customer_notified: !!booking?.user_email, host_notified: !!host?.email };
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

    const timestamp = normalizeTimestamp(parsed.device_timestamp || body.timestamp || body.deviceTime || body.serverTime || now);
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
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      speed: parsed.speed,
      ignition: typeof parsed.status_bits?.accOn === 'boolean' ? parsed.status_bits.accOn : undefined,
      raw_payload: rawPayload,
      created_at: now
    }).then((createdEvent) => {
      event = createdEvent;
    }).catch((error) => console.warn('Forwarded log event skipped:', error.message));

    if (device && parsed.device_updates) {
      await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
        ...parsed.device_updates,
        ...(Number.isFinite(parsed.voltage) ? { voltage_last_seen_at: timestamp } : {}),
        ...(parsed.latitude !== undefined ? { last_latitude: parsed.latitude } : {}),
        ...(parsed.longitude !== undefined ? { last_longitude: parsed.longitude } : {}),
        ...(parsed.speed !== undefined ? { speed: parsed.speed } : {}),
        ...(typeof parsed.status_bits?.accOn === 'boolean' ? { ignition_status: parsed.status_bits.accOn ? 'on' : 'off' } : {}),
        last_seen_at: timestamp
      }).catch((error) => console.warn('Device update skipped:', error.message));
    }

    // ── Update heartbeat session tracking ──
    await updateDeviceUdpSession(base44, device, parsed, timestamp, body);

    // ── HEARTBEAT-DELAY RELEASE: Check if pending commands should be released ──
    if (device && isHeartbeatPacket(parsed)) {
      const dispatched = (await autoDispatchPendingCommands(base44, device, timestamp)) || 0;
      if (dispatched > 0) {
        console.log(`[HEARTBEAT_TRIGGERED_RELEASE] unique_id=${device.unique_id || device.id} commands_dispatched=${dispatched}`);
      }
    }

    const alarm_processing = await processAlarmUpload(base44, { device, parsed, event, rawPayload, timestamp });

    // CRITICAL: Heartbeat (0x000f) does NOT complete commands — only position (0x0032) and command ACKs (0x8009) do
    const command_processing = isCommandReply(parsed)
      ? await processCommandResponse(base44, device, parsed, timestamp)
      : isHeartbeatPacket(parsed)
        ? { heartbeat_only: true, message: 'Heartbeat refreshed UDP session only — does not complete locate commands' }
        : null;

    return Response.json({
      ok: true,
      message_type: parsed.message_type,
      event_id: event?.id || '',
      device_updated: !!device,
      device_id: device?.id || '',
      voltage: parsed.voltage,
      packet_type: parsed.packet_type,
      packet_type_name: (() => {
        if (parsed.packet_type === '0x000f') return 'heartbeat (triggers command release)';
        if (parsed.packet_type === '0x0032') return 'position (can complete locate)';
        if (parsed.packet_type === '0x0008') return 'position (can complete locate)';
        if (parsed.packet_type === '0x8009') return 'command ACK (can complete any command)';
        if (parsed.packet_type === '0x0038') return 'query response';
        return parsed.packet_type;
      })(),
      heartbeat_received: isHeartbeatPacket(parsed),
      can_complete_locate: ['0x0032', '0x0008'].includes(parsed.packet_type),
      source: parsed.source,
      alarm_processing,
      command_processing
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});