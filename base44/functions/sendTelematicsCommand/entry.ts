import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const COMMANDS = ['locate', 'lock', 'unlock', 'horn', 'lights', 'horn_lights', 'disable_starter', 'restore_starter', 'status'];
const CUSTOMER_COMMANDS = ['locate', 'lock', 'unlock', 'horn_lights'];
const HOST_COMMANDS = ['locate', 'lock', 'unlock', 'horn_lights'];
const STARTER_COMMANDS = ['disable_starter', 'restore_starter'];
const TRACCAR_TEST_UNIQUE_ID = 'NR09G00002';
const TRACCAR_TEST_DEVICE_ID = '5';
const TRACCAR_TEST_COMMANDS = ['locate', 'lock', 'unlock', 'horn_lights'];
const CAPABILITY_MAP = {
  locate: 'supports_location', status: 'supports_location', lock: 'supports_lock', unlock: 'supports_unlock',
  horn: 'supports_horn', lights: 'supports_lights', horn_lights: 'supports_horn',
  disable_starter: 'supports_starter_disable', restore_starter: 'supports_starter_restore',
};
const MOOVETRAX_COMMAND_MAP = { locate: 'location', status: 'location', lock: 'lock', unlock: 'unlock', horn: 'panic', lights: 'panic', horn_lights: 'panic', disable_starter: 'kill', restore_starter: 'unkill' };
const NORAN_ACTION_MAP = { lock: '3,1', unlock: '4,1', disable_starter: '1,1', restore_starter: '1,0', horn: '2,1', lights: '2,2', horn_lights: '2,3' };

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
async function sendTraccarSingleDeviceLiveTest(commandType, device) {
  const baseUrl = envValue('TRACCAR_BASE_URL');
  const username = envValue('TRACCAR_USERNAME');
  const password = envValue('TRACCAR_PASSWORD');
  if (!baseUrl || !username || !password) throw new Error('Traccar credentials are not configured.');
  const built = buildNoranMT20Command(commandType, device.unique_id, null, { wrapMt20: true });
  const traccarPayload = { deviceId: Number(TRACCAR_TEST_DEVICE_ID), type: 'custom', attributes: { data: built.hex } };
  const res = await fetch(joinUrl(baseUrl, '/api/commands/send'), {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(traccarPayload)
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Traccar live test command failed (${res.status})`);
  return { provider_command_name: 'custom', ascii_payload: built.ascii, hex_payload: built.hex, response: { ...data, traccar_payload: traccarPayload, sData_hex: built.sDataHex, mt20_total_bytes: built.totalBytes, device_identifier_source: 'TelematicsDevice.unique_id' }, live_test: true };
}
function makeIdempotencyKey(userEmail, deviceId, commandType) {
  const minuteBucket = Math.floor(Date.now() / 60000);
  return `${userEmail}:${deviceId}:${commandType}:${minuteBucket}`;
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
  if (booking_id) booking = (await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_id }))[0] || null;
  const targetVehicleId = vehicle_id || booking?.vehicle_id;
  if (!targetVehicleId) return { vehicle: null, booking };
  const vehicle = (await base44.asServiceRole.entities.Vehicle.filter({ id: targetVehicleId }))[0] || null;
  return { vehicle, booking };
}
async function resolveDevice(base44, vehicle) {
  const existing = await base44.asServiceRole.entities.TelematicsDevice.filter({ vehicle_id: vehicle.id });
  if (existing[0]) return existing[0];
  if (vehicle.moovetrax_device_id) {
    return await base44.asServiceRole.entities.TelematicsDevice.create({
      company_id: vehicle.company_id || '', provider_key: 'moovetrax', provider_type: 'api', unique_id: `moovetrax:${sanitizeIdentifier(vehicle.moovetrax_device_id)}`,
      moovetrax_device_id: vehicle.moovetrax_device_id, provider_device_id: vehicle.moovetrax_device_id,
      vehicle_id: vehicle.id, host_id: vehicle.host_id || '', assigned_status: 'assigned', install_status: 'installed',
      gps_enabled: true, lock_unlock_enabled: true, horn_light_enabled: true, created_at: new Date().toISOString()
    });
  }
  return null;
}
async function validateAccess(base44, user, vehicle, booking, commandType, provider) {
  if (STARTER_COMMANDS.includes(commandType)) {
    if (!provider.allow_starter_commands) return 'Starter commands are disabled for this provider.';
    if (provider.require_admin_approval_for_starter && user.role !== 'admin') return 'Starter commands require admin approval.';
  }
  if (user.role === 'admin') return null;
  if (booking && booking.user_email === user.email) {
    if (!CUSTOMER_COMMANDS.includes(commandType)) return 'Customers cannot send this command.';
    const activeStatuses = ['active', 'approved', 'confirmed'];
    if (!activeStatuses.includes(booking.booking_status)) return 'Vehicle controls are only available for active rentals.';
    if (booking.payment_status === 'failed' || ['payment_due', 'suspended', 'completed', 'cancelled'].includes(booking.booking_status) || booking.starter_disabled || booking.moovetrax_kill_active) return 'Vehicle controls are unavailable for this booking.';
    return null;
  }
  if (vehicle.host_id) {
    const host = (await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id }))[0];
    if (host?.email === user.email || host?.user_id === user.id) {
      if (!HOST_COMMANDS.includes(commandType)) return 'Host starter commands require admin policy approval.';
      return null;
    }
  }
  if (user.role === 'installer') return commandType === 'status' || commandType === 'locate' ? null : 'Installers can only run installation checks.';
  return 'Forbidden.';
}
async function enforceRateLimit(base44, deviceId, commandType, userEmail, maxPerMinute) {
  const recent = await base44.asServiceRole.entities.TelematicsCommand.filter({ telematics_device_id: deviceId, requested_by: userEmail });
  const cutoff = Date.now() - 60 * 1000;
  const recentInWindow = recent.filter(cmd => new Date(cmd.created_date || cmd.created_at || 0).getTime() > cutoff && !['failed', 'expired', 'blocked'].includes(cmd.queue_status || cmd.status));
  return recentInWindow.length >= Number(maxPerMinute || 4) || recentInWindow.some(cmd => cmd.command_type === commandType);
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
  const built = buildNoranMT20Command(commandType, device.unique_id, template?.ascii_template, { wrapMt20: true });
  const traccarPayload = { deviceId: traccarDeviceId, type: 'custom', attributes: { data: built.hex } };
  const res = await fetch(joinUrl(baseUrl, '/api/commands/send'), {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(traccarPayload)
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Traccar production command failed (${res.status})`);
  return { provider_command_name: template?.provider_command_name || 'custom', ascii_payload: built.ascii, hex_payload: built.hex, production_command: true, response: { ...data, traccar_payload: traccarPayload, sData_hex: built.sDataHex, mt20_total_bytes: built.totalBytes, device_identifier_source: 'TelematicsDevice.unique_id' } };
}

async function renderTemplateExecution(template, provider, device, commandType, options = {}) {
  const deviceId = sanitizeIdentifier(device.provider_device_id || device.unique_id || device.traccar_device_id || device.moovetrax_device_id);
  if (template?.transport_type === 'traccar_custom_hex') {
    if (options.liveNoranProduction) return await sendTraccarNoranProductionCommand(commandType, device, template);
    const noranDeviceId = sanitizeIdentifier(device.unique_id || device.device_imei);
    const built = buildNoranMT20Command(commandType, noranDeviceId, template.ascii_template, { wrapMt20: provider.provider_key === 'traccar_noran_mt20' });
    return { provider_command_name: template.provider_command_name || 'custom', ascii_payload: built.ascii, hex_payload: built.hex, dry_run: true, response: { dry_run: true, ascii_payload: built.ascii, hex_payload: built.hex, sData_hex: built.sDataHex, mt20_total_bytes: built.totalBytes, device_identifier_source: 'TelematicsDevice.unique_id', simulated_traccar_payload: device.traccar_device_id ? { deviceId: Number(device.traccar_device_id), type: 'custom', attributes: { data: built.hex } } : null } };
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
  const built = buildNoranMT20Command(commandType, device.unique_id || device.device_imei || device.traccar_device_id, null, { wrapMt20: provider.provider_key === 'traccar_noran_mt20' });
  return { provider_command_name: commandType, ascii_payload: built.ascii, hex_payload: built.hex, dry_run: true, response: { dry_run: true, ascii_payload: built.ascii, hex_payload: built.hex, sData_hex: built.sDataHex, mt20_total_bytes: built.totalBytes } };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const commandType = body.command_type || body.command;
    if (!COMMANDS.includes(commandType)) return Response.json({ error: 'Invalid telematics command.' }, { status: 400 });

    const adminTraccarLiveTest = body.admin_traccar_live_test === true;
    const adminDeviceCommandTest = body.admin_device_command_test === true;
    let { vehicle, booking } = (adminTraccarLiveTest || adminDeviceCommandTest) ? { vehicle: null, booking: null } : await resolveVehicle(base44, body);
    if (!vehicle && !adminTraccarLiveTest && !adminDeviceCommandTest) return Response.json({ error: 'Vehicle not found' }, { status: 404 });
    let device = body.telematics_device_id ? (await base44.asServiceRole.entities.TelematicsDevice.filter({ id: body.telematics_device_id }))[0] : null;
    if (!device && body.unique_id) device = (await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: body.unique_id }))[0];
    if (!device && vehicle) device = await resolveDevice(base44, vehicle);
    if (!device) return Response.json({ error: 'No telematics device is assigned to this vehicle.' }, { status: 404 });
    if (adminDeviceCommandTest && user.role !== 'admin') return Response.json({ error: 'Admin access required for device command testing.' }, { status: 403 });
    if (adminDeviceCommandTest && device.vehicle_id) {
      vehicle = (await base44.asServiceRole.entities.Vehicle.filter({ id: device.vehicle_id }))[0] || null;
    }
    if (!adminTraccarLiveTest && !adminDeviceCommandTest && ['suspended', 'retired'].includes(device.lifecycle_status)) {
      return Response.json({ error: 'Device is not enabled for live commands.' }, { status: 403 });
    }
    const provider = await getProviderConfig(base44, device.provider_key, device.provider_type);
    const capability = CAPABILITY_MAP[commandType];
    if (adminTraccarLiveTest) {
      if (user.role !== 'admin') return Response.json({ error: 'Admin access required for Traccar single-device live test.' }, { status: 403 });
      if (!isTraccarSingleDeviceLiveTest(provider, device, commandType)) return Response.json({ error: 'Live test is restricted to active NR09G00002 / Traccar device 5 and allowed non-starter commands only.' }, { status: 403 });
    } else if (!adminDeviceCommandTest) {
      const accessError = await validateAccess(base44, user, vehicle, booking, commandType, provider);
      if (accessError) return Response.json({ error: accessError }, { status: 403 });
    }
    if (adminDeviceCommandTest && STARTER_COMMANDS.includes(commandType) && await hasActiveRental(base44, vehicle?.id || device.vehicle_id) && body.admin_starter_override !== true) {
      return Response.json({ error: 'Starter commands are blocked on active rentals unless explicit admin override is provided.' }, { status: 403 });
    }
    if (!adminTraccarLiveTest && !adminDeviceCommandTest && !provider.is_active && provider.provider_key !== 'moovetrax') return Response.json({ error: 'Telematics provider is not active.' }, { status: 400 });
    if (capability && provider[capability] === false) return Response.json({ error: 'Provider does not support this command.' }, { status: 400 });
    if (provider.execution_mode === 'production' && !provider.allow_live_commands) return Response.json({ error: 'Live commands are disabled for this provider.' }, { status: 400 });
    const liveNoranProduction = canSendNoranProduction(provider, device, commandType);
    if (provider.provider_key === 'traccar_noran_mt20' && provider.execution_mode === 'production' && provider.allow_live_commands === true && device.production_commands_enabled === true && !liveNoranProduction) {
      return Response.json({ error: STARTER_COMMANDS.includes(commandType) ? 'Starter production commands are blocked for this device/provider scope.' : 'Noran production command is not allowed for this device.' }, { status: 403 });
    }
    if (await enforceRateLimit(base44, device.id, commandType, user.email, provider.max_commands_per_minute)) return Response.json({ error: 'Command rate limit exceeded. Please wait before retrying.' }, { status: 429 });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString();
    const idempotencyKey = makeIdempotencyKey(user.email, device.id, commandType);
    const duplicate = (await base44.asServiceRole.entities.TelematicsCommand.filter({ idempotency_key: idempotencyKey }))[0];
    if (duplicate && !['failed', 'expired', 'blocked'].includes(duplicate.queue_status || duplicate.status)) return Response.json({ error: 'Duplicate command prevented.', idempotency_key: idempotencyKey }, { status: 409 });

    const commandAudit = await base44.asServiceRole.entities.TelematicsCommand.create({
      company_id: vehicle?.company_id || device.company_id || provider.company_id || '', telematics_device_id: device.id, provider_key: device.provider_key,
      vehicle_id: vehicle?.id || device.vehicle_id || '', host_id: vehicle?.host_id || device.host_id || '', booking_id: booking?.id || body.booking_id || '', renter_id: booking?.user_id || '',
      command_type: commandType, device_unique_id: device.unique_id || '', traccar_device_id: device.traccar_device_id || '', production_command: liveNoranProduction,
      status: 'queued', queue_status: 'queued', retry_count: 0, max_retries: 0, expires_at: expiresAt,
      confirmation_required: STARTER_COMMANDS.includes(commandType), confirmation_source: 'provider', idempotency_key: idempotencyKey,
      requested_by: user.email, requested_role: user.role || 'user', ip_address: getClientIp(req), user_agent: req.headers.get('user-agent') || '',
      created_at: now.toISOString(), request_payload: { vehicle_id: vehicle?.id || device.vehicle_id || '', booking_id: booking?.id || body.booking_id || '', admin_traccar_live_test: adminTraccarLiveTest, admin_device_command_test: adminDeviceCommandTest, admin_starter_override: body.admin_starter_override === true }
    });
    if (isExpired(expiresAt)) {
      await base44.asServiceRole.entities.TelematicsCommand.update(commandAudit.id, { status: 'blocked', queue_status: 'expired', failure_reason: 'Command expired before send.' });
      return Response.json({ error: 'Command expired before send.' }, { status: 400 });
    }

    await base44.asServiceRole.entities.TelematicsCommand.update(commandAudit.id, { status: 'sending', queue_status: 'sending', confirmation_status: 'pending' });
    try {
      const template = adminTraccarLiveTest ? null : await getTemplate(base44, device.provider_key, commandType);
      const routed = adminTraccarLiveTest
        ? await sendTraccarSingleDeviceLiveTest(commandType, device)
        : liveNoranProduction
          ? await sendTraccarNoranProductionCommand(commandType, device, template)
          : template
            ? await renderTemplateExecution(template, provider, device, commandType, { liveNoranProduction })
            : await fallbackAdapter(provider, device, commandType);
      const sentAt = new Date().toISOString();
      const providerCommandId = routed.response?.id || routed.response?.commandId || routed.response?.command_id || '';
      await base44.asServiceRole.entities.TelematicsCommand.update(commandAudit.id, {
        status: 'sent', queue_status: 'sent', confirmation_status: 'sent', sent_at: sentAt,
        provider_command_id: String(providerCommandId || ''), provider_command_name: routed.provider_command_name,
        ascii_payload: routed.ascii_payload, hex_payload: routed.hex_payload, production_command: !!routed.production_command,
        acknowledgement_source: 'provider_api_response', provider_response: routed.response || {}
      });
      await base44.asServiceRole.entities.TelematicsEvent.create({
        company_id: vehicle?.company_id || device.company_id || provider.company_id || '', telematics_device_id: device.id, provider_key: device.provider_key,
        vehicle_id: vehicle?.id || device.vehicle_id || '', event_type: `command_${commandType}_sent`, source: 'command', raw_payload: { provider_api_success: true, provider_execution_confirmed: false, response: routed.response || {} }, created_at: sentAt
      });
      if (adminDeviceCommandTest) {
        await base44.asServiceRole.entities.ActivityEvent.create({
          event_type: 'gps.command_sent', actor_id: user.id || '', actor_email: user.email, actor_role: 'admin', target_entity: 'TelematicsDevice', target_id: device.id, vehicle_id: vehicle?.id || device.vehicle_id || '', summary: `Admin test command ${commandType} sent to ${device.unique_id || device.id}`, metadata: { command_id: commandAudit.id, dry_run: !!routed.dry_run }, source: 'admin_panel', event_status: 'success'
        });
      }
      return Response.json({ ok: true, command_id: commandAudit.id, command_type: commandType, queue_status: 'sent', dry_run: !!routed.dry_run, production_command: !!routed.production_command, pending_acknowledgement: true, result: routed.response || {} });
    } catch (error) {
      await base44.asServiceRole.entities.TelematicsCommand.update(commandAudit.id, { status: 'failed', queue_status: 'failed', confirmation_status: 'failed', failure_reason: error.message, failed_at: new Date().toISOString(), sent_at: new Date().toISOString() });
      await base44.asServiceRole.entities.TelematicsEvent.create({ company_id: vehicle?.company_id || device.company_id || provider.company_id || '', telematics_device_id: device.id, provider_key: device.provider_key, vehicle_id: vehicle?.id || device.vehicle_id || '', event_type: `command_${commandType}_failed`, source: 'command', raw_payload: { error: error.message }, created_at: new Date().toISOString() });
      if (adminDeviceCommandTest) {
        await base44.asServiceRole.entities.ActivityEvent.create({
          event_type: 'gps.command_failed', actor_id: user.id || '', actor_email: user.email, actor_role: 'admin', target_entity: 'TelematicsDevice', target_id: device.id, vehicle_id: vehicle?.id || device.vehicle_id || '', summary: `Admin test command ${commandType} failed for ${device.unique_id || device.id}`, metadata: { command_id: commandAudit.id, error: error.message }, source: 'admin_panel', event_status: 'error'
        });
      }
      return Response.json({ error: error.message, command_id: commandAudit.id, command_failed: true }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});