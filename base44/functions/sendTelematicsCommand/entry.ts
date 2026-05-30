import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const COMMANDS = ['locate', 'lock', 'unlock', 'horn_lights', 'disable_starter', 'restore_starter', 'status'];
const CUSTOMER_COMMANDS = ['locate', 'lock', 'unlock', 'horn_lights'];
const HOST_COMMANDS = ['locate', 'lock', 'unlock', 'horn_lights'];
const CAPABILITY_MAP = {
  locate: 'supports_location',
  status: 'supports_location',
  lock: 'supports_lock',
  unlock: 'supports_unlock',
  horn_lights: 'supports_horn',
  disable_starter: 'supports_starter_disable',
  restore_starter: 'supports_starter_restore',
};
const MOOVETRAX_COMMAND_MAP = {
  locate: 'location',
  status: 'location',
  lock: 'lock',
  unlock: 'unlock',
  horn_lights: 'panic',
  disable_starter: 'kill',
  restore_starter: 'unkill',
};
const NORAN_ACTION_MAP = {
  lock: '3,1',
  unlock: '4,1',
  disable_starter: '1,1',
  restore_starter: '1,0',
  horn_lights: '2,3',
};

function sanitizeIdentifier(value = '') {
  return String(value).replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80);
}

function asciiToHex(input = '') {
  return Array.from(input).map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function buildNoranMT20Command(commandType, deviceId) {
  const now = new Date();
  const hhmmss = [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()].map(n => String(n).padStart(2, '0')).join('');
  const cleanDeviceId = sanitizeIdentifier(deviceId);
  const ascii = commandType === 'locate'
    ? `*KW,${cleanDeviceId},000,${hhmmss}#`
    : `*KW,${cleanDeviceId},007,${hhmmss},${NORAN_ACTION_MAP[commandType]}#`;
  return { ascii, hex: asciiToHex(ascii) };
}

function getClientIp(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '';
}

async function getProviderConfig(base44, providerKey, providerType) {
  const records = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: providerKey });
  if (records[0]) return records[0];
  if (providerKey === 'moovetrax') {
    return {
      provider_key: 'moovetrax', provider_name: 'MooveTrax', provider_type: 'api', is_active: true,
      supports_location: true, supports_lock: true, supports_unlock: true, supports_horn: true, supports_lights: true,
      supports_starter_disable: true, supports_starter_restore: true, auth_type: 'api_key', credential_secret_reference: 'MOOVETRAX_PARTNER_API_KEY', base_url: 'https://www.moovetrax.com/api'
    };
  }
  return { provider_key: providerKey, provider_name: providerKey, provider_type: providerType || 'api', is_active: false };
}

async function resolveVehicle(base44, { vehicle_id, booking_id }) {
  let booking = null;
  if (booking_id) {
    const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: booking_id });
    booking = bookings[0] || null;
  }
  const targetVehicleId = vehicle_id || booking?.vehicle_id;
  if (!targetVehicleId) return { vehicle: null, booking };
  const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: targetVehicleId });
  return { vehicle: vehicles[0] || null, booking };
}

async function resolveDevice(base44, vehicle) {
  const existing = await base44.asServiceRole.entities.TelematicsDevice.filter({ vehicle_id: vehicle.id });
  if (existing[0]) return existing[0];
  if (vehicle.moovetrax_device_id) {
    return await base44.asServiceRole.entities.TelematicsDevice.create({
      provider_key: 'moovetrax', provider_type: 'api', unique_id: `moovetrax:${sanitizeIdentifier(vehicle.moovetrax_device_id)}`,
      moovetrax_device_id: vehicle.moovetrax_device_id, provider_device_id: vehicle.moovetrax_device_id,
      vehicle_id: vehicle.id, host_id: vehicle.host_id || '', assigned_status: 'assigned', install_status: 'installed',
      gps_enabled: true, lock_unlock_enabled: true, horn_light_enabled: true, created_at: new Date().toISOString()
    });
  }
  return null;
}

async function validateAccess(base44, user, vehicle, booking, commandType) {
  if (user.role === 'admin') return null;

  if (booking && booking.user_email === user.email) {
    if (!CUSTOMER_COMMANDS.includes(commandType)) return 'Customers cannot send this command.';
    const activeStatuses = ['active', 'approved', 'confirmed'];
    if (!activeStatuses.includes(booking.booking_status)) return 'Vehicle controls are only available for active rentals.';
    if (booking.payment_status === 'failed' || booking.booking_status === 'payment_due' || booking.booking_status === 'suspended' || booking.booking_status === 'completed' || booking.booking_status === 'cancelled' || booking.starter_disabled || booking.moovetrax_kill_active) {
      return 'Vehicle controls are unavailable for this booking.';
    }
    return null;
  }

  if (vehicle.host_id) {
    const hosts = await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id });
    const ownsVehicle = hosts[0]?.email === user.email || hosts[0]?.user_id === user.id;
    if (ownsVehicle) {
      if (!HOST_COMMANDS.includes(commandType)) return 'Host starter commands require admin policy approval.';
      return null;
    }
  }

  if (user.role === 'installer') {
    return commandType === 'status' || commandType === 'locate' ? null : 'Installers can only run installation checks.';
  }

  return 'Forbidden.';
}

async function enforceRateLimit(base44, deviceId, commandType, userEmail) {
  const recent = await base44.asServiceRole.entities.TelematicsCommand.filter({ telematics_device_id: deviceId, command_type: commandType, requested_by: userEmail });
  const cutoff = Date.now() - 30 * 1000;
  return recent.some(cmd => new Date(cmd.created_date || cmd.created_at).getTime() > cutoff && ['queued', 'sent', 'confirmed'].includes(cmd.status));
}

async function callMooveTrax(provider, device, commandType) {
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

async function callTraccar(provider, device, commandType) {
  const built = buildNoranMT20Command(commandType, device.unique_id || device.device_imei || device.traccar_device_id);
  return {
    provider_command_name: 'custom',
    ascii_payload: built.ascii,
    hex_payload: built.hex,
    response: { dry_run: true, message: 'Traccar/Noran MT20 command built but not auto-sent in Phase 1.', ascii_payload: built.ascii, hex_payload: built.hex }
  };
}

async function callGenericApi(provider, device, commandType) {
  if (!provider.base_url || !provider.command_endpoint_template) {
    throw new Error('Generic API provider is missing base_url or command_endpoint_template.');
  }
  const secret = Deno.env.get(provider.credential_secret_reference || '') || '';
  const endpoint = provider.command_endpoint_template
    .replace('{device_id}', encodeURIComponent(device.provider_device_id || device.unique_id))
    .replace('{command}', encodeURIComponent(commandType));
  const headers = { 'Content-Type': 'application/json' };
  if (provider.auth_type === 'bearer_token' && secret) headers.Authorization = `Bearer ${secret}`;
  if (provider.auth_type === 'api_key' && secret) headers['X-API-Key'] = secret;
  const res = await fetch(`${provider.base_url}${endpoint}`, { method: 'POST', headers, body: JSON.stringify({ command: commandType, device_id: device.provider_device_id || device.unique_id }) });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Generic provider command failed (${res.status})`);
  return { provider_command_name: commandType, response: data };
}

async function routeProvider(provider, device, commandType) {
  if (provider.provider_key === 'moovetrax') return callMooveTrax(provider, device, commandType);
  if (provider.provider_type === 'traccar') return callTraccar(provider, device, commandType);
  return callGenericApi(provider, device, commandType);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const commandType = body.command_type || body.command;
    if (!COMMANDS.includes(commandType)) return Response.json({ error: 'Invalid telematics command.' }, { status: 400 });

    const { vehicle, booking } = await resolveVehicle(base44, body);
    if (!vehicle) return Response.json({ error: 'Vehicle not found' }, { status: 404 });

    const device = body.telematics_device_id
      ? (await base44.asServiceRole.entities.TelematicsDevice.filter({ id: body.telematics_device_id }))[0]
      : await resolveDevice(base44, vehicle);
    if (!device) return Response.json({ error: 'No telematics device is assigned to this vehicle.' }, { status: 404 });

    const accessError = await validateAccess(base44, user, vehicle, booking, commandType);
    if (accessError) return Response.json({ error: accessError }, { status: 403 });

    const provider = await getProviderConfig(base44, device.provider_key, device.provider_type);
    if (!provider.is_active && provider.provider_key !== 'moovetrax') return Response.json({ error: 'Telematics provider is not active.' }, { status: 400 });
    const capability = CAPABILITY_MAP[commandType];
    if (capability && provider[capability] === false) return Response.json({ error: 'Provider does not support this command.' }, { status: 400 });

    const rateLimited = await enforceRateLimit(base44, device.id, commandType, user.email);
    if (rateLimited) return Response.json({ error: 'Command rate limit exceeded. Please wait before retrying.' }, { status: 429 });

    const now = new Date().toISOString();
    const commandAudit = await base44.asServiceRole.entities.TelematicsCommand.create({
      telematics_device_id: device.id, provider_key: device.provider_key, vehicle_id: vehicle.id, host_id: vehicle.host_id || '',
      booking_id: booking?.id || body.booking_id || '', renter_id: booking?.user_id || '', command_type: commandType,
      status: 'queued', requested_by: user.email, requested_role: user.role || 'user', ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent') || '', created_at: now, request_payload: { vehicle_id: vehicle.id, booking_id: booking?.id || body.booking_id || '' }
    });

    let routed;
    try {
      routed = await routeProvider(provider, device, commandType);
      const status = routed.response?.dry_run ? 'sent' : 'confirmed';
      await base44.asServiceRole.entities.TelematicsCommand.update(commandAudit.id, {
        status, sent_at: now, confirmed_at: status === 'confirmed' ? new Date().toISOString() : undefined,
        provider_command_name: routed.provider_command_name, ascii_payload: routed.ascii_payload, hex_payload: routed.hex_payload,
        provider_response: routed.response || {}
      });
      await base44.asServiceRole.entities.TelematicsEvent.create({
        telematics_device_id: device.id, provider_key: device.provider_key, vehicle_id: vehicle.id,
        event_type: `command_${commandType}_${status}`, source: 'command', raw_payload: routed.response || {}, created_at: new Date().toISOString()
      });
      if (commandType === 'disable_starter' && booking?.id) {
        await base44.asServiceRole.entities.BookingRequest.update(booking.id, { starter_disabled: true, moovetrax_kill_active: true });
      }
      if (commandType === 'restore_starter' && booking?.id) {
        await base44.asServiceRole.entities.BookingRequest.update(booking.id, { starter_disabled: false, moovetrax_kill_active: false });
      }
      return Response.json({ ok: true, command_type: commandType, status, result: routed.response || {} });
    } catch (error) {
      await base44.asServiceRole.entities.TelematicsCommand.update(commandAudit.id, { status: 'failed', failure_reason: error.message, sent_at: new Date().toISOString() });
      await base44.asServiceRole.entities.TelematicsEvent.create({ telematics_device_id: device.id, provider_key: device.provider_key, vehicle_id: vehicle.id, event_type: `command_${commandType}_failed`, source: 'command', raw_payload: { error: error.message }, created_at: new Date().toISOString() });
      return Response.json({ error: error.message, command_failed: true }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});