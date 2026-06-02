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

function parseMt20VoltagePacket(rawHex) {
  const bytes = hexToBytes(rawHex);
  if (!bytes) return null;

  for (let i = 0; i < bytes.length - 6; i++) {
    const packetType = readUInt16LE(bytes, i + 2);
    if (packetType !== 0x0032) continue;

    const nbat = bytes[i + 5];
    const voltage = nbat / 10;
    if (!Number.isFinite(voltage) || voltage < MIN_VOLTAGE || voltage > MAX_VOLTAGE) return null;

    const possibleDeviceId = asciiFromBytes(bytes.slice(i + 20, Math.min(bytes.length, i + 40)));
    return {
      raw_packet_hex: cleanHex(rawHex),
      packet_type: '0x0032',
      nBAT: nbat,
      voltage,
      device_unique_id: possibleDeviceId || ''
    };
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

    const rawHex = body.raw_packet_hex || body.packet_hex || body.raw_hex || body.message || body.data;
    const parsed = parseMt20VoltagePacket(rawHex);
    if (!parsed) {
      return Response.json({ ignored: true, reason: 'No supported MT20 0x0032 voltage packet found' });
    }

    const now = new Date().toISOString();
    const timestamp = body.timestamp && !Number.isNaN(new Date(body.timestamp).getTime()) ? new Date(body.timestamp).toISOString() : now;
    const device = await findDevice(base44, body, parsed);

    const event = await base44.asServiceRole.entities.TelematicsEvent.create({
      company_id: device?.company_id || '',
      telematics_device_id: device?.id || '',
      provider_key: PROVIDER_KEY,
      vehicle_id: device?.vehicle_id || '',
      event_type: 'mt20_voltage_forwarded_log',
      source: 'webhook',
      raw_payload: { ...body, mt20_voltage: parsed },
      created_at: now
    });

    if (device) {
      await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
        battery_voltage: parsed.voltage,
        power_voltage: parsed.voltage,
        external_voltage: parsed.voltage,
        voltage: parsed.voltage,
        voltage_source: 'forwarded_log_mt20_0032_nBAT',
        voltage_last_seen_at: timestamp,
        last_seen_at: timestamp,
        online_status: 'online'
      });
    }

    return Response.json({
      ok: true,
      event_id: event.id,
      device_updated: !!device,
      device_id: device?.id || '',
      voltage: parsed.voltage,
      packet_type: parsed.packet_type,
      voltage_source: 'forwarded_log_mt20_0032_nBAT'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});