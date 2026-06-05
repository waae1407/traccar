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

function distanceMeters(a, b) {
  if (!a || !b || a.latitude === undefined || a.longitude === undefined || b.latitude === undefined || b.longitude === undefined) return 0;
  const r = 6371000;
  const toRad = (n) => Number(n) * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function alertCooldownPassed(value, minutes = 15) {
  if (!value) return true;
  return Date.now() - new Date(value).getTime() > minutes * 60 * 1000;
}

async function createTriggerAlert(base44, config, device, alertType, title, message, metadata) {
  await base44.asServiceRole.entities.TelematicsEvent.create({
    company_id: device.company_id || '',
    telematics_device_id: device.id,
    provider_key: device.provider_key || config.provider_key || '',
    vehicle_id: device.vehicle_id || config.vehicle_id || '',
    event_type: alertType,
    source: 'system',
    raw_payload: metadata,
    created_at: new Date().toISOString()
  });
  await base44.asServiceRole.entities.OperationalAlert.create({
    alert_type: alertType === 'telematics_overspeed_trigger' ? 'provider_health_warning' : 'qa_failure',
    severity: alertType === 'telematics_overspeed_trigger' ? 'warning' : 'high',
    status: 'new',
    title,
    message,
    recommended_action: 'Review vehicle location and contact the responsible host or renter if needed.',
    domain: 'telematics',
    provider_key: device.provider_key || config.provider_key || '',
    telematics_device_id: device.id,
    vehicle_id: device.vehicle_id || config.vehicle_id || '',
    host_id: device.host_id || config.host_id || '',
    metadata
  });
}

async function evaluateConfiguredSafetyTriggers(base44, { device, latitude, longitude, speed, timestamp, raw }) {
  if (!device?.id) return;
  const config = (await base44.asServiceRole.entities.TelematicsSafetyTriggerConfig.filter({ device_id: device.id }))[0];
  if (!config || config.status === 'disabled') return;
  const updates = {};
  if (config.geofence_enabled && latitude !== undefined && longitude !== undefined) {
    const distance = distanceMeters({ latitude: config.geofence_latitude, longitude: config.geofence_longitude }, { latitude, longitude });
    const inside = distance <= Number(config.geofence_radius_meters || 300);
    const hadState = typeof config.last_geofence_inside === 'boolean';
    const exited = hadState && config.last_geofence_inside === true && inside === false;
    const entered = hadState && config.last_geofence_inside === false && inside === true;
    const shouldAlert = alertCooldownPassed(config.last_geofence_alert_at) && ((exited && ['exit', 'both'].includes(config.geofence_mode || 'exit')) || (entered && ['enter', 'both'].includes(config.geofence_mode || 'exit')));
    updates.last_geofence_inside = inside;
    if (shouldAlert) {
      updates.last_geofence_alert_at = timestamp;
      await createTriggerAlert(base44, config, device, exited ? 'telematics_geofence_exit_trigger' : 'telematics_geofence_enter_trigger', exited ? 'Vehicle exited geofence' : 'Vehicle entered geofence', `${device.unique_id || device.id} ${exited ? 'exited' : 'entered'} its configured geofence.`, { config_id: config.id, latitude, longitude, distance_meters: Math.round(distance), radius_meters: config.geofence_radius_meters, raw });
    }
  }
  if (config.overspeed_enabled && speed !== undefined) {
    const mph = Number(speed || 0);
    const limit = Number(config.overspeed_limit_mph || 75);
    if (mph > limit && alertCooldownPassed(config.last_overspeed_alert_at)) {
      updates.last_overspeed_alert_at = timestamp;
      await createTriggerAlert(base44, config, device, 'telematics_overspeed_trigger', 'Vehicle overspeed detected', `${device.unique_id || device.id} reported ${Math.round(mph)} mph, above the configured ${limit} mph limit.`, { config_id: config.id, speed_mph: mph, limit_mph: limit, latitude, longitude, raw });
    }
  }
  if (Object.keys(updates).length) await base44.asServiceRole.entities.TelematicsSafetyTriggerConfig.update(config.id, updates);
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

function traccarOnlineStatus(device) {
  if (device?.status === 'online') return 'online';
  if (device?.status === 'offline') return 'offline';
  return 'unknown';
}

function onlineStatus(device, position) {
  const traccarStatus = traccarOnlineStatus(device);
  if (traccarStatus !== 'unknown') return traccarStatus;
  if (!position?.fixTime && !position?.deviceTime && !position?.serverTime) return 'unknown';
  const seen = new Date(position.fixTime || position.deviceTime || position.serverTime).getTime();
  return Date.now() - seen > 30 * 60 * 1000 ? 'offline' : 'online';
}

function normalizeKey(value) {
  return String(value || '').trim().toUpperCase();
}

function traccarDevicePayload(device) {
  return {
    provider_key: PROVIDER_KEY,
    provider_type: 'traccar',
    unique_id: String(device.uniqueId || device.id || '').trim(),
    provider_device_id: String(device.id || '').trim(),
    traccar_device_id: String(device.id || '').trim(),
    model: device.model || device.name || 'Noran MT20',
    lifecycle_status: 'inventory',
    assigned_status: 'unassigned',
    install_status: 'not_started',
    online_status: traccarOnlineStatus(device),
    gps_enabled: true,
    lock_unlock_enabled: true,
    horn_light_enabled: true,
    unlock_disarms_alarm: true,
    unlock_double_pulse_enabled: true,
    host_starter_control_enabled: true,
    installer_starter_test_enabled: true,
    production_commands_enabled: true,
    production_command_scope: 'all_supported_commands',
    created_at: new Date().toISOString()
  };
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
    const traccarByUniqueId = new Map((traccarDevices || []).map(device => [normalizeKey(device.uniqueId), device]).filter(([key]) => key));
    const positionsByDeviceId = new Map((positions || []).map(position => [String(position.deviceId), position]));
    const localByTraccarId = new Map();
    const localByUniqueId = new Map();
    for (const local of localDevices) {
      const traccarId = String(local.traccar_device_id || local.provider_device_id || '').trim();
      const uniqueId = normalizeKey(local.unique_id);
      if (traccarId) localByTraccarId.set(traccarId, local);
      if (uniqueId) localByUniqueId.set(uniqueId, local);
    }

    let updated = 0;
    let autoLinked = 0;
    let createdFromTraccar = 0;
    let retiredMissing = 0;
    let statusOnlyUpdated = 0;
    const skipped = [];

    for (const traccarDevice of traccarDevices || []) {
      const traccarId = String(traccarDevice.id || '').trim();
      const uniqueId = normalizeKey(traccarDevice.uniqueId);
      const existing = localByTraccarId.get(traccarId) || localByUniqueId.get(uniqueId);
      if (!existing && traccarId && uniqueId) {
        const saved = await base44.asServiceRole.entities.TelematicsDevice.create(traccarDevicePayload(traccarDevice));
        localDevices.push(saved);
        localByTraccarId.set(traccarId, saved);
        localByUniqueId.set(uniqueId, saved);
        createdFromTraccar += 1;
      }
    }

    for (const local of localDevices) {
      let traccarId = String(local.traccar_device_id || local.provider_device_id || '').trim();
      let traccarDevice = traccarById.get(traccarId);
      if (!traccarDevice && local.unique_id) {
        const matchedTraccarDevice = traccarByUniqueId.get(normalizeKey(local.unique_id));
        if (matchedTraccarDevice?.id) {
          traccarId = String(matchedTraccarDevice.id);
          traccarDevice = matchedTraccarDevice;
          await base44.asServiceRole.entities.TelematicsDevice.update(local.id, {
            traccar_device_id: traccarId,
            provider_device_id: traccarId,
            online_status: traccarOnlineStatus(traccarDevice),
            lifecycle_status: local.lifecycle_status === 'retired' ? 'inventory' : local.lifecycle_status
          });
          autoLinked += 1;
        }
      }
      if (!traccarDevice) {
        if (local.lifecycle_status !== 'retired') {
          await base44.asServiceRole.entities.TelematicsDevice.update(local.id, {
            lifecycle_status: 'retired',
            assigned_status: 'retired',
            install_status: 'retired',
            online_status: 'unknown',
            location_source: 'unknown',
            retired_at: new Date().toISOString()
          });
          retiredMissing += 1;
        }
        skipped.push({ id: local.id, unique_id: local.unique_id, reason: 'not_found_on_traccar' });
        continue;
      }
      const position = positionsByDeviceId.get(traccarId);
      if (!position || typeof position.latitude !== 'number' || typeof position.longitude !== 'number') {
        await base44.asServiceRole.entities.TelematicsDevice.update(local.id, {
          traccar_device_id: traccarId,
          provider_device_id: traccarId,
          online_status: traccarOnlineStatus(traccarDevice),
          location_source: local.location_source || 'traccar'
        });
        statusOnlyUpdated += 1;
        skipped.push({ id: local.id, unique_id: local.unique_id, reason: 'no_position_status_updated' });
        continue;
      }
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
      await evaluateConfiguredSafetyTriggers(base44, { device: local, latitude: payload.last_latitude, longitude: payload.last_longitude, speed: payload.speed, timestamp: seenAt, raw: { position, traccarDevice } });
      updated += 1;
    }

    const retention_deleted = await cleanupExpiredHistory(base44);
    return Response.json({ ok: true, provider_key: PROVIDER_KEY, updated, auto_linked: autoLinked, created_from_traccar: createdFromTraccar, retired_missing_from_traccar: retiredMissing, status_only_updated: statusOnlyUpdated, skipped_count: skipped.length, skipped, retention_days: retentionDays(), retention_deleted });
  } catch (error) {
    await recordFailure(base44, error.message);
    return Response.json({ ok: false, error: error.message, warning: 'Location update delayed. Last known locations remain available.' }, { status: 500 });
  }
});