import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const COMMAND_CATALOG = [
  { key: 'locate', label: 'Locate', providerCapability: 'supports_location', allowedRoles: ['admin', 'host', 'customer', 'installer'], starter: false, liveCommandRequired: true, supportedProviders: ['traccar_noran_mt20', 'moovetrax'] },
  { key: 'lock', label: 'Lock', providerCapability: 'supports_lock', deviceFlag: 'lock_unlock_enabled', allowedRoles: ['admin', 'host', 'customer', 'installer'], starter: false, liveCommandRequired: true, supportedProviders: ['traccar_noran_mt20', 'moovetrax'] },
  { key: 'unlock', label: 'Unlock', providerCapability: 'supports_unlock', deviceFlag: 'lock_unlock_enabled', allowedRoles: ['admin', 'host', 'customer', 'installer'], starter: false, liveCommandRequired: true, supportedProviders: ['traccar_noran_mt20', 'moovetrax'] },
  { key: 'horn', label: 'Horn', providerCapability: 'supports_horn', deviceFlag: 'horn_light_enabled', allowedRoles: ['admin', 'installer'], starter: false, liveCommandRequired: true, supportedProviders: ['traccar_noran_mt20', 'moovetrax'] },
  { key: 'lights', label: 'Lights', providerCapability: 'supports_lights', deviceFlag: 'horn_light_enabled', allowedRoles: ['admin', 'installer'], starter: false, liveCommandRequired: true, supportedProviders: ['traccar_noran_mt20'] },
  { key: 'horn_lights', label: 'Horn/Lights', providerCapability: 'supports_horn', deviceFlag: 'horn_light_enabled', allowedRoles: ['admin', 'host'], starter: false, liveCommandRequired: true, supportedProviders: ['traccar_noran_mt20', 'moovetrax'] },
  { key: 'alarm_pulse', label: 'Find My Car', providerCapability: 'supports_horn', deviceFlag: 'horn_light_enabled', allowedRoles: ['admin', 'host', 'customer', 'installer'], starter: false, liveCommandRequired: true, supportedProviders: ['traccar_noran_mt20', 'moovetrax'] },
  { key: 'disable_starter', label: 'Disable Starter', providerCapability: 'supports_starter_disable', allowedRoles: ['admin', 'host', 'installer'], starter: true, liveCommandRequired: true, supportedProviders: ['traccar_noran_mt20', 'moovetrax'] },
  { key: 'restore_starter', label: 'Restore Starter', providerCapability: 'supports_starter_restore', allowedRoles: ['admin', 'host', 'installer'], starter: true, liveCommandRequired: true, supportedProviders: ['traccar_noran_mt20', 'moovetrax'] },
  { key: 'status', label: 'Status', providerCapability: 'supports_location', allowedRoles: ['admin', 'host', 'installer'], starter: false, liveCommandRequired: true, supportedProviders: ['traccar_noran_mt20', 'moovetrax'] }
];

const ACTIVE_BOOKINGS = ['active', 'approved', 'confirmed'];
const CUSTOMER_COMMANDS = ['locate', 'lock', 'unlock', 'alarm_pulse'];

function clean(value) { return String(value || '').trim(); }
function productionEnabled(provider, device) {
  if (!device) return false;
  if (provider?.provider_key === 'moovetrax' || device.provider_key === 'moovetrax') return true;
  return device.production_commands_enabled === true;
}
function assignmentStatus(device) {
  if (!device) return 'none';
  if (device.vehicle_id && device.host_id) return 'assigned_to_vehicle_and_host';
  if (device.vehicle_id) return 'assigned_to_vehicle';
  if (device.host_id) return 'assigned_to_host';
  return 'unassigned';
}
async function findById(entity, id) {
  if (!id) return null;
  try {
    const rows = await entity.filter({ id });
    return rows[0] || null;
  } catch {
    return null;
  }
}
function chooseBestDevice(devices, preferredProviderKey = '') {
  return [...devices].sort((a, b) => {
    const score = (device) =>
      (preferredProviderKey && device.provider_key === preferredProviderKey ? 50 : 0) +
      (device.provider_key === 'traccar_noran_mt20' ? 40 : 0) +
      (device.provider_key && device.provider_key !== 'unknown' && device.provider_key !== device.unique_id ? 20 : 0) +
      (device.production_commands_enabled === true ? 15 : 0) +
      (device.traccar_device_id ? 10 : 0) +
      (device.vehicle_id ? 5 : 0);
    return score(b) - score(a);
  })[0] || null;
}
async function findDevice(base44, body, vehicle) {
  if (body.telematics_device_id) return await findById(base44.asServiceRole.entities.TelematicsDevice, body.telematics_device_id);
  const uniqueId = clean(body.unique_id || body.device_id);
  if (uniqueId) {
    const fields = ['unique_id', 'device_imei', 'provider_device_id', 'traccar_device_id', 'moovetrax_device_id'];
    for (const field of fields) {
      const matches = await base44.asServiceRole.entities.TelematicsDevice.filter({ [field]: uniqueId });
      if (matches[0]) return chooseBestDevice(matches, body.provider_key || '');
    }
    const upper = uniqueId.toUpperCase();
    if (upper !== uniqueId) {
      for (const field of fields) {
        const matches = await base44.asServiceRole.entities.TelematicsDevice.filter({ [field]: upper });
        if (matches[0]) return chooseBestDevice(matches, body.provider_key || '');
      }
    }
  }
  if (vehicle?.id) {
    const byVehicle = await base44.asServiceRole.entities.TelematicsDevice.filter({ vehicle_id: vehicle.id });
    if (byVehicle[0]) return byVehicle[0];
    if (vehicle.telematics_device_id) return await findById(base44.asServiceRole.entities.TelematicsDevice, vehicle.telematics_device_id);
  }
  if (vehicle?.moovetrax_device_id) {
    return {
      id: '', provider_key: 'moovetrax', provider_type: 'api', unique_id: `moovetrax:${vehicle.moovetrax_device_id}`,
      provider_device_id: vehicle.moovetrax_device_id, moovetrax_device_id: vehicle.moovetrax_device_id,
      vehicle_id: vehicle.id, host_id: vehicle.host_id || '', lifecycle_status: 'live_enabled', production_commands_enabled: true,
      gps_enabled: true, lock_unlock_enabled: true, horn_light_enabled: true, host_starter_control_enabled: true,
      production_command_scope: 'all_supported_commands'
    };
  }
  return null;
}
async function getProvider(base44, device) {
  if (!device) return null;
  const records = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: device.provider_key });
  if (records[0]) return records[0];
  if (device.provider_key === 'moovetrax') {
    return {
      provider_key: 'moovetrax', provider_name: 'MooveTrax', provider_type: 'api', is_active: true, execution_mode: 'production', allow_live_commands: true,
      allow_starter_commands: true, supports_location: true, supports_lock: true, supports_unlock: true, supports_horn: true, supports_lights: true,
      supports_starter_disable: true, supports_starter_restore: true
    };
  }
  return {
    provider_key: device.provider_key || 'unknown', provider_name: device.provider_key || 'Unknown', provider_type: device.provider_type || 'api', is_active: false,
    execution_mode: 'dry_run', allow_live_commands: false, allow_starter_commands: false,
    supports_location: device.gps_enabled === true, supports_lock: device.lock_unlock_enabled === true, supports_unlock: device.lock_unlock_enabled === true,
    supports_horn: device.horn_light_enabled === true, supports_lights: device.horn_light_enabled === true,
    supports_starter_disable: false, supports_starter_restore: false
  };
}
async function resolveContext(base44, body) {
  let booking = null;
  if (body.booking_id) booking = await findById(base44.asServiceRole.entities.BookingRequest, body.booking_id);
  let vehicle = null;
  const vehicleId = body.vehicle_id || booking?.vehicle_id || '';
  if (vehicleId) vehicle = await findById(base44.asServiceRole.entities.Vehicle, vehicleId);
  if (!vehicle && body.vin) {
    const rows = await base44.asServiceRole.entities.Vehicle.filter({ vin: clean(body.vin).toUpperCase() });
    vehicle = rows[0] || null;
  }
  const device = await findDevice(base44, body, vehicle);
  if (!vehicle && device?.vehicle_id) vehicle = await findById(base44.asServiceRole.entities.Vehicle, device.vehicle_id);
  const provider = await getProvider(base44, device);
  let host = null;
  const hostId = vehicle?.host_id || device?.host_id || '';
  if (hostId) host = await findById(base44.asServiceRole.entities.Host, hostId);
  return { booking, vehicle, device, provider, host };
}
function firstBlockReason({ command, role, user, booking, vehicle, device, provider, host, installerContext }) {
  if (!command.allowedRoles.includes(role)) return `${role || 'User'} cannot send this command.`;
  if (!device) return vehicle ? 'Vehicle has no telematics device.' : 'No telematics device found.';
  if (!provider) return 'Provider not found.';
  if (!command.supportedProviders.includes(provider.provider_key)) return 'Provider does not support command.';
  if (provider.is_active === false && provider.provider_key !== 'moovetrax') return 'Telematics provider is not active.';
  if (command.providerCapability && provider[command.providerCapability] === false) return 'Provider does not support command.';
  if (command.deviceFlag && device[command.deviceFlag] === false) return 'Device capability is disabled.';
  if (provider.execution_mode === 'production' && provider.allow_live_commands !== true) return 'Live commands are disabled for this provider.';
  if (provider.provider_key === 'traccar_noran_mt20' && provider.execution_mode === 'production' && provider.allow_live_commands === true && device.production_commands_enabled !== true) return 'Production commands disabled.';
  if (command.starter && provider.allow_starter_commands !== true) return 'Starter commands are disabled for this provider.';
  if (command.starter && provider.provider_key === 'traccar_noran_mt20' && device.production_command_scope !== 'all_supported_commands' && !installerContext) return 'Device production scope does not allow starter commands.';

  if (role === 'customer') {
    if (!booking) return 'Customer controls require an active booking.';
    if (!CUSTOMER_COMMANDS.includes(command.key)) return 'Customers cannot send this command.';
    if (!ACTIVE_BOOKINGS.includes(booking.booking_status)) return 'Booking not active.';
    if (booking.payment_status !== 'paid') return 'Payment not current.';
    if (booking.starter_disabled || booking.moovetrax_kill_active) return 'Vehicle controls are disabled for this rental.';
    if (!vehicle) return 'Vehicle not found for this booking.';
    if (!device.vehicle_id && provider.provider_key !== 'moovetrax') return 'Device not assigned to vehicle.';
  }

  if (role === 'host') {
    if (!vehicle?.id) return 'Device not assigned to vehicle.';
    if (!device.host_id && !vehicle.host_id) return 'Device not assigned to host.';
    if (!host || (user && host.email !== user.email && host.user_id !== user.id)) return 'Device not assigned to this host.';
    if (device.vehicle_id && device.vehicle_id !== vehicle.id) return 'Device is assigned to a different vehicle.';
    if (command.starter && host.telematics_starter_control_enabled !== true) return 'Host starter controls are disabled for this host.';
    if (command.starter && device.host_starter_control_enabled !== true) return 'Host starter controls are disabled for this device.';
  }

  if (role === 'installer') {
    if (!installerContext) return 'Installer commands must come from install workflow context.';
    if (device.vehicle_id && vehicle?.id && device.vehicle_id !== vehicle.id) return 'Scanned device is assigned to a different vehicle.';
    if (!['lock', 'unlock', 'horn', 'lights', 'alarm_pulse', 'disable_starter', 'restore_starter'].includes(command.key)) return 'Installers can only run installation test commands.';
  }

  return '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const user = await base44.auth.me().catch(() => null);
    const role = body.installer_install_test === true ? 'installer' : (body.role || body.user_role || user?.role || 'customer');
    const context = await resolveContext(base44, body);
    const installerContext = role === 'installer' && !!(body.unique_id || body.device_id) && (!!body.vin || body.installer_install_test === true);
    const dryRun = !context.provider || context.provider.execution_mode === 'dry_run' || context.provider.allow_live_commands !== true;
    const production = productionEnabled(context.provider, context.device);
    const assignStatus = assignmentStatus(context.device);
    const commands = COMMAND_CATALOG.map((command) => {
      const securityHidden = role === 'customer' && command.starter;
      const visible = !securityHidden && command.allowedRoles.includes(role);
      const reason = visible ? firstBlockReason({ command, role, user, ...context, installerContext }) : `${role} cannot send this command.`;
      return {
        ...command,
        visible,
        enabled: visible && !reason,
        reason,
        dry_run: dryRun,
        live: !dryRun,
        provider: context.provider?.provider_key || context.device?.provider_key || '',
        device_id: context.device?.id || '',
        telematics_device_id: context.device?.id || '',
        unique_id: context.device?.unique_id || '',
        vehicle_id: context.vehicle?.id || context.device?.vehicle_id || '',
        host_id: context.host?.id || context.vehicle?.host_id || context.device?.host_id || '',
        production_enabled: production,
        assignment_status: assignStatus
      };
    });
    return Response.json({
      ok: true,
      role,
      commands,
      command_map: Object.fromEntries(commands.map((command) => [command.key, command])),
      context: {
        provider: context.provider?.provider_key || context.device?.provider_key || '',
        device_id: context.device?.id || '',
        unique_id: context.device?.unique_id || '',
        vehicle_id: context.vehicle?.id || context.device?.vehicle_id || '',
        host_id: context.host?.id || context.vehicle?.host_id || context.device?.host_id || '',
        production_enabled: production,
        assignment_status: assignStatus,
        dry_run: dryRun,
        live: !dryRun,
        device_unassigned: assignStatus === 'unassigned',
        device_live_but_unassigned: !!context.device && production && assignStatus === 'unassigned'
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});