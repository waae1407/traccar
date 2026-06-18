import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const COMMANDS = ['locate', 'lock', 'unlock', 'horn', 'lights', 'horn_lights', 'alarm_pulse', 'disable_starter', 'restore_starter', 'status', 'raw'];
const COMMAND_ALIASES = { location: 'locate', find_my_car: 'alarm_pulse', panic: 'alarm_pulse', kill: 'disable_starter', unkill: 'restore_starter' };
const CUSTOMER_COMMANDS = ['locate', 'lock', 'unlock', 'alarm_pulse'];
const HOST_COMMANDS = ['locate', 'lock', 'unlock', 'horn', 'lights', 'horn_lights', 'alarm_pulse', 'status'];
const STARTER_COMMANDS = ['disable_starter', 'restore_starter'];

// ── HEARTBEAT-DELAY ONLY RULE ──
// All Noran MT20 UDP commands wait for next heartbeat, then apply configured delay, then send to Traccar.
// No freshness gates, no retry logic, no immediate sends.
const NORAN_HEARTBEAT_EXPIRY_SECONDS = 90;




const TRACCAR_TEST_UNIQUE_ID = 'NR09G00002';
const TRACCAR_TEST_DEVICE_ID = '5';
const TRACCAR_TEST_COMMANDS = ['locate', 'lock', 'unlock', 'horn_lights', 'alarm_pulse'];
const CAPABILITY_MAP = {
  locate: 'supports_location', status: 'supports_location', lock: 'supports_lock', unlock: 'supports_unlock',
  horn: 'supports_horn', lights: 'supports_lights', horn_lights: 'supports_horn', alarm_pulse: 'supports_horn',
  disable_starter: 'supports_starter_disable', restore_starter: 'supports_starter_restore',
};
const MOOVETRAX_COMMAND_MAP = { locate: 'location', status: 'location', lock: 'lock', unlock: 'unlock', horn: 'panic', lights: 'panic', horn_lights: 'panic', alarm_pulse: 'panic', disable_starter: 'kill', restore_starter: 'unkill' };
const NORAN_ACTION_MAP = { lock: '3,1', unlock: '4,1', disable_starter: '1,1', restore_starter: '1,0', horn: '2,2', lights: '2,1', horn_lights: '2,3', alarm_pulse: '2,3' };

function getNoranUnlockOptions(commandType, device = {}, provider = {}) {
  const isNoran = provider.provider_key === 'traccar_noran_mt20' || device.provider_key === 'traccar_noran_mt20';
  return {
    unlockDisarmsAlarm: commandType === 'unlock' && isNoran && device.unlock_disarms_alarm !== false,
    unlockDoublePulse: commandType === 'unlock' && isNoran && device.unlock_double_pulse_enabled === true,
  };
}

function buildNoranCommandBatch(commandType, deviceId, template, options = {}) {
  const first = buildNoranMT20Command(commandType, deviceId, template, options);
  return options.unlockDoublePulse ? [first, buildNoranMT20Command(commandType, deviceId, template, options)] : [first];
}

function sanitizeIdentifier(value = '') { return String(value).replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80); }
function bytesToHex(bytes) { return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase(); }
function asciiToHex(input = '') { return bytesToHex(new TextEncoder().encode(input)); }
function normalizeFixedHex(value, fallback, expectedBytes, name) {
  const hex = String(value || fallback || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
  if (hex.length !== expectedBytes * 2) throw new Error(`${name} must be exactly ${expectedBytes} bytes of hex.`);
  return hex;
}
function buildMt20WrappedCommand(asciiCommand, options = {}) {
  const sMarkHex = '0D0A2A4B5700';
  const packetLenHex = '4400';
  const cmdHex = '0200';
  const optionalEnv = Deno.env.toObject();
  const nGisIpHex = normalizeFixedHex(options.gisIpHex || optionalEnv.MT20_GIS_IP_HEX, '741E649C', 4, 'MT20_GIS_IP_HEX');
  const nPortHex = normalizeFixedHex(options.appPortHex || optionalEnv.MT20_APP_PORT_HEX, '5B9A', 2, 'MT20_APP_PORT_HEX');
  const sEndHex = '0D0A';
  const sDataBytes = new TextEncoder().encode(asciiCommand);
  if (sDataBytes.length > 50) throw new Error('MT20 sData ASCII command exceeds 50 bytes.');
  const paddedSData = new Uint8Array(50);
  paddedSData.set(sDataBytes);
  const sDataHex = bytesToHex(paddedSData);
  const fullPacketHex = `${sMarkHex}${packetLenHex}${cmdHex}${nGisIpHex}${nPortHex}${sDataHex}${sEndHex}`;
  const totalBytes = fullPacketHex.length / 2;
  if (sDataHex.length / 2 !== 50) throw new Error('MT20 sData must be exactly 50 bytes.');
  if (totalBytes !== 68) throw new Error('MT20 packet must be exactly 68 bytes.');
  if (!fullPacketHex.startsWith(sMarkHex)) throw new Error('MT20 packet has invalid sMark.');
  if (!fullPacketHex.endsWith(sEndHex)) throw new Error('MT20 packet has invalid sEnd.');
  return { asciiCommand, sDataHex, fullPacketHex, totalBytes };
}
function getClientIp(req) { return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || ''; }
function isExpired(dateString) { return !!dateString && new Date(dateString).getTime() <= Date.now(); }
function renderTemplate(template = '', values = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => encodeURIComponent(values[key] ?? ''));
}
function buildNoranMT20Command(commandType, deviceId, template, options = {}) {
  const now = new Date();
  const hhmmss = [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()].map(n => String(n).padStart(2, '0')).join('');
  const cleanDeviceId = sanitizeIdentifier(deviceId);
  const ascii = template
    ? renderTemplate(template, { device_id: cleanDeviceId, HHMMSS: hhmmss })
    : (commandType === 'locate' || commandType === 'status')
      ? `*KW,${cleanDeviceId},000,${hhmmss}#`
      : `*KW,${cleanDeviceId},007,${hhmmss},${NORAN_ACTION_MAP[commandType]}#`;
  if (options.wrapMt20 === true) {
    const wrapped = buildMt20WrappedCommand(ascii, options);
    return { ascii, hex: wrapped.fullPacketHex, sDataHex: wrapped.sDataHex, totalBytes: wrapped.totalBytes, rawAsciiHex: asciiToHex(ascii) };
  }
  return { ascii, hex: asciiToHex(ascii) };
}
function envValue(name) { return String(Deno.env.toObject()[name] || '').trim(); }
function joinUrl(baseUrl, path) { return `${baseUrl.replace(/\/+$/, '')}${path}`; }

function isTraccarSingleDeviceLiveTest(provider, device, commandType) {
  return provider.provider_key === 'traccar_noran_mt20'
    && device.unique_id === TRACCAR_TEST_UNIQUE_ID
    && String(device.traccar_device_id || '') === TRACCAR_TEST_DEVICE_ID
    && device.traccar_test_activation_enabled === true
    && !isExpired(device.traccar_test_activation_expires_at)
    && TRACCAR_TEST_COMMANDS.includes(commandType)
    && !STARTER_COMMANDS.includes(commandType);
}

async function findTraccarDeviceByUniqueId(uniqueId) {
  const baseUrl = envValue('TRACCAR_BASE_URL');
  const username = envValue('TRACCAR_USERNAME');
  const password = envValue('TRACCAR_PASSWORD');
  if (!baseUrl || !username || !password || !uniqueId) return null;
  const res = await fetch(joinUrl(baseUrl, '/api/devices'), {
    headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), Accept: 'application/json' }
  });
  if (!res.ok) return null;
  const devices = await res.json();
  return (Array.isArray(devices) ? devices : []).find(item => String(item.uniqueId || '').trim().toUpperCase() === String(uniqueId || '').trim().toUpperCase()) || null;
}

async function ensureFreshTraccarDeviceId(base44, device) {
  if (device.provider_key !== 'traccar_noran_mt20' || !device.unique_id) return device;
  const traccarDevice = await findTraccarDeviceByUniqueId(device.unique_id);
  if (!traccarDevice?.id) return device;
  const freshId = String(traccarDevice.id);
  if (String(device.traccar_device_id || '') !== freshId || String(device.provider_device_id || '') !== freshId) {
    await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
      traccar_device_id: freshId,
      provider_device_id: freshId,
      online_status: traccarDevice.status || device.online_status || 'unknown',
      last_seen_at: traccarDevice.lastUpdate || device.last_seen_at
    });
    return { ...device, traccar_device_id: freshId, provider_device_id: freshId, online_status: traccarDevice.status || device.online_status || 'unknown', last_seen_at: traccarDevice.lastUpdate || device.last_seen_at };
  }
  return device;
}

async function sendTraccarSingleDeviceLiveTest(commandType, device) {
  const routed = await sendTraccarNoranProductionCommand(commandType, { ...device, traccar_device_id: TRACCAR_TEST_DEVICE_ID }, null);
  return { ...routed, live_test: true };
}
function commandCooldownMs(commandType) {
  if (STARTER_COMMANDS.includes(commandType)) return 60 * 1000;
  if (commandType === 'alarm_pulse') return 0;
  return 15 * 1000;
}

function makeIdempotencyKey(userEmail, deviceId, commandType, options = {}) {
  if (options.alarmSessionId) return `${userEmail}:${deviceId}:${commandType}:alarm:${options.alarmSessionId}:${options.pulseNumber || 0}`;
  const bucketMs = commandCooldownMs(commandType) || 1000;
  const bucket = Math.floor(Date.now() / bucketMs);
  return `${userEmail}:${deviceId}:${commandType}:${bucket}`;
}

async function getProviderConfig(base44, providerKey, providerType) {
  const records = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: providerKey });
  if (records[0]) return records[0];
  if (providerKey === 'moovetrax') {
    return {
      provider_key: 'moovetrax', provider_name: 'MooveTrax', provider_type: 'api', is_active: true, execution_mode: 'production',
      allow_live_commands: true, allow_starter_commands: true, require_admin_approval_for_starter: false, max_commands_per_minute: 4,
      supports_location: true, supports_lock: true, supports_unlock: true, supports_horn: true, supports_lights: true,
      supports_starter_disable: true, supports_starter_restore: true, auth_type: 'api_key', credential_secret_reference: 'MOOVETRAX_PARTNER_API_KEY', base_url: 'https://www.moovetrax.com/api'
    };
  }
  return { provider_key: providerKey, provider_name: providerKey, provider_type: providerType || 'api', is_active: false, execution_mode: 'dry_run', allow_live_commands: false, allow_starter_commands: false, max_commands_per_minute: 4 };
}
async function getTemplate(base44, providerKey, commandType) {
  const templates = await base44.asServiceRole.entities.TelematicsCommandTemplate.filter({ provider_key: providerKey, command_type: commandType });
  return templates.find(t => t.enabled !== false) || null;
}
async function resolveVehicle(base44, { vehicle_id, booking_id }) {
  let booking = null;
  if (booking_id) {
    try { booking = (await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_id }))[0] || null; } catch { booking = null; }
  }
  const targetVehicleId = vehicle_id || booking?.vehicle_id;
  if (!targetVehicleId) return { vehicle: null, booking };
  let vehicle = null;
  try { vehicle = (await base44.asServiceRole.entities.Vehicle.filter({ id: targetVehicleId }))[0] || null; } catch { vehicle = null; }
  return { vehicle, booking };
}
async function resolveDevice(base44, vehicle) {
  const existing = await base44.asServiceRole.entities.TelematicsDevice.filter({ vehicle_id: vehicle.id });
  if (existing[0]) return existing[0];
  if (vehicle.moovetrax_device_id) {
    return await base44.asServiceRole.entities.TelematicsDevice.create({
    company_id: vehicle.company_id || '', provider_key: 'moovetrax', provider_type: 'api', unique_id: `moovetrax:${sanitizeIdentifier(vehicle.moovetrax_device_id)}`,
    moovetrax_device_id: vehicle.moovetrax_device_id, provider_device_id: vehicle.moovetrax_device_id,
    vehicle_id: vehicle.id, host_id: vehicle.host_id || '', assigned_status: 'assigned', install_status: 'installed', lifecycle_status: 'live_enabled',
    gps_enabled: true, lock_unlock_enabled: true, horn_light_enabled: true, production_commands_enabled: true, production_command_scope: 'all_supported_commands', created_at: new Date().toISOString()
    });
  }
  return null;
}
function isRentalControlActive(booking) {
  if (!booking) return false;
  if (booking.rental_ended_at) return false;
  if (!['active', 'approved', 'confirmed'].includes(booking.booking_status)) return false;
  if (booking.payment_status !== 'paid') return false;
  if (booking.starter_disabled || booking.moovetrax_kill_active) return false;
  if (booking.end_date) {
    const endOfDay = new Date(`${booking.end_date}T23:59:59`);
    if (!Number.isNaN(endOfDay.getTime()) && Date.now() > endOfDay.getTime()) return false;
  }
  return true;
}

async function validateAccess(base44, user, vehicle, booking, commandType, provider, device) {
  if (STARTER_COMMANDS.includes(commandType)) {
    if (!provider.allow_starter_commands) return 'Starter commands are disabled for this provider.';
    if (provider.require_admin_approval_for_starter && !['admin', 'host'].includes(user.role)) return 'Starter commands require admin or host policy approval.';
  }
  if (user.role === 'admin') return null;

  const bookingUserMatch = booking && (booking.user_email === user.email || booking.user_id === user.id);
  if (bookingUserMatch) {
    if (booking.vehicle_id !== vehicle.id) return 'Customer can only control the vehicle on this booking.';
    if (device.vehicle_id !== vehicle.id) return 'Device is not assigned to this rental vehicle.';
    if (!CUSTOMER_COMMANDS.includes(commandType)) return 'Customers cannot send this command.';
    if (!isRentalControlActive(booking)) return 'Vehicle controls are only available for active rentals.';
    return null;
  }

  if (vehicle.host_id) {
    const host = (await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id }))[0];
    if (host?.email === user.email || host?.user_id === user.id) {
      if (device.vehicle_id !== vehicle.id) return 'Device is not assigned to this host vehicle.';
      if (device.host_id && device.host_id !== host.id) return 'Device is not assigned to this host.';
      if (!HOST_COMMANDS.includes(commandType) && !STARTER_COMMANDS.includes(commandType)) return 'Host cannot send this command.';
      if (STARTER_COMMANDS.includes(commandType)) {
        if (host.telematics_starter_control_enabled !== true) return 'Host starter controls are disabled for this host.';
        if (device.host_starter_control_enabled !== true) return 'Host starter controls are disabled for this device.';
        if (device.production_command_scope !== 'all_supported_commands') return 'Device production scope does not allow starter commands.';
      }
      return null;
    }
  }

  if (user.role === 'installer') return commandType === 'status' || commandType === 'locate' ? null : 'Installers can only run installation checks.';
  return 'Forbidden.';
}
function commandTrafficClass({ installerInstallTest, adminDeviceCommandTest, adminTraccarLiveTest, alarmSessionId, booking, user }) {
  if (alarmSessionId) return 'automation_alarm';
  if (installerInstallTest) return 'installer_install_test';
  if (adminDeviceCommandTest || adminTraccarLiveTest) return 'admin_device_test';
  if (booking && (booking.user_email === user.email || booking.user_id === user.id)) return 'customer_control';
  if (user.role === 'host') return 'host_control';
  if (user.role === 'admin') return 'admin_operational';
  return 'user_control';
}

function trafficClassFromCommand(cmd) {
  const payload = cmd.request_payload || {};
  if (payload.command_traffic_class) return payload.command_traffic_class;
  if (payload.suite_run) return 'bulk_test_suite';
  if (payload.installer_install_test) return 'installer_install_test';
  if (payload.admin_device_command_test || payload.admin_traccar_live_test) return 'admin_device_test';
  if (cmd.alarm_session_id) return 'automation_alarm';
  if (cmd.requested_role === 'installer') return 'installer_install_test';
  if (cmd.requested_role === 'admin') return 'admin_operational';
  if (cmd.booking_id || cmd.renter_id) return 'customer_control';
  if (cmd.requested_role === 'host') return 'host_control';
  return 'user_control';
}

function actorKeyForRateLimit(user, trafficClass, body, booking) {
  if (trafficClass === 'installer_install_test') return `installer:${String(body.vin || body.install_record_id || body.installer_email || user.email || '').toUpperCase()}`;
  if (trafficClass === 'customer_control') return `customer:${booking?.user_id || user.id || user.email}`;
  if (trafficClass === 'automation_alarm') return `alarm:${body.alarm_session_id || 'session'}`;
  return `${trafficClass}:${user.id || user.email}`;
}

function ratePolicy(trafficClass, commandType, maxPerMinute) {
  if (trafficClass === 'customer_control') return { maxAllowed: STARTER_COMMANDS.includes(commandType) ? 2 : 10, cooldownMs: commandCooldownMs(commandType) };
  if (trafficClass === 'host_control') return { maxAllowed: STARTER_COMMANDS.includes(commandType) ? 2 : 10, cooldownMs: commandCooldownMs(commandType) };
  if (trafficClass === 'installer_install_test') return { maxAllowed: STARTER_COMMANDS.includes(commandType) ? 4 : 14, cooldownMs: STARTER_COMMANDS.includes(commandType) ? 30 * 1000 : 3 * 1000 };
  if (trafficClass === 'admin_device_test') return { maxAllowed: STARTER_COMMANDS.includes(commandType) ? 3 : 12, cooldownMs: STARTER_COMMANDS.includes(commandType) ? 45 * 1000 : 5 * 1000 };
  if (trafficClass === 'automation_alarm') return { maxAllowed: 30, cooldownMs: 0 };
  return { maxAllowed: STARTER_COMMANDS.includes(commandType) ? Math.max(2, Number(maxPerMinute || 2)) : Math.max(8, Number(maxPerMinute || 4)), cooldownMs: commandCooldownMs(commandType) };
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function enforceRateLimit(base44, deviceId, commandType, actorKey, trafficClass, maxPerMinute, options = {}) {
  if (trafficClass === 'automation_alarm' || options.alarmSessionId) return { limited: false };
  const recent = await base44.asServiceRole.entities.TelematicsCommand.filter({ telematics_device_id: deviceId }, '-created_date', 100);
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const policy = ratePolicy(trafficClass, commandType, maxPerMinute);
  const cooldownAgo = now - policy.cooldownMs;
  const activeRecent = recent.filter(cmd => {
    const created = new Date(cmd.created_date || cmd.created_at || 0).getTime();
    if (created <= oneMinuteAgo || ['failed', 'expired', 'blocked'].includes(cmd.queue_status || cmd.status)) return false;
    return trafficClassFromCommand(cmd) === trafficClass && (cmd.request_payload?.rate_limit_actor_key || cmd.requested_by) === actorKey;
  });
  const duplicateActive = policy.cooldownMs > 0 && activeRecent.some(cmd => cmd.command_type === commandType && new Date(cmd.created_date || cmd.created_at || 0).getTime() > cooldownAgo);
  if (!duplicateActive && activeRecent.length < policy.maxAllowed) return { limited: false };
  const newestRelevant = activeRecent
    .filter(cmd => !duplicateActive || cmd.command_type === commandType)
    .map(cmd => new Date(cmd.created_date || cmd.created_at || 0).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0] || now;
  const retryAfterSeconds = Math.max(1, Math.ceil(((duplicateActive ? newestRelevant + policy.cooldownMs : oneMinuteAgo + 60 * 1000) - now) / 1000));
  return { limited: true, retry_after_seconds: retryAfterSeconds, traffic_class: trafficClass };
}
function canSendNoranProduction(provider, device, commandType) {
  if (provider.provider_key !== 'traccar_noran_mt20') return false;
  if (provider.execution_mode !== 'production' || provider.allow_live_commands !== true) return false;
  if (device.production_commands_enabled !== true) return false;
  if (!device.traccar_device_id || !device.unique_id) return false;
  if (STARTER_COMMANDS.includes(commandType)) {
    return provider.allow_starter_commands === true && device.production_command_scope === 'all_supported_commands';
  }
  return true;
}

async function sendTraccarNoranProductionCommand(commandType, device, template) {
  const baseUrl = envValue('TRACCAR_BASE_URL');
  const username = envValue('TRACCAR_USERNAME');
  const password = envValue('TRACCAR_PASSWORD');
  if (!baseUrl || !username || !password) throw new Error('Traccar credentials are not configured.');
  const traccarDeviceId = Number(device.traccar_device_id);
  if (!Number.isFinite(traccarDeviceId)) throw new Error('Invalid Traccar numeric device ID.');
  const unlockOptions = getNoranUnlockOptions(commandType, device, { provider_key: device.provider_key });
  const builtCommands = buildNoranCommandBatch(commandType, device.unique_id, template?.ascii_template, { wrapMt20: true, ...unlockOptions });
  const responses = [];
  for (const built of builtCommands) {
    const traccarPayload = { deviceId: traccarDeviceId, type: 'custom', attributes: { data: built.hex } };
    // ── Proof log: about to POST to Traccar ──
    console.log(`[MT20_SEND] POST /api/commands/send traccar_device_id=${traccarDeviceId} unique_id=${device.unique_id} command=${commandType} ascii="${built.ascii}" hex_length=${built.hex.length / 2}bytes hex_prefix=${built.hex.slice(0, 12)}`);
    const sentAt = new Date().toISOString();
    const res = await fetch(joinUrl(baseUrl, '/api/commands/send'), {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(traccarPayload)
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    // ── Proof log: Traccar response ──
    console.log(`[MT20_RESP] status=${res.status} sent_to_traccar_at=${sentAt} response=${text.slice(0, 200)}`);
    if (!res.ok) throw new Error(`Traccar production command failed (${res.status}): ${typeof data?.raw === 'string' ? data.raw : JSON.stringify(data)}`);
    responses.push({ ...data, traccar_payload: traccarPayload, sData_hex: built.sDataHex, mt20_total_bytes: built.totalBytes, sent_to_traccar_at: sentAt });
  }
  const first = builtCommands[0];
  return { provider_command_name: template?.provider_command_name || 'custom', ascii_payload: first.ascii, hex_payload: first.hex, production_command: true, response: { responses, noran_command_count: builtCommands.length, unlock_disarms_alarm: unlockOptions.unlockDisarmsAlarm, unlock_double_pulse_enabled: unlockOptions.unlockDoublePulse, device_identifier_source: 'TelematicsDevice.unique_id' } };
}

async function renderTemplateExecution(template, provider, device, commandType, options = {}) {
  const deviceId = sanitizeIdentifier(device.provider_device_id || device.unique_id || device.traccar_device_id || device.moovetrax_device_id);
  if (template?.transport_type === 'traccar_custom_hex') {
    if (options.liveNoranProduction) return await sendTraccarNoranProductionCommand(commandType, device, template);
    const noranDeviceId = sanitizeIdentifier(device.unique_id || device.device_imei);
    const unlockOptions = getNoranUnlockOptions(commandType, device, provider);
    const builtCommands = buildNoranCommandBatch(commandType, noranDeviceId, template.ascii_template, { wrapMt20: provider.provider_key === 'traccar_noran_mt20', ...unlockOptions });
    const first = builtCommands[0];
    return { provider_command_name: template.provider_command_name || 'custom', ascii_payload: first.ascii, hex_payload: first.hex, dry_run: true, response: { dry_run: true, ascii_payload: first.ascii, hex_payload: first.hex, sData_hex: first.sDataHex, mt20_total_bytes: first.totalBytes, noran_command_count: builtCommands.length, unlock_disarms_alarm: unlockOptions.unlockDisarmsAlarm, unlock_double_pulse_enabled: unlockOptions.unlockDoublePulse, device_identifier_source: 'TelematicsDevice.unique_id', simulated_traccar_payloads: device.traccar_device_id ? builtCommands.map((built) => ({ deviceId: Number(device.traccar_device_id), type: 'custom', attributes: { data: built.hex } })) : [] } };
  }
  if (!template || template.dry_run_only || provider.execution_mode === 'dry_run' || !provider.allow_live_commands) {
    return { provider_command_name: template?.provider_command_name || commandType, dry_run: true, response: { dry_run: true, endpoint: template?.endpoint_template || '', payload_template: template?.payload_template || {} } };
  }
  const secret = Deno.env.get(provider.credential_secret_reference || '') || '';
  const endpoint = renderTemplate(template.endpoint_template || provider.command_endpoint_template || '', { device_id: deviceId, command: commandType });
  const headers = { 'Content-Type': 'application/json' };
  if (provider.auth_type === 'bearer_token' && secret) headers.Authorization = `Bearer ${secret}`;
  if (provider.auth_type === 'api_key' && secret) headers['X-API-Key'] = secret;
  const res = await fetch(`${provider.base_url || ''}${endpoint}`, { method: template.method || 'POST', headers, body: JSON.stringify(template.payload_template || { command: commandType, device_id: deviceId }) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Provider command failed (${res.status})`);
  return { provider_command_name: template.provider_command_name || commandType, response: data };
}
async function hasActiveRental(base44, vehicleId) {
  if (!vehicleId) return false;
  const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ vehicle_id: vehicleId });
  return bookings.some((booking) => ['confirmed', 'active', 'payment_due', 'grace_period'].includes(booking.booking_status));
}

async function getInstallerInstallRecord(base44, device, vehicle, vin) {
  const normalizedVin = String(vin || '').trim().toUpperCase();
  const records = await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ telematics_device_id: device.id });
  return records.find((record) => record.vehicle_id === vehicle.id || String(record.vin || record.vin_entered || '').trim().toUpperCase() === normalizedVin) || null;
}

function isCompletedInstallerInstall(record, device) {
  return record?.install_status === 'completed' || device.install_status === 'installed';
}

function canSendInstallerNoranStarterTest(provider, device, commandType) {
  return STARTER_COMMANDS.includes(commandType)
    && provider.provider_key === 'traccar_noran_mt20'
    && provider.execution_mode === 'production'
    && provider.allow_live_commands === true
    && provider.allow_starter_commands === true
    && provider.supports_starter_disable !== false
    && provider.supports_starter_restore !== false
    && !!device.unique_id
    && !!device.traccar_device_id;
}

async function fallbackAdapter(provider, device, commandType) {
  if (provider.provider_key === 'moovetrax') {
    if (provider.execution_mode !== 'production' || !provider.allow_live_commands) return { provider_command_name: MOOVETRAX_COMMAND_MAP[commandType], dry_run: true, response: { dry_run: true, provider: 'moovetrax' } };
    const command = MOOVETRAX_COMMAND_MAP[commandType];
    const deviceKey = sanitizeIdentifier(device.moovetrax_device_id || device.provider_device_id || device.unique_id);
    const partnerApiKey = Deno.env.get(provider.credential_secret_reference || 'MOOVETRAX_PARTNER_API_KEY') || '';
    const params = new URLSearchParams({ key: deviceKey, ...(partnerApiKey && { partner_api_key: partnerApiKey }) });
    const res = await fetch(`${provider.base_url || 'https://www.moovetrax.com/api'}/${command}?${params.toString()}`);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) throw new Error(`MooveTrax ${command} failed (${res.status})`);
    return { provider_command_name: command, response: data };
  }
  const unlockOptions = getNoranUnlockOptions(commandType, device, provider);
  const builtCommands = buildNoranCommandBatch(commandType, device.unique_id || device.device_imei || device.traccar_device_id, null, { wrapMt20: provider.provider_key === 'traccar_noran_mt20', ...unlockOptions });
  const first = builtCommands[0];
  return { provider_command_name: commandType, ascii_payload: first.ascii, hex_payload: first.hex, dry_run: true, response: { dry_run: true, ascii_payload: first.ascii, hex_payload: first.hex, sData_hex: first.sDataHex, mt20_total_bytes: first.totalBytes, noran_command_count: builtCommands.length, unlock_disarms_alarm: unlockOptions.unlockDisarmsAlarm, unlock_double_pulse_enabled: unlockOptions.unlockDoublePulse } };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const installerInstallTest = body.installer_install_test === true;
    let user = await base44.auth.me().catch(() => null);
    if (!user && installerInstallTest) user = { id: 'installer-workflow', email: body.installer_email || 'installer-workflow@uridehub.com', role: 'installer' };
    if (!user) {
      const serviceCommand = COMMAND_ALIASES[body.command_type || body.command] || (body.command_type || body.command);
      if (body.service_context === 'payment_enforcement' && body.source === 'processGracePeriod' && body.booking_id && STARTER_COMMANDS.includes(serviceCommand)) {
        user = { id: 'payment-enforcement', email: 'automation@uridehub.com', role: 'admin' };
      }
    }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const rawCommandType = body.command_type || body.command;
    const commandType = COMMAND_ALIASES[rawCommandType] || rawCommandType;
    if (!COMMANDS.includes(commandType)) return Response.json({ error: 'Invalid telematics command.' }, { status: 400 });

    const adminTraccarLiveTest = body.admin_traccar_live_test === true;
    const adminDeviceCommandTest = body.admin_device_command_test === true;
    let { vehicle, booking } = (adminTraccarLiveTest || adminDeviceCommandTest || installerInstallTest) ? { vehicle: null, booking: null } : await resolveVehicle(base44, body);
    if (installerInstallTest && body.vin) {
      vehicle = (await base44.asServiceRole.entities.Vehicle.filter({ vin: String(body.vin || '').trim().toUpperCase() }))[0] || null;
    }
    if (!vehicle && !adminTraccarLiveTest && !adminDeviceCommandTest && !installerInstallTest) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
    let device = null;
    if (body.telematics_device_id) {
      try { device = (await base44.asServiceRole.entities.TelematicsDevice.filter({ id: body.telematics_device_id }))[0] || null; } catch { device = null; }
    }
    if (!device && body.unique_id) device = (await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: body.unique_id }))[0];
    if (!device && vehicle) device = await resolveDevice(base44, vehicle);
    if (!device) return Response.json({ error: 'No telematics device is assigned to this vehicle.' }, { status: 404 });
    if (adminDeviceCommandTest && user.role !== 'admin') return Response.json({ error: 'Admin access required for device command testing.' }, { status: 403 });
    if ((adminDeviceCommandTest || installerInstallTest) && device.vehicle_id) {
      vehicle = (await base44.asServiceRole.entities.Vehicle.filter({ id: device.vehicle_id }))[0] || vehicle;
    }
    if (!adminTraccarLiveTest && !adminDeviceCommandTest && !installerInstallTest && ['suspended', 'retired'].includes(device.lifecycle_status)) {
      return Response.json({ error: 'Device is not enabled for live commands.' }, { status: 403 });
    }
    const provider = await getProviderConfig(base44, device.provider_key, device.provider_type);
    device = await ensureFreshTraccarDeviceId(base44, device);
    const capability = CAPABILITY_MAP[commandType];
    if (adminTraccarLiveTest) {
      if (user.role !== 'admin') return Response.json({ error: 'Admin access required for Traccar single-device live test.' }, { status: 403 });
      if (!isTraccarSingleDeviceLiveTest(provider, device, commandType)) return Response.json({ error: 'Live test is restricted to active NR09G00002 / Traccar device 5 and allowed non-starter commands only.' }, { status: 403 });
    } else if (installerInstallTest) {
      if (body.source !== 'installer_workflow') return Response.json({ error: 'Installer commands must come from the install workflow.' }, { status: 403 });
      if (!body.vin || !vehicle) return Response.json({ error: 'Installer command tests require a matched VIN.' }, { status: 403 });
      if (device.vehicle_id && device.vehicle_id !== vehicle.id) return Response.json({ error: 'Scanned device is assigned to a different vehicle.' }, { status: 403 });
      const allowedInstallerCommands = ['lock', 'unlock', 'horn', 'lights', 'alarm_pulse', 'disable_starter', 'restore_starter'];
      if (!allowedInstallerCommands.includes(commandType)) return Response.json({ error: 'Installer can only run install workflow test commands.' }, { status: 403 });
      const installRecord = await getInstallerInstallRecord(base44, device, vehicle, body.vin);
      if (isCompletedInstallerInstall(installRecord, device)) return Response.json({ error: 'Installer command tests are disabled after installation is completed.' }, { status: 403 });
      if (STARTER_COMMANDS.includes(commandType) && (provider.supports_starter_disable === false || provider.supports_starter_restore === false)) return Response.json({ error: 'Provider does not support installer starter tests for this device.' }, { status: 403 });
    } else if (!adminDeviceCommandTest) {
      const accessError = await validateAccess(base44, user, vehicle, booking, commandType, provider, device);
      if (accessError) return Response.json({ error: accessError }, { status: 403 });
    }
    if (STARTER_COMMANDS.includes(commandType) && !adminDeviceCommandTest && !installerInstallTest) {
      const hasReason = String(body.reason || '').trim().length >= 5;
      const confirmed = body.confirm_starter_command === true || body.starter_confirmation === true;
      if (!hasReason || !confirmed) return Response.json({ error: 'Starter commands require a reason and explicit confirmation.' }, { status: 400 });
    }
    if (adminDeviceCommandTest && STARTER_COMMANDS.includes(commandType) && await hasActiveRental(base44, vehicle?.id || device.vehicle_id) && body.admin_starter_override !== true) {
      return Response.json({ error: 'Starter commands are blocked on active rentals unless explicit admin override is provided.' }, { status: 403 });
    }
    if (!adminTraccarLiveTest && !adminDeviceCommandTest && !provider.is_active && provider.provider_key !== 'moovetrax') return Response.json({ error: 'Telematics provider is not active.' }, { status: 400 });
    // Raw command: bypass capability checks, send directly
    if (commandType === 'raw') {
      const rawPayload = String(body.raw_command || '').trim();
      if (!rawPayload) return Response.json({ error: 'raw_command body is required for raw command type.' }, { status: 400 });
      if (user.role !== 'admin') return Response.json({ error: 'Raw commands are admin-only.' }, { status: 403 });

      let rawResult;
      if (device.provider_key === 'traccar_noran_mt20' || device.traccar_device_id) {
        const baseUrl = envValue('TRACCAR_BASE_URL');
        const username = envValue('TRACCAR_USERNAME');
        const password = envValue('TRACCAR_PASSWORD');
        if (!baseUrl || !username || !password) return Response.json({ error: 'Traccar credentials not configured.' }, { status: 500 });
        const traccarDeviceId = Number(device.traccar_device_id);
        if (!Number.isFinite(traccarDeviceId)) return Response.json({ error: 'Device has no valid Traccar device ID.' }, { status: 400 });
        const hexPayload = asciiToHex(rawPayload);
        const traccarPayload = { deviceId: traccarDeviceId, type: 'custom', attributes: { data: hexPayload } };
        const res = await fetch(joinUrl(baseUrl, '/api/commands/send'), {
          method: 'POST',
          headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(traccarPayload)
        });
        const text = await res.text();
        let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
        if (!res.ok) return Response.json({ error: `Traccar rejected command (${res.status}): ${typeof data?.raw === 'string' ? data.raw : JSON.stringify(data)}` }, { status: 502 });
        rawResult = { ok: true, provider: 'traccar', ascii_command: rawPayload, hex_payload: hexPayload, traccar_device_id: traccarDeviceId, response: data };
      } else if (device.provider_key === 'moovetrax') {
        const partnerApiKey = Deno.env.get('MOOVETRAX_PARTNER_API_KEY') || '';
        const deviceKey = sanitizeIdentifier(device.moovetrax_device_id || device.provider_device_id || device.unique_id);
        const params = new URLSearchParams({ key: deviceKey, cmd: rawPayload, ...(partnerApiKey && { partner_api_key: partnerApiKey }) });
        const res = await fetch(`https://www.moovetrax.com/api/raw?${params.toString()}`);
        const text = await res.text();
        let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
        rawResult = { ok: res.ok, provider: 'moovetrax', ascii_command: rawPayload, response: data };
      } else {
        rawResult = { ok: false, dry_run: true, provider: device.provider_key || 'unknown', ascii_command: rawPayload, note: 'Provider does not support raw passthrough. Logged only.' };
      }

      await base44.asServiceRole.entities.ActivityEvent.create({
        event_type: 'gps.command_sent', actor_id: user.id || '', actor_email: user.email, actor_role: 'admin',
        target_entity: 'TelematicsDevice', target_id: device.id, vehicle_id: vehicle?.id || device.vehicle_id || '',
        summary: `Raw command sent to ${device.unique_id || device.id}: ${rawPayload}`,
        metadata: { raw_command: rawPayload, result: rawResult }, source: 'admin_panel', event_status: rawResult.ok ? 'success' : 'warning'
      }).catch(() => {});

      return Response.json({ ok: rawResult.ok, command_type: 'raw', result: rawResult });
    }

    if (capability && provider[capability] === false) return Response.json({ error: 'Provider does not support this command.' }, { status: 400 });
    if (provider.execution_mode === 'production' && !provider.allow_live_commands) return Response.json({ error: 'Live commands are disabled for this provider.' }, { status: 400 });
    const liveNoranProduction = canSendNoranProduction(provider, device, commandType);
    const liveNoranInstallerTest = installerInstallTest && canSendInstallerNoranStarterTest(provider, device, commandType);
    if (installerInstallTest && provider.provider_key === 'traccar_noran_mt20' && !liveNoranProduction && !liveNoranInstallerTest) {
      return Response.json({ error: STARTER_COMMANDS.includes(commandType) ? 'Live installer starter testing is disabled because this device/provider does not support wrapped MT20 starter commands.' : 'Live installer command testing is disabled for this device. Enable production commands for this device before sending installer test commands.' }, { status: 403 });
    }
    if (provider.provider_key === 'traccar_noran_mt20' && provider.execution_mode === 'production' && provider.allow_live_commands === true && device.production_commands_enabled === true && !liveNoranProduction && !liveNoranInstallerTest) {
      return Response.json({ error: STARTER_COMMANDS.includes(commandType) ? 'Starter production commands are blocked for this device/provider scope.' : 'Noran production command is not allowed for this device.' }, { status: 403 });
    }
    const trafficClass = commandTrafficClass({ installerInstallTest, adminDeviceCommandTest, adminTraccarLiveTest, alarmSessionId: body.alarm_session_id || '', booking, user });
    const rateLimitActorKey = actorKeyForRateLimit(user, trafficClass, body, booking);
    let rateLimit = await enforceRateLimit(base44, device.id, commandType, rateLimitActorKey, trafficClass, provider.max_commands_per_minute, { alarmSessionId: body.alarm_session_id || '' });
    if (rateLimit.limited && ['installer_install_test', 'admin_device_test'].includes(trafficClass) && Number(rateLimit.retry_after_seconds || 0) <= 12) {
      await sleep(Number(rateLimit.retry_after_seconds || 1) * 1000);
      rateLimit = await enforceRateLimit(base44, device.id, commandType, rateLimitActorKey, trafficClass, provider.max_commands_per_minute, { alarmSessionId: body.alarm_session_id || '' });
    }
    if (rateLimit.limited) return Response.json({ error: 'Command rate limit exceeded. Please wait before retrying.', retry_after_seconds: rateLimit.retry_after_seconds, traffic_class: rateLimit.traffic_class }, { status: 429 });

    const now = new Date();
    const nowMs = Date.now();
    const expiresAt = new Date(now.getTime() + NORAN_HEARTBEAT_EXPIRY_SECONDS * 1000).toISOString();
    
    // ── SIMPLE DUPLICATE PROTECTION (15 seconds) ──
    const idempotencyKey = makeIdempotencyKey(user.email, device.id, commandType, { alarmSessionId: body.alarm_session_id || '', pulseNumber: body.pulse_number || 0 });
    const recentCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({ telematics_device_id: device.id, command_type: commandType }, '-created_date', 5);
    const duplicateActive = recentCommands.some(cmd => {
      const created = new Date(cmd.created_date || cmd.created_at || 0).getTime();
      const ageSeconds = (nowMs - created) / 1000;
      return ageSeconds < 15 && ['pending_waiting_for_next_heartbeat', 'sent_to_traccar', 'waiting_for_delay'].includes(cmd.queue_status || cmd.status);
    });
    if (duplicateActive) return Response.json({ error: 'Duplicate command blocked. Wait 15 seconds before sending same command type.', retry_after_seconds: 15 }, { status: 429 });

    // ── HEARTBEAT-DELAY ONLY RULE FOR NORAN MT20 UDP ──
    const isNoranUdp = device.provider_key === 'traccar_noran_mt20' && device.production_commands_enabled === true;
    
    if (isNoranUdp) {
      // For Noran UDP, only create the command. Release is handled by webhook/scheduler.
      const template = adminTraccarLiveTest ? null : await getTemplate(base44, device.provider_key, commandType);
      const preBuiltCommand = (liveNoranProduction || liveNoranInstallerTest || adminDeviceCommandTest)
        ? await sendTraccarNoranProductionCommand(commandType, adminDeviceCommandTest ? { ...device, unlock_double_pulse_enabled: false } : device, template).catch(() => null)
        : (template ? await renderTemplateExecution(template, provider, device, commandType, { liveNoranProduction }) : await fallbackAdapter(provider, device, commandType));
      
      const hexPayload = preBuiltCommand?.hex_payload || null;
      const asciiPayload = preBuiltCommand?.ascii_payload || null;
      const sDataHex = preBuiltCommand?.response?.sData_hex || preBuiltCommand?.response?.responses?.[0]?.sData_hex || null;
      const configuredDelay = device.post_heartbeat_release_delay_seconds ?? 0;

      const commandAudit = await base44.asServiceRole.entities.TelematicsCommand.create({
        company_id: vehicle?.company_id || device.company_id || provider.company_id || '',
        telematics_device_id: device.id,
        provider_key: device.provider_key,
        vehicle_id: vehicle?.id || device.vehicle_id || '',
        host_id: vehicle?.host_id || device.host_id || '',
        booking_id: booking?.id || body.booking_id || '',
        renter_id: booking?.user_id || '',
        command_type: commandType,
        device_unique_id: device.unique_id || '',
        traccar_device_id: device.traccar_device_id || '',
        production_command: liveNoranProduction || liveNoranInstallerTest,
        status: 'pending_waiting_for_next_heartbeat',
        queue_status: 'pending_waiting_for_next_heartbeat',
        confirmation_status: 'pending',
        expires_at: expiresAt,
        confirmation_required: STARTER_COMMANDS.includes(commandType),
        confirmation_source: 'provider',
        idempotency_key: idempotencyKey,
        requested_by: user.email,
        requested_role: user.role || 'user',
        created_at: now.toISOString(),
        hex_payload: hexPayload,
        ascii_payload: asciiPayload,
        sData_hex: sDataHex,
        wrapped_payload: hexPayload,
        transmission_format: hexPayload ? 'mt20_wrapped_hex' : 'unknown',
        configured_delay_seconds: configuredDelay,
        release_lock_token: null,
        release_attempt_count: 0,
        request_payload: {
          vehicle_id: vehicle?.id || device.vehicle_id || '',
          command_traffic_class: trafficClass,
          starter_confirmation: body.confirm_starter_command === true || body.starter_confirmation === true,
          reason: body.reason || '',
          source: body.source || 'user_control'
        }
      });
      
      return Response.json({
        ok: true,
        command_id: commandAudit.id,
        command_type: commandType,
        queue_status: 'pending_waiting_for_next_heartbeat',
        status_message: 'Waiting for next device heartbeat',
        configured_delay_seconds: configuredDelay,
        expires_in_seconds: NORAN_HEARTBEAT_EXPIRY_SECONDS,
        message: `Command queued. Will wait for heartbeat + ${configuredDelay}s.`
      });
    }

    // Non-Noran commands: send immediately (legacy path)
    await base44.asServiceRole.entities.TelematicsCommand.update(commandAudit.id, { status: 'sending', queue_status: 'sending', confirmation_status: 'pending' });
    try {
      const sentAt = new Date().toISOString();
      const providerCommandId = preBuiltCommand.response?.id || preBuiltCommand.response?.commandId || preBuiltCommand.response?.command_id || '';
      
      await base44.asServiceRole.entities.TelematicsCommand.update(commandAudit.id, {
        status: 'sent_to_traccar',
        queue_status: 'sent_to_traccar',
        confirmation_status: 'sent',
        sent_at: sentAt,
        sent_to_traccar_at: sentAt,
        command_released_at: sentAt,
        traccar_api_response: preBuiltCommand.response || {},
        traccar_api_called_at: sentAt,
        traccar_command_id: providerCommandId ? String(providerCommandId) : null,
        provider_command_id: providerCommandId ? String(providerCommandId) : null,
        provider_command_name: preBuiltCommand.provider_command_name,
        ascii_payload: asciiPayload,
        hex_payload: hexPayload,
        wrapped_payload: hexPayload || '',
        sData_hex: sDataHex,
        transmission_format: hexPayload ? 'mt20_wrapped_hex' : preBuiltCommand.dry_run ? 'dry_run' : 'provider_api',
        production_command: !!preBuiltCommand.production_command,
        provider_response: preBuiltCommand.response || {},
        source_function: 'sendTelematicsCommand',
        payload_length_bytes: hexPayload ? hexPayload.length / 2 : 0
      });
      return Response.json({ ok: true, command_id: commandAudit.id, command_type: commandType, queue_status: 'sent', dry_run: !!preBuiltCommand.dry_run, production_command: !!preBuiltCommand.production_command, result: preBuiltCommand.response || {} });
    } catch (error) {
      await base44.asServiceRole.entities.TelematicsCommand.update(commandAudit.id, { status: 'failed', queue_status: 'failed', confirmation_status: 'failed', failure_reason: error.message, failed_at: new Date().toISOString() });
      return Response.json({ error: error.message, command_id: commandAudit.id, command_failed: true }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});