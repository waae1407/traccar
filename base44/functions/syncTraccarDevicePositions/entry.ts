import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PROVIDER_KEY = 'traccar_noran_mt20';

function authHeader() {
  const username = Deno.env.get('TRACCAR_USERNAME');
  const password = Deno.env.get('TRACCAR_PASSWORD');
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function baseUrl() {
  return String(Deno.env.get('TRACCAR_BASE_URL') || '').replace(/\/$/, '');
}

function toIso(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function hexToBytes(value) {
  const clean = String(value || '').replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '');
  if (clean.length < 4 || clean.length % 2 !== 0) return null;
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
  return bytes;
}

function readUInt16(bytes, offset) {
  if (offset + 1 >= bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readInt32(bytes, offset) {
  if (offset + 3 >= bytes.length) return null;
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >> 0;
}

function coordinateFromRaw(value) {
  if (!Number.isFinite(value)) return undefined;
  for (const scale of [1000000, 10000000, 1800000, 30000]) {
    const scaled = value / scale;
    if (Math.abs(scaled) <= 180) return scaled;
  }
  return undefined;
}

function bcdByte(byte) {
  const hi = (byte >> 4) & 0x0f;
  const lo = byte & 0x0f;
  if (hi > 9 || lo > 9) return null;
  return hi * 10 + lo;
}

function parseBcdDateTime(bytes, offset) {
  if (offset + 5 >= bytes.length) return '';
  const parts = bytes.slice(offset, offset + 6).map(bcdByte);
  if (parts.some((part) => part === null)) return '';
  const [yy, month, day, hour, minute, second] = parts;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return '';
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();
}

function asciiFromBytes(bytes) {
  return bytes.filter((byte) => byte >= 32 && byte <= 126).map((byte) => String.fromCharCode(byte)).join('').replace(/[\u0000\r\n]/g, '').trim();
}

function parseNoranCandidate(bytes, start) {
  if (start + 23 > bytes.length) return null;
  const vbat = bytes[start + 1];
  if (!Number.isFinite(vbat) || vbat <= 0 || vbat > 250) return null;
  let end = bytes.length;
  if (bytes[end - 2] === 0x0d && bytes[end - 1] === 0x0a) end -= 2;
  return {
    command: '0x8009',
    bEnable: bytes[start],
    VBAT: vbat,
    battery_voltage: vbat / 10,
    speed: readUInt16(bytes, start + 2) ?? 0,
    direction: readUInt16(bytes, start + 4) ?? 0,
    longitude: coordinateFromRaw(readInt32(bytes, start + 6)),
    latitude: coordinateFromRaw(readInt32(bytes, start + 10)),
    datetime: parseBcdDateTime(bytes, start + 14),
    device_id: asciiFromBytes(bytes.slice(start + 20, Math.max(start + 20, end - 3))),
    GSM: bytes[end - 3],
    smoke: bytes[end - 2],
    cErrorCode: bytes[end - 1]
  };
}

function parseNoranPositionPacket(bytes) {
  for (let i = 0; i < bytes.length - 5; i++) {
    const command = readUInt16(bytes, i + 2);
    if (command !== 0x0032 && command !== 0x0008) continue;
    const voltageByte = bytes[i + 5];
    if (!Number.isFinite(voltageByte) || voltageByte <= 0 || voltageByte > 250) continue;
    return {
      command: command === 0x0032 ? '0x0032' : '0x0008',
      bEnable: bytes[i + 4],
      nBAT: voltageByte,
      VBAT: voltageByte,
      battery_voltage: voltageByte / 10,
      power_voltage: voltageByte / 10,
      external_voltage: voltageByte / 10,
      voltage_source: command === 0x0032 ? 'mt20_0032_nBAT' : 'mt20_0008_vBAT'
    };
  }
  return null;
}

function parseNoranMt20ResponsePacket(value) {
  const bytes = hexToBytes(value);
  if (!bytes) return null;
  const positionPacket = parseNoranPositionPacket(bytes);
  if (positionPacket) return positionPacket;
  for (let i = 0; i < bytes.length - 1; i++) {
    if ((bytes[i] === 0x80 && bytes[i + 1] === 0x09) || (bytes[i] === 0x09 && bytes[i + 1] === 0x80)) {
      const candidates = [i + 2, i + 8].map((start) => parseNoranCandidate(bytes, start)).filter(Boolean);
      const best = candidates.find((item) => item.latitude !== undefined && item.longitude !== undefined) || candidates[0];
      if (best) return { ...best, power_voltage: best.battery_voltage, external_voltage: best.battery_voltage, voltage_source: 'mt20_8009_VBAT' };
    }
  }
  return null;
}

function noranPacketFromPosition(position) {
  const scan = (input, depth = 0) => {
    if (!input || depth > 4) return null;
    if (typeof input === 'string') return parseNoranMt20ResponsePacket(input);
    if (typeof input !== 'object') return null;
    for (const key of ['data', 'raw', 'response', 'hex_payload', 'packet_hex', 'message']) {
      const parsed = scan(input[key], depth + 1);
      if (parsed) return parsed;
    }
    for (const value of Object.values(input)) {
      const parsed = scan(value, depth + 1);
      if (parsed) return parsed;
    }
    return null;
  };
  return scan(position);
}

function ignitionStatus(position) {
  const attributes = position?.attributes || {};
  const value = attributes.ignition ?? attributes.motion ?? attributes.acc;
  if (value === true || value === 'true' || value === 1 || value === '1') return 'on';
  if (value === false || value === 'false' || value === 0 || value === '0') return 'off';
  return 'unknown';
}

function retentionDays() {
  return 30;
}

function retentionExpiresAt() {
  return new Date(Date.now() + retentionDays() * 24 * 60 * 60 * 1000).toISOString();
}

async function cleanupExpiredHistory(base44) {
  const cutoff = new Date().toISOString();
  const recent = await base44.asServiceRole.entities.TelematicsPositionHistory.list('expires_at', 500);
  const expired = recent.filter(item => item.expires_at && item.expires_at < cutoff);
  for (const item of expired) {
    await base44.asServiceRole.entities.TelematicsPositionHistory.delete(item.id);
  }
  return expired.length;
}

function onlineStatus(device, position) {
  if (device?.status === 'online') return 'online';
  if (device?.status === 'offline') return 'offline';
  if (!position?.fixTime && !position?.deviceTime && !position?.serverTime) return 'unknown';
  const seen = new Date(position.fixTime || position.deviceTime || position.serverTime).getTime();
  return Date.now() - seen > 30 * 60 * 1000 ? 'offline' : 'online';
}

async function traccarGet(path) {
  const response = await fetch(`${baseUrl()}${path}`, { headers: { Authorization: authHeader(), Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Traccar ${path} failed with ${response.status}`);
  return response.json();
}

async function recordFailure(base44, message) {
  const now = new Date().toISOString();
  await base44.asServiceRole.entities.TelematicsEvent.create({
    provider_key: PROVIDER_KEY,
    event_type: 'traccar_position_sync_failed',
    source: 'sync',
    raw_payload: { error: message },
    created_at: now
  });

  const recent = await base44.asServiceRole.entities.TelematicsEvent.filter({ provider_key: PROVIDER_KEY, event_type: 'traccar_position_sync_failed' }, '-created_date', 5);
  const recentFailures = recent.filter(event => Date.now() - new Date(event.created_at || event.created_date).getTime() < 30 * 60 * 1000);
  if (recentFailures.length >= 3) {
    const openAlerts = await base44.asServiceRole.entities.OperationalAlert.filter({ provider_key: PROVIDER_KEY, alert_type: 'provider_health_warning', status: 'new' }, '-created_date', 5);
    if (openAlerts.length === 0) {
      await base44.asServiceRole.entities.OperationalAlert.create({
        alert_type: 'provider_health_warning',
        severity: 'warning',
        status: 'new',
        title: 'Traccar location update delayed',
        message: 'Traccar position sync has failed repeatedly. Last known vehicle locations remain visible but may be stale.',
        recommended_action: 'Review Traccar connectivity and credentials before relying on current GPS freshness.',
        provider_key: PROVIDER_KEY,
        metadata: { recent_failures: recentFailures.length, last_error: message }
      });
    }
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    if (!baseUrl()) return Response.json({ error: 'TRACCAR_BASE_URL is not configured' }, { status: 500 });

    const [traccarDevices, positions, localDevices] = await Promise.all([
      traccarGet('/api/devices'),
      traccarGet('/api/positions'),
      base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: PROVIDER_KEY }, '-updated_date', 500)
    ]);

    const traccarById = new Map((traccarDevices || []).map(device => [String(device.id), device]));
    const traccarByUniqueId = new Map((traccarDevices || []).map(device => [String(device.uniqueId || '').trim().toUpperCase(), device]));
    const positionsByDeviceId = new Map((positions || []).map(position => [String(position.deviceId), position]));
    let updated = 0;
    let autoLinked = 0;
    const skipped = [];

    for (const local of localDevices) {
      let traccarId = String(local.traccar_device_id || local.provider_device_id || '').trim();
      if (!traccarId && local.unique_id) {
        const matchedTraccarDevice = traccarByUniqueId.get(String(local.unique_id).trim().toUpperCase());
        if (matchedTraccarDevice?.id) {
          traccarId = String(matchedTraccarDevice.id);
          await base44.asServiceRole.entities.TelematicsDevice.update(local.id, {
            traccar_device_id: traccarId,
            provider_device_id: traccarId
          });
          autoLinked += 1;
        }
      }
      if (!traccarId) { skipped.push({ id: local.id, reason: 'missing_traccar_device_id' }); continue; }
      const position = positionsByDeviceId.get(traccarId);
      if (!position || typeof position.latitude !== 'number' || typeof position.longitude !== 'number') { skipped.push({ id: local.id, reason: 'no_position' }); continue; }
      const traccarDevice = traccarById.get(traccarId);
      const noranPacket = noranPacketFromPosition({ position, traccarDevice });
      const seenAt = toIso(noranPacket?.datetime || position.fixTime || position.deviceTime || position.serverTime);
      const payload = {
        last_latitude: noranPacket?.latitude ?? position.latitude,
        last_longitude: noranPacket?.longitude ?? position.longitude,
        last_seen_at: seenAt,
        speed: Number(noranPacket?.speed ?? position.speed ?? 0),
        course: Number(noranPacket?.direction ?? position.course ?? 0),
        heading: Number(noranPacket?.direction ?? position.course ?? 0),
        address: position.address || local.address || '',
        location_source: 'traccar',
        location_updated_at: new Date().toISOString(),
        online_status: onlineStatus(traccarDevice, position),
        ignition_status: ignitionStatus(position)
      };
      if (noranPacket?.battery_voltage !== null && noranPacket?.battery_voltage !== undefined) {
        payload.battery_voltage = noranPacket.battery_voltage;
        payload.power_voltage = noranPacket.power_voltage ?? noranPacket.battery_voltage;
        payload.external_voltage = noranPacket.external_voltage ?? noranPacket.battery_voltage;
        payload.voltage = noranPacket.battery_voltage;
        payload.voltage_source = noranPacket.voltage_source || 'mt20_raw_packet';
        payload.voltage_last_seen_at = seenAt;
      }
      await base44.asServiceRole.entities.TelematicsDevice.update(local.id, payload);
      await base44.asServiceRole.entities.TelematicsPositionHistory.create({
        device_id: local.id,
        vehicle_id: local.vehicle_id || '',
        host_id: local.host_id || '',
        provider_key: PROVIDER_KEY,
        latitude: payload.last_latitude,
        longitude: payload.last_longitude,
        speed: payload.speed,
        heading: payload.heading,
        ignition_status: payload.ignition_status,
        timestamp: seenAt,
        source: 'polling',
        expires_at: retentionExpiresAt()
      });
      updated += 1;
    }

    const retention_deleted = await cleanupExpiredHistory(base44);
    return Response.json({ ok: true, provider_key: PROVIDER_KEY, updated, auto_linked: autoLinked, skipped_count: skipped.length, skipped, retention_days: retentionDays(), retention_deleted });
  } catch (error) {
    await recordFailure(base44, error.message);
    return Response.json({ ok: false, error: error.message, warning: 'Location update delayed. Last known locations remain available.' }, { status: 500 });
  }
});