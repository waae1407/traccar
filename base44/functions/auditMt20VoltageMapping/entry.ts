import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function baseUrl() {
  return String(Deno.env.get('TRACCAR_BASE_URL') || '').replace(/\/$/, '');
}

function authHeader() {
  return `Basic ${btoa(`${Deno.env.get('TRACCAR_USERNAME')}:${Deno.env.get('TRACCAR_PASSWORD')}`)}`;
}

async function traccarGet(path) {
  const res = await fetch(`${baseUrl()}${path}`, { headers: { Authorization: authHeader(), Accept: 'application/json' } });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`Traccar ${path} failed (${res.status}): ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

function hexToBytes(value) {
  const clean = String(value || '').replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '');
  if (clean.length < 4 || clean.length % 2 !== 0) return null;
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
  return { clean, bytes };
}

function readUInt16LE(bytes, offset) {
  if (offset + 1 >= bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

// 0x0032 / 0x0008 position packets do NOT contain vehicle battery voltage.
// bytes[5] is the alarm byte, not nBAT/VBAT. Only 0x8009 command responses
// carry real VBAT at bytes[start+1].
function parseMt20VoltagePacket(rawPacket) {
  const parsed = hexToBytes(rawPacket);
  if (!parsed) return null;
  const { clean, bytes } = parsed;
  for (let i = 0; i < bytes.length - 5; i++) {
    const packetType = readUInt16LE(bytes, i + 2);
    if (packetType !== 0x0008 && packetType !== 0x0032) continue;
    const alarmIndex = i + 5;
    const alarmByte = bytes[alarmIndex];
    if (!Number.isFinite(alarmByte)) continue;
    return {
      raw_packet: clean,
      packet_type: packetType === 0x0032 ? '0x0032' : '0x0008',
      alarm_byte_position: alarmIndex,
      alarm_byte_hex: `0x${alarmByte.toString(16).padStart(2, '0').toUpperCase()}`,
      alarm_byte_decimal: alarmByte,
      note: 'bytes[5] is the alarm byte, NOT vehicle battery voltage. Position packets do not contain VBAT.',
      phantom_voltage_if_misread: alarmByte / 10
    };
  }
  return null;
}

function findRawPackets(input, output = [], depth = 0) {
  if (!input || depth > 7) return output;
  if (typeof input === 'string') {
    const parsed = parseMt20VoltagePacket(input);
    if (parsed) output.push(parsed);
    return output;
  }
  if (typeof input !== 'object') return output;
  for (const value of Object.values(input)) findRawPackets(value, output, depth + 1);
  return output;
}

function iso(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const uniqueId = String(body.unique_id || 'NR09G00001');
    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: uniqueId });
    const device = devices[0];
    if (!device) return Response.json({ error: `Device ${uniqueId} not found` }, { status: 404 });

    const traccarDeviceId = String(device.traccar_device_id || device.provider_device_id || body.traccar_device_id || '').trim();
    const positions = await traccarGet('/api/positions');
    const currentPosition = (positions || []).find((position) => String(position.deviceId) === traccarDeviceId) || null;

    const to = new Date();
    const from = new Date(to.getTime() - 6 * 60 * 60 * 1000);
    let recentPositions = [];
    try {
      recentPositions = await traccarGet(`/api/reports/route?deviceId=${encodeURIComponent(traccarDeviceId)}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
    } catch (error) {
      recentPositions = currentPosition ? [currentPosition] : [];
    }

    const events = await base44.asServiceRole.entities.TelematicsEvent.filter({ telematics_device_id: device.id });
    const rawPacketFindings = events
      .flatMap((event) => findRawPackets(event.raw_payload || {}).map((packet) => ({ ...packet, timestamp: event.created_at || event.created_date, source: 'TelematicsEvent.raw_payload' })))
      .filter((packet) => packet.packet_type === '0x0008' || packet.packet_type === '0x0032')
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    const comparisons = (recentPositions || [])
      .slice(-20)
      .reverse()
      .slice(0, 5)
      .map((position, index) => {
        const raw = findRawPackets(position || {})[0] || rawPacketFindings[index] || null;
        return {
          timestamp: iso(position.fixTime || position.deviceTime || position.serverTime),
          raw_packet: raw?.raw_packet || null,
          packet_type: raw?.packet_type || null,
          voltage_byte_position: raw?.voltage_byte_position ?? null,
          voltage_byte_hex: raw?.voltage_byte_hex || null,
          voltage_byte_decimal: raw?.voltage_byte_decimal ?? null,
          decoded_voltage: raw?.calculated_voltage ?? null,
          traccar_fuel_attribute_value: position.attributes?.fuel ?? null,
          traccar_attributes: position.attributes || {}
        };
      });

    const fuelValues = comparisons.map((item) => item.traccar_fuel_attribute_value).filter((value) => value !== null && value !== undefined);
    const rawVoltageValues = comparisons.map((item) => item.decoded_voltage).filter((value) => value !== null && value !== undefined);
    const hasRawVoltage = rawVoltageValues.length > 0;
    const hasFuel = fuelValues.length > 0 || currentPosition?.attributes?.fuel !== undefined;

    const recommendation = hasRawVoltage
      ? 'A. RAW MT20 VOLTAGE CONFIRMED — use raw byte decoding'
      : 'C. VOLTAGE SOURCE UNCONFIRMED — do not use for installer Power PASS/FAIL yet';

    return Response.json({
      device: { id: device.id, unique_id: device.unique_id, traccar_device_id: traccarDeviceId, stored_voltage_source: device.voltage_source || null, stored_power_voltage: device.power_voltage ?? null },
      current_traccar_position_attributes: currentPosition?.attributes || null,
      traccar_fuel_reason: hasFuel
        ? 'Traccar exposes this as an attribute named fuel in the Noran position payload; no raw packet or documentation in this audit proves it maps to MT20 nBAT/vBAT.'
        : 'No Traccar fuel attribute found in the current/recent position payload.',
      traccar_fuel_classification: hasRawVoltage ? 'unconfirmed_against_raw_packet' : 'unconfirmed_not_authoritative',
      authoritative_source: hasRawVoltage ? 'raw MT20 nBAT/vBAT byte decoded from 0x0008/0x0032 packet' : 'none confirmed yet',
      raw_packet_audit: rawPacketFindings[0] || null,
      recent_packet_comparison_count: comparisons.length,
      recent_packet_comparisons: comparisons,
      recommendation,
      implementation_status: {
        fuel_treated_as_voltage: false,
        installer_power_status_should_be: hasRawVoltage ? 'eligible_for_raw_voltage_validation' : 'pending telemetry mapping',
        booking_payment_stripe_payout_billing_command_logic_changed: false
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});