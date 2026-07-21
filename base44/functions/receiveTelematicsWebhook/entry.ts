import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPPORTED_EVENTS = ['location_update', 'ignition_on', 'ignition_off', 'geofence_enter', 'geofence_exit', 'device_offline', 'device_online', 'power_disconnect', 'shock_alarm', 'command_delivered', 'command_ack', 'command_executed', 'command_failed'];
const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const WEBHOOK_RATE_LIMIT_PER_MINUTE = 120;

function pickNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function pickVoltageCandidate(...sources) {
  for (const source of sources) {
    const number = Number(source?.value);
    if (Number.isFinite(number) && number > 0) {
      const rawScaled = /nbat|vbat/i.test(source.label || '') && number > 40 && number <= 250;
      return { value: rawScaled ? number / 10 : number, source: source.label };
    }
  }
  return { value: undefined, source: '' };
}

function hexToBytes(value) {
  const clean = String(value || '').replace(/^0x/i, '').replace(/[^a-fA-F0-9]/g, '');
  if (clean.length < 4 || clean.length % 2 !== 0) return null;
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
  return bytes;
}

function readUInt16(bytes, offset, littleEndian = true) {
  if (offset + 1 >= bytes.length) return null;
  return littleEndian ? bytes[offset] | (bytes[offset + 1] << 8) : (bytes[offset] << 8) | bytes[offset + 1];
}

function readInt32(bytes, offset, littleEndian = true) {
  if (offset + 3 >= bytes.length) return null;
  const value = littleEndian
    ? (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24))
    : ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
  return value >> 0;
}

function coordinateFromRaw(value) {
  if (!Number.isFinite(value)) return undefined;
  const scales = [1000000, 10000000, 1800000, 30000];
  for (const scale of scales) {
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
  const bEnable = bytes[start];
  const vbat = bytes[start + 1];
  if (!Number.isFinite(vbat) || vbat <= 0 || vbat > 250) return null;
  const speed = readUInt16(bytes, start + 2, true);
  const direction = readUInt16(bytes, start + 4, true);
  const longitudeRaw = readInt32(bytes, start + 6, true);
  const latitudeRaw = readInt32(bytes, start + 10, true);
  const datetime = parseBcdDateTime(bytes, start + 14);
  let end = bytes.length;
  if (bytes[end - 2] === 0x0d && bytes[end - 1] === 0x0a) end -= 2;
  const gsm = bytes[end - 3];
  const smoke = bytes[end - 2];
  const cErrorCode = bytes[end - 1];
  const deviceId = asciiFromBytes(bytes.slice(start + 20, Math.max(start + 20, end - 3)));
  return {
    command: '0x8009',
    bEnable,
    VBAT: vbat,
    battery_voltage: vbat / 10,
    speed: speed ?? 0,
    direction: direction ?? 0,
    longitude: coordinateFromRaw(longitudeRaw),
    latitude: coordinateFromRaw(latitudeRaw),
    datetime,
    device_id: deviceId,
    GSM: gsm,
    smoke,
    cErrorCode
  };
}

function parseNoranPositionPacket(bytes) {
  for (let i = 0; i < bytes.length - 5; i++) {
    const command = readUInt16(bytes, i + 2, true);
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
  const markerOffsets = [];
  for (let i = 0; i < bytes.length - 1; i++) {
    if ((bytes[i] === 0x80 && bytes[i + 1] === 0x09) || (bytes[i] === 0x09 && bytes[i + 1] === 0x80)) markerOffsets.push(i);
  }
  for (const marker of markerOffsets) {
    const candidates = [marker + 2, marker + 8].map((start) => parseNoranCandidate(bytes, start)).filter(Boolean);
    const best = candidates.find((item) => item.latitude !== undefined && item.longitude !== undefined) || candidates[0];
    if (best) return { ...best, power_voltage: best.battery_voltage, external_voltage: best.battery_voltage, voltage_source: 'mt20_8009_VBAT' };
  }
  return null;
}

function findNoranPacketPayload(input, depth = 0) {
  if (!input || depth > 4) return null;
  if (typeof input === 'string') return parseNoranMt20ResponsePacket(input);
  if (typeof input !== 'object') return null;
  const priority = ['packet_hex', 'raw_hex', 'hex_payload', 'data', 'response', 'raw', 'message'];
  for (const key of priority) {
    const parsed = findNoranPacketPayload(input[key], depth + 1);
    if (parsed) return parsed;
  }
  for (const value of Object.values(input)) {
    const parsed = findNoranPacketPayload(value, depth + 1);
    if (parsed) return parsed;
  }
  return null;
}

function retentionExpiresAt() {
  const days = 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeTimestamp(...values) {
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function ignitionLabel(value, fallback = 'unknown') {
  if (value === true || value === 'true' || value === 1 || value === '1') return 'on';
  if (value === false || value === 'false' || value === 0 || value === '0') return 'off';
  return fallback;
}

function getClientIp(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
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

function mphFromTelemetrySpeed(value) {
  const speed = Number(value || 0);
  if (!Number.isFinite(speed)) return 0;
  return speed;
}

function alertCooldownPassed(value, minutes = 15) {
  if (!value) return true;
  return Date.now() - new Date(value).getTime() > minutes * 60 * 1000;
}

async function createTriggerAlert(base44, config, device, alertType, title, message, metadata) {
  const now = new Date().toISOString();
  await base44.asServiceRole.entities.TelematicsEvent.create({
    company_id: device.company_id || '',
    telematics_device_id: device.id,
    provider_key: device.provider_key || config.provider_key || '',
    vehicle_id: device.vehicle_id || config.vehicle_id || '',
    event_type: alertType,
    source: 'system',
    raw_payload: metadata,
    created_at: now
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
    const distance = distanceMeters(
      { latitude: config.geofence_latitude, longitude: config.geofence_longitude },
      { latitude, longitude }
    );
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
    const mph = mphFromTelemetrySpeed(speed);
    const limit = Number(config.overspeed_limit_mph || 75);
    if (mph > limit && alertCooldownPassed(config.last_overspeed_alert_at)) {
      updates.last_overspeed_alert_at = timestamp;
      await createTriggerAlert(base44, config, device, 'telematics_overspeed_trigger', 'Vehicle overspeed detected', `${device.unique_id || device.id} reported ${Math.round(mph)} mph, above the configured ${limit} mph limit.`, { config_id: config.id, speed_mph: mph, limit_mph: limit, latitude, longitude, raw });
    }
  }

  if (Object.keys(updates).length) await base44.asServiceRole.entities.TelematicsSafetyTriggerConfig.update(config.id, updates);
}

function shockDetected(body, eventType) {
  const alarm = String(body.alarm || body.position?.attributes?.alarm || body.position?.attributes?.event || '').toLowerCase();
  return eventType === 'shock_alarm' || body.shock_alarm === true || body.shock === true || alarm.includes('shock') || alarm.includes('crash') || alarm.includes('collision');
}

function isActivePaidRental(booking) {
  return booking && ['active', 'approved', 'confirmed'].includes(booking.booking_status) && booking.payment_status !== 'failed';
}

async function getActiveBookingForVehicle(base44, vehicleId) {
  if (!vehicleId) return null;
  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ vehicle_id: vehicleId });
  return bookings.find(isActivePaidRental) || null;
}

async function sendEmailIfConfigured(to, subject, body) {
  const apiKey = String(Deno.env.get('RESEND_API_KEY') || '');
  if (!apiKey || !to) return;
  await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: 'uRideHub <alerts@uridehub.com>', to, subject, text: body }) }).catch(() => null);
}

async function sendSmsIfConfigured(to, body) {
  const sid = String(Deno.env.get('TWILIO_ACCOUNT_SID') || '');
  const token = String(Deno.env.get('TWILIO_AUTH_TOKEN') || '');
  const from = String(Deno.env.get('TWILIO_PHONE_NUMBER') || '');
  if (!sid || !token || !from || !to) return;
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: to, From: from, Body: body }) }).catch(() => null);
}

async function notifySafetyEventCreated(base44, event, booking) {
  const title = event.event_type === 'possible_accident' ? 'Possible Accident Detected' : 'Vehicle Movement Detected';
  const message = `${title} for vehicle ${event.vehicle_id}. Confidence: ${event.confidence}. Location: ${event.last_known_location || 'unknown'}.`;
  await base44.asServiceRole.entities.Notification.create({ recipient_role: 'admin', domain: 'telematics', severity: event.severity, title, body: message, message, type: 'telematics', source_entity_type: 'TelematicsSafetyEvent', source_entity_id: event.id, action_url: '/admin/telematics-operations', delivery_channels: ['in_app', 'email', 'sms'], delivery_status: 'pending' });
  if (event.host_id) {
    const host = (await base44.asServiceRole.entities.Host.filter({ id: event.host_id }))[0];
    if (host?.email) {
      await base44.asServiceRole.entities.Notification.create({ recipient_role: 'host', recipient_email: host.email, domain: 'telematics', severity: event.severity, title, body: message, message, type: 'telematics', source_entity_type: 'TelematicsSafetyEvent', source_entity_id: event.id, action_url: '/host/telematics', delivery_channels: ['in_app', 'email', 'sms'], delivery_status: 'pending' });
      await sendEmailIfConfigured(host.email, title, message);
      await sendSmsIfConfigured(host.phone, message);
    }
  }
  if (booking?.user_email) {
    await base44.asServiceRole.entities.Notification.create({ recipient_role: 'customer', recipient_email: booking.user_email, user_email: booking.user_email, user_id: booking.user_id || '', domain: 'telematics', severity: event.severity, title, body: message, message, type: 'telematics', source_entity_type: 'TelematicsSafetyEvent', source_entity_id: event.id, action_url: '/my-bookings', delivery_channels: ['in_app', 'email', 'sms'], delivery_status: 'pending' });
    await sendEmailIfConfigured(booking.user_email, title, message);
    await sendSmsIfConfigured(booking.customer_phone, message);
  }
}

async function createSafetyEventIfNeeded(base44, { body, eventType, device, providerKey, latitude, longitude, speed, ignitionStatus, positionTimestamp }) {
  if (!device?.vehicle_id || latitude === undefined || longitude === undefined) return null;
  const history = (await base44.asServiceRole.entities.TelematicsPositionHistory.filter({ device_id: device.id }))
    .sort((a, b) => new Date(b.timestamp || b.created_date || 0) - new Date(a.timestamp || a.created_date || 0));
  const current = { latitude, longitude, speed: Number(speed || 0), timestamp: positionTimestamp };
  const previous = history.find(point => new Date(point.timestamp || 0).getTime() < new Date(positionTimestamp).getTime() - 1000) || history[1];
  const movementMeters = distanceMeters(previous, current);
  const repeatedMovement = history.slice(0, 4).filter((point, index, arr) => index < arr.length - 1 && distanceMeters(point, arr[index + 1]) > 35).length >= 2;
  const shock = shockDetected(body, eventType);
  const accOff = ignitionStatus === 'off';
  const movingSpeed = Number(speed || 0) >= 5;
  const suddenStop = previous && Number(previous.speed || 0) >= 15 && Number(speed || 0) <= 3;
  const stationaryAfterStop = previous && distanceMeters(previous, current) < 30 && Number(speed || 0) <= 3;
  let candidate = null;

  if ((movementMeters > 75 || repeatedMovement || movingSpeed) && (accOff || shock || movementMeters > 150)) {
    const confidence = accOff && shock ? 'high' : accOff ? 'medium' : 'low';
    candidate = { event_type: 'vehicle_movement_detected', confidence, severity: confidence === 'high' ? 'critical' : confidence === 'medium' ? 'warning' : 'info' };
  }
  if (shock || suddenStop) {
    const confidence = suddenStop && shock && stationaryAfterStop ? 'high' : suddenStop ? 'medium' : 'low';
    const severity = confidence === 'high' ? 'critical' : 'warning';
    candidate = { event_type: 'possible_accident', confidence, severity };
  }
  if (!candidate) return null;

  const existing = (await base44.asServiceRole.entities.TelematicsSafetyEvent.filter({ vehicle_id: device.vehicle_id, event_type: candidate.event_type }))
    .find(event => ['open', 'escalated'].includes(event.status) && new Date(event.started_at || event.created_date || 0).getTime() > Date.now() - 30 * 60 * 1000);
  if (existing) return existing;

  const booking = await getActiveBookingForVehicle(base44, device.vehicle_id);
  const event = await base44.asServiceRole.entities.TelematicsSafetyEvent.create({
    ...candidate,
    vehicle_id: device.vehicle_id,
    host_id: device.host_id || '',
    booking_id: booking?.id || '',
    customer_id: booking?.user_id || '',
    telematics_device_id: device.id,
    provider_key: providerKey,
    latitude,
    longitude,
    speed: Number(speed || 0),
    acc_status: ignitionStatus || 'unknown',
    shock_detected: shock,
    started_at: new Date().toISOString(),
    status: 'open',
    last_known_location: `${latitude}, ${longitude}`,
    raw_telemetry_snapshot: { event_type: eventType, movement_meters: Math.round(movementMeters), repeated_movement: repeatedMovement, sudden_stop: suddenStop, stationary_after_stop: stationaryAfterStop, power_status: body.power_status || body.position?.attributes?.power || '', online_status: device.online_status || '', raw: body },
    created_by: 'system'
  });
  await notifySafetyEventCreated(base44, event, booking);
  return event;
}

async function logSecurityEvent(base44, { eventType, providerKey = '', providerId = '', summary, metadata = {} }) {
  await base44.asServiceRole.entities.ActivityEvent.create({
    event_type: 'gps.command_failed',
    actor_id: 'webhook',
    actor_email: 'provider-webhook',
    actor_role: 'system',
    target_entity: providerId ? 'TelematicsProviderConfig' : 'WebhookRequest',
    target_id: providerId,
    summary,
    metadata: { security_event_type: eventType, provider_key: providerKey, ...metadata },
    source: 'webhook',
    event_status: 'error',
  });
}

function getProvidedSecret(req, body) {
  return String(req.headers.get('x-telematics-secret') || req.headers.get('x-webhook-secret') || body.webhook_secret || '').trim();
}

function getWebhookTimestamp(req, body) {
  return String(req.headers.get('x-telematics-timestamp') || req.headers.get('x-webhook-timestamp') || body.timestamp || '').trim();
}

function isValidTimestamp(value) {
  const parsed = Number(value);
  const time = Number.isFinite(parsed) ? (parsed > 1000000000000 ? parsed : parsed * 1000) : Date.parse(value);
  return Number.isFinite(time) && Math.abs(Date.now() - time) <= WEBHOOK_TIMESTAMP_TOLERANCE_MS;
}

async function validateWebhookRequest(base44, req, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    await logSecurityEvent(base44, { eventType: 'malformed_payload', summary: 'Telematics webhook rejected: malformed payload', metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Malformed payload' }, { status: 400 }) };
  }

  // ── Traccar built-in position.forward.url passthrough ──
  // Traccar's native position forwarder POSTs a standard position JSON
  // (keys: position/deviceId/latitude/longitude/...) WITHOUT provider_key,
  // webhook secret, or event id. Our Python log forwarder is the authoritative
  // ingestion path; the built-in forwarder is redundant. Acknowledge it
  // benignly so Traccar stops logging "Position forwarding failed: HTTP 400".
  const looksLikeTraccarNativeForward =
    !body.provider_key && !body.providerKey && !body.raw_packet_hex && !body.packet_hex &&
    (Boolean(body.position) || (body.deviceId && (body.latitude !== undefined || body.longitude !== undefined)));
  if (looksLikeTraccarNativeForward) {
    return { ok: false, response: Response.json({ ok: true, ignored: true, reason: 'Traccar native position forward — handled by log forwarder' }) };
  }

  const providerKey = String(body.provider_key || body.providerKey || '').trim();
  if (!providerKey) {
    await logSecurityEvent(base44, { eventType: 'missing_provider_key', summary: 'Telematics webhook rejected: provider_key is required', metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'provider_key is required' }, { status: 400 }) };
  }

  const providers = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: providerKey });
  const provider = providers[0];
  if (!provider) {
    await logSecurityEvent(base44, { eventType: 'unknown_provider', providerKey, summary: `Telematics webhook rejected: unknown provider ${providerKey}`, metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Unknown telematics provider' }, { status: 404 }) };
  }

  if (!provider.is_active) {
    await logSecurityEvent(base44, { eventType: 'provider_disabled', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: provider ${providerKey} is disabled`, metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Telematics provider is disabled' }, { status: 403 }) };
  }

  if (!provider.webhook_secret_reference) {
    await logSecurityEvent(base44, { eventType: 'missing_secret_reference', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: provider ${providerKey} has no webhook secret reference`, metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Webhook secret reference is not configured' }, { status: 401 }) };
  }

  const expected = String(Deno.env.toObject()[provider.webhook_secret_reference] || '').trim();
  const provided = getProvidedSecret(req, body);
  if (!expected) {
    await logSecurityEvent(base44, { eventType: 'secret_not_configured', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: ${provider.webhook_secret_reference} is not configured`, metadata: { webhook_secret_reference: provider.webhook_secret_reference, ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Webhook secret is not configured for this provider' }, { status: 401 }) };
  }
  if (!provided || provided !== expected) {
    await logSecurityEvent(base44, { eventType: 'invalid_secret', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: invalid secret for ${providerKey}`, metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Invalid webhook secret' }, { status: 401 }) };
  }

  const timestamp = getWebhookTimestamp(req, body);
  if (!timestamp || !isValidTimestamp(timestamp)) {
    await logSecurityEvent(base44, { eventType: 'invalid_timestamp', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: invalid or stale timestamp for ${providerKey}`, metadata: { timestamp, ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Invalid or stale webhook timestamp' }, { status: 401 }) };
  }

  const eventId = String(req.headers.get('x-telematics-event-id') || body.event_id || body.eventId || '').trim();
  if (!eventId) {
    await logSecurityEvent(base44, { eventType: 'missing_event_id', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: missing event id for ${providerKey}`, metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Webhook event id is required' }, { status: 400 }) };
  }

  const recentSecurityEvents = await base44.asServiceRole.entities.ActivityEvent.list('-created_date', 150);
  const replayKey = `telematics_webhook:${providerKey}:${eventId}`;
  if (recentSecurityEvents.some((event) => event.metadata?.replay_key === replayKey)) {
    await logSecurityEvent(base44, { eventType: 'replay_detected', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: replay detected for ${providerKey}`, metadata: { replay_key: replayKey, ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Duplicate webhook event' }, { status: 409 }) };
  }

  const oneMinuteAgo = Date.now() - 60 * 1000;
  const recentCount = recentSecurityEvents.filter((event) =>
    event.metadata?.provider_key === providerKey &&
    event.metadata?.webhook_accepted === true &&
    new Date(event.created_date || 0).getTime() >= oneMinuteAgo
  ).length;
  if (recentCount >= WEBHOOK_RATE_LIMIT_PER_MINUTE) {
    await logSecurityEvent(base44, { eventType: 'rate_limited', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: rate limit exceeded for ${providerKey}`, metadata: { recent_count: recentCount, ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Webhook rate limit exceeded' }, { status: 429 }) };
  }

  if (body.event_type && !SUPPORTED_EVENTS.includes(body.event_type)) {
    await logSecurityEvent(base44, { eventType: 'unsupported_event_type', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: unsupported event type for ${providerKey}`, metadata: { event_type: body.event_type, ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Unsupported webhook event type' }, { status: 400 }) };
  }

  await base44.asServiceRole.entities.ActivityEvent.create({
    event_type: 'gps.command_sent',
    actor_id: 'webhook',
    actor_email: 'provider-webhook',
    actor_role: 'system',
    target_entity: 'TelematicsProviderConfig',
    target_id: provider.id,
    summary: `Telematics webhook accepted for ${providerKey}`,
    metadata: { provider_key: providerKey, replay_key: replayKey, webhook_accepted: true },
    source: 'webhook',
    event_status: 'success',
  });

  return { ok: true, providerKey, provider };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => null);
    const validation = await validateWebhookRequest(base44, req, body);
    if (!validation.ok) return validation.response;
    const { providerKey, provider } = validation;

    const eventType = SUPPORTED_EVENTS.includes(body.event_type) ? body.event_type : 'location_update';
    const uniqueId = String(body.unique_id || body.device_id || body.provider_device_id || body.imei || '').trim();
    const traccarId = String(body.traccar_device_id || body.deviceId || body.position?.deviceId || '').trim();
    let device = null;
    if (uniqueId) {
      const byUnique = await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: providerKey, unique_id: uniqueId });
      const byProvider = byUnique[0] ? [] : await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: providerKey, provider_device_id: uniqueId });
      device = byUnique[0] || byProvider[0] || null;
    }
    if (!device && traccarId) {
      const byTraccar = await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: providerKey, traccar_device_id: traccarId });
      device = byTraccar[0] || null;
    }

    const noranPacket = findNoranPacketPayload(body);
    const latitude = pickNumber(body.latitude, body.lat, body.position?.latitude, noranPacket?.latitude);
    const longitude = pickNumber(body.longitude, body.lng, body.lon, body.position?.longitude, noranPacket?.longitude);
    const speed = pickNumber(body.speed, body.position?.speed, noranPacket?.speed);
    const heading = pickNumber(body.heading, body.course, body.position?.course, body.position?.heading, noranPacket?.direction);
    const voltageCandidate = pickVoltageCandidate(
      { label: noranPacket?.voltage_source || 'mt20_packet', value: noranPacket?.battery_voltage },
      { label: 'webhook.power_voltage', value: body.power_voltage },
      { label: 'webhook.external_voltage', value: body.external_voltage },
      { label: 'webhook.battery_voltage', value: body.battery_voltage },
      { label: 'webhook.voltage', value: body.voltage },
      { label: 'position.attributes.power_voltage', value: body.position?.attributes?.power_voltage },
      { label: 'position.attributes.external_voltage', value: body.position?.attributes?.external_voltage },
      { label: 'position.attributes.battery_voltage', value: body.position?.attributes?.battery_voltage },
      { label: 'position.attributes.voltage', value: body.position?.attributes?.voltage }
    );
    const batteryVoltage = voltageCandidate.value;
    const ignition = eventType === 'ignition_on' ? true : eventType === 'ignition_off' ? false : body.ignition ?? body.position?.attributes?.ignition;
    const now = new Date().toISOString();
    const positionTimestamp = normalizeTimestamp(noranPacket?.datetime, body.fixTime, body.deviceTime, body.serverTime, body.position?.fixTime, body.position?.deviceTime, body.position?.serverTime, now);

    const event = await base44.asServiceRole.entities.TelematicsEvent.create({
      company_id: device?.company_id || provider.company_id || '',
      telematics_device_id: device?.id || '',
      provider_key: providerKey,
      vehicle_id: device?.vehicle_id || body.vehicle_id || '',
      event_type: eventType,
      source: 'webhook',
      latitude,
      longitude,
      speed,
      ignition: typeof ignition === 'boolean' ? ignition : undefined,
      raw_payload: noranPacket ? { ...body, noran_mt20: noranPacket } : body,
      created_at: now,
    });

    if (device) {
      const updates = { last_seen_at: positionTimestamp, location_updated_at: now, location_source: 'traccar' };
      if (latitude !== undefined) updates.last_latitude = latitude;
      if (longitude !== undefined) updates.last_longitude = longitude;
      if (speed !== undefined) updates.speed = speed;
      if (heading !== undefined) { updates.heading = heading; updates.course = heading; }
      if (batteryVoltage !== undefined) {
        updates.battery_voltage = batteryVoltage;
        updates.power_voltage = batteryVoltage;
        updates.external_voltage = batteryVoltage;
        updates.voltage = batteryVoltage;
        updates.voltage_source = voltageCandidate.source;
        updates.voltage_last_seen_at = positionTimestamp;
      }
      if (latitude !== undefined && longitude !== undefined && eventType === 'location_update') updates.online_status = 'online';
      if (eventType === 'device_online') updates.online_status = 'online';
      if (eventType === 'device_offline') updates.online_status = 'offline';
      updates.ignition_status = ignitionLabel(ignition, device.ignition_status || 'unknown');
      await base44.asServiceRole.entities.TelematicsDevice.update(device.id, updates);

      if (latitude !== undefined && longitude !== undefined) {
        await base44.asServiceRole.entities.TelematicsPositionHistory.create({
          device_id: device.id,
          vehicle_id: device.vehicle_id || body.vehicle_id || '',
          host_id: device.host_id || '',
          provider_key: providerKey,
          latitude,
          longitude,
          speed: speed || 0,
          heading: heading || 0,
          ignition_status: updates.ignition_status,
          timestamp: positionTimestamp,
          source: 'webhook',
          expires_at: retentionExpiresAt()
        });
      }
      await evaluateConfiguredSafetyTriggers(base44, { device, latitude, longitude, speed, timestamp: positionTimestamp, raw: body });
    }

    if (device && !['command_delivered', 'command_ack', 'command_executed', 'command_failed'].includes(eventType)) {
      await createSafetyEventIfNeeded(base44, {
        body,
        eventType,
        device,
        providerKey,
        latitude,
        longitude,
        speed,
        ignitionStatus: ignitionLabel(ignition, device.ignition_status || 'unknown'),
        positionTimestamp
      });
    }

    // Command ACK processing is isolated in its own try/catch.
    // A webhook parser exception here must NOT mark the command as failed —
    // the device already acknowledged (e.g. 0x8009 reply packet was received by Traccar).
    // ACK processing is isolated — a parse error here must NOT downgrade an already-ACKed command.
    if (['command_delivered', 'command_ack', 'command_executed', 'command_failed'].includes(eventType)) {
      try {
        const commandId = body.command_id || body.commandId || '';
        const idempotencyKey = body.idempotency_key || body.idempotencyKey || '';
        const providerCommandId = body.provider_command_id || body.providerCommandId || '';
        const commandType = body.command_type || body.commandType || body.command || '';
        const matches = commandId
          ? await base44.asServiceRole.entities.TelematicsCommand.filter({ id: commandId })
          : idempotencyKey
            ? await base44.asServiceRole.entities.TelematicsCommand.filter({ idempotency_key: idempotencyKey })
            : providerCommandId
              ? await base44.asServiceRole.entities.TelematicsCommand.filter({ provider_command_id: String(providerCommandId) })
              : device && commandType
                ? (await base44.asServiceRole.entities.TelematicsCommand.filter({ telematics_device_id: device.id, command_type: commandType })).sort((a, b) => new Date(b.created_date || b.created_at || 0) - new Date(a.created_date || a.created_at || 0))
                : [];
        const command = matches[0];
        if (command) {
          const createdAt = new Date(command.created_at || command.created_date || now).getTime();
          const sentAt = new Date(command.sent_at || command.created_at || command.created_date || now).getTime();
          // Only mark as failed if the eventType is explicitly command_failed AND the command
          // was not already in a terminal success state (delivered/acknowledged/executed).
          // This prevents webhook parser errors from downgrading a successfully-ACKed command.
          const alreadySucceeded = ['delivered', 'acknowledged', 'executed'].includes(command.confirmation_status || '');
          const update = eventType === 'command_delivered'
            ? { status: 'delivered', queue_status: 'delivered', confirmation_status: 'delivered', delivered_at: now, delivery_latency_ms: Date.now() - sentAt, acknowledgement_source: 'webhook', provider_response: body }
            : eventType === 'command_ack'
              ? { status: 'acknowledged', queue_status: 'acknowledged', confirmation_status: 'acknowledged', acknowledged_at: now, device_acknowledged_at: now, delivery_latency_ms: Date.now() - sentAt, acknowledgement_source: 'webhook', provider_response: body }
              : eventType === 'command_executed'
                ? { status: 'executed', queue_status: 'executed', confirmation_status: 'executed', acknowledged_at: command.acknowledged_at || now, device_acknowledged_at: command.device_acknowledged_at || now, executed_at: now, confirmed_at: now, execution_latency_ms: Date.now() - createdAt, acknowledgement_source: 'webhook', provider_response: body }
                : alreadySucceeded
                  ? null  // Do not downgrade a command that already succeeded
                  : { status: 'failed', queue_status: 'failed', confirmation_status: 'failed', failed_at: now, failure_reason: body.reason || 'Provider command failed', acknowledgement_source: 'webhook', provider_response: body };
          if (update) await base44.asServiceRole.entities.TelematicsCommand.update(command.id, update);
        }
      } catch (ackError) {
        // Log the ACK processing error but do not fail the webhook response.
        // The device already sent the acknowledgement — preserving that fact is more important
        // than surfacing a secondary parse error.
        console.error('[receiveTelematicsWebhook] command ACK processing error (non-fatal):', ackError.message);
      }
    }

    return Response.json({ ok: true, event_id: event.id, booking_modified: false, payment_modified: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});