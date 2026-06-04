import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const COMMAND_DEFINITIONS = [
  { key: 'locate', label: 'Locate / Refresh Position', capability: 'supports_location', result_field: 'locate_result' },
  { key: 'status', label: 'Status', capability: 'supports_location', result_field: 'status_result' },
  { key: 'lock', label: 'Lock', capability: 'supports_lock', deviceFlag: 'lock_unlock_enabled', result_field: 'lock_result' },
  { key: 'unlock', label: 'Unlock', capability: 'supports_unlock', deviceFlag: 'lock_unlock_enabled', result_field: 'unlock_result' },
  { key: 'horn', label: 'Horn', capability: 'supports_horn', deviceFlag: 'horn_light_enabled', result_field: 'horn_result' },
  { key: 'lights', label: 'Lights', capability: 'supports_lights', deviceFlag: 'horn_light_enabled', result_field: 'lights_result' },
  { key: 'horn_lights', label: 'Horn + Lights', capability: 'supports_horn', deviceFlag: 'horn_light_enabled', result_field: 'horn_lights_result' },
  { key: 'alarm_pulse', label: 'Alarm / Find Pulse', capability: 'supports_horn', deviceFlag: 'horn_light_enabled', result_field: 'alarm_pulse_result' },
  { key: 'disable_starter', label: 'Disable Starter', capability: 'supports_starter_disable', starter: true, result_field: 'starter_disable_result' },
  { key: 'restore_starter', label: 'Restore Starter', capability: 'supports_starter_restore', starter: true, result_field: 'starter_restore_result' }
];

function clean(value) {
  return String(value || '').trim();
}

async function findDevice(base44, identifier) {
  const value = clean(identifier);
  if (!value) return null;
  const fields = ['unique_id', 'device_imei', 'provider_device_id', 'traccar_device_id', 'moovetrax_device_id'];
  for (const field of fields) {
    const matches = await base44.asServiceRole.entities.TelematicsDevice.filter({ [field]: value });
    if (matches[0]) return matches[0];
  }
  const upper = value.toUpperCase();
  if (upper !== value) {
    for (const field of fields) {
      const matches = await base44.asServiceRole.entities.TelematicsDevice.filter({ [field]: upper });
      if (matches[0]) return matches[0];
    }
  }
  return null;
}

async function getProvider(base44, device) {
  const providers = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: device.provider_key });
  return providers[0] || {
    provider_key: device.provider_key || 'unknown',
    provider_name: device.provider_key || 'Unknown',
    provider_type: device.provider_type || 'api',
    is_active: false,
    execution_mode: 'dry_run',
    allow_live_commands: false,
    allow_starter_commands: false,
    supports_location: !!device.gps_enabled,
    supports_lock: !!device.lock_unlock_enabled,
    supports_unlock: !!device.lock_unlock_enabled,
    supports_horn: !!device.horn_light_enabled,
    supports_lights: !!device.horn_light_enabled,
    supports_starter_disable: false,
    supports_starter_restore: false
  };
}

function isSupported(command, provider, device) {
  if (provider?.[command.capability] !== true) return false;
  if (command.deviceFlag && device?.[command.deviceFlag] !== true) return false;
  return true;
}

async function getLinked(base44, device) {
  let vehicle = null;
  let host = null;
  if (device.vehicle_id) {
    const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: device.vehicle_id });
    vehicle = vehicles[0] || null;
  }
  if (vehicle?.host_id || device.host_id) {
    const hosts = await base44.asServiceRole.entities.Host.filter({ id: vehicle?.host_id || device.host_id });
    host = hosts[0] || null;
  }
  return { vehicle, host };
}

function sessionDefaults(commands) {
  const defaults = {};
  for (const command of COMMAND_DEFINITIONS) {
    defaults[command.result_field] = commands.some((item) => item.key === command.key) ? 'untested' : 'not_supported';
  }
  return defaults;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json();
    const identifier = clean(body.identifier || body.device_id || body.unique_id);
    const device = await findDevice(base44, identifier);
    if (!device) return Response.json({ error: 'No matching telematics device was found.' }, { status: 404 });

    const provider = await getProvider(base44, device);
    const supported_commands = COMMAND_DEFINITIONS.filter((command) => isSupported(command, provider, device));
    const { vehicle, host } = await getLinked(base44, device);
    const now = new Date().toISOString();
    const sessions = await base44.asServiceRole.entities.TelematicsDeviceTestSession.filter({ device_id: device.id, status: 'in_progress' });
    for (const oldSession of sessions) {
      await base44.asServiceRole.entities.TelematicsDeviceTestSession.update(oldSession.id, {
        status: 'failed',
        completed_at: now,
        notes: [oldSession.notes, 'Closed automatically when a new admin command test session started.'].filter(Boolean).join('\n')
      });
    }

    const priorCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({ telematics_device_id: device.id });
    for (const command of priorCommands) {
      const state = command.queue_status || command.status;
      const isAdminTestCommand = command.request_payload?.admin_device_command_test === true || command.request_payload?.source === 'admin_test';
      if (isAdminTestCommand && ['queued', 'pending', 'sending', 'sent', 'delivered', 'acknowledged'].includes(state)) {
        await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
          status: 'expired',
          queue_status: 'expired',
          confirmation_status: 'expired',
          failed_at: now,
          failure_reason: 'Closed by new admin command test session.'
        });
      }
    }

    const defaults = sessionDefaults(supported_commands);
    const session = await base44.asServiceRole.entities.TelematicsDeviceTestSession.create({
      device_id: device.id,
      unique_id: device.unique_id || identifier,
      provider_key: device.provider_key || provider.provider_key || 'unknown',
      tested_by: user.email,
      started_at: now,
      status: 'in_progress',
      ...defaults
    });

    return Response.json({
      ok: true,
      device,
      provider,
      vehicle,
      host,
      session,
      supported_commands,
      execution: {
        mode: provider.execution_mode || 'dry_run',
        dry_run: provider.execution_mode === 'dry_run' || provider.allow_live_commands !== true,
        live_enabled: provider.execution_mode === 'production' && provider.allow_live_commands === true
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});