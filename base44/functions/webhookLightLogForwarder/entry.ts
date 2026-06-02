import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROVIDER_KEY = 'traccar_noran_mt20';
const MIN_VOLTAGE = 5;
const MAX_VOLTAGE = 30;

function getSecret(req, body) {
  return String(req.headers.get('x-webhook-secret') || req.headers.get('x-telematics-secret') || body.webhook_secret || '').trim();
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

function asciiFromBytes(bytes) {
  return bytes
    .filter((byte) => byte >= 32 && byte <= 126)
    .map((byte) => String.fromCharCode(byte))
    .join('')
    .replace(/[\u0000\r\n]/g, '')
    .trim();
}

function parseMt20Voltage0032(body) {
  const rawHex = body.raw_packet_hex || body.packet_hex || body.raw_hex || body.message || body.data;
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
      device_unique_id: asciiFromBytes(bytes.slice(i + 20, Math.min(bytes.length, i + 40))) || '',
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

const MESSAGE_HANDLERS = [
  {
    name: 'mt20_voltage_0032',
    parse: parseMt20Voltage0032
  }
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
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

    const parsed = parseForwardedMessage(body);
    if (!parsed) {
      return Response.json({
        ignored: true,
        reason: 'No supported forwarded log message found',
        supported_message_types: MESSAGE_HANDLERS.map((handler) => handler.name)
      });
    }

    const now = new Date().toISOString();
    const timestamp = normalizeTimestamp(body.timestamp || body.deviceTime || body.serverTime || now);
    const device = await findDevice(base44, body, parsed);

    const normalizedVoltagePayload = {
      battery_voltage: parsed.voltage,
      power_voltage: parsed.voltage,
      external_voltage: parsed.voltage,
      voltage: parsed.voltage,
      voltage_source: parsed.source,
      voltage_last_seen_at: timestamp
    };

    const event = await base44.asServiceRole.entities.TelematicsEvent.create({
      company_id: device?.company_id || '',
      telematics_device_id: device?.id || '',
      provider_key: PROVIDER_KEY,
      vehicle_id: device?.vehicle_id || '',
      event_type: parsed.event_type,
      source: 'webhook',
      raw_payload: { ...body, ...normalizedVoltagePayload, parsed_forwarded_log: parsed },
      created_at: now
    });

    if (device && parsed.device_updates) {
      await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
        ...parsed.device_updates,
        voltage_last_seen_at: timestamp,
        last_seen_at: timestamp
      });
    }

    return Response.json({
      ok: true,
      message_type: parsed.message_type,
      event_id: event.id,
      device_updated: !!device,
      device_id: device?.id || '',
      voltage: parsed.voltage,
      packet_type: parsed.packet_type,
      source: parsed.source
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});