import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function clean(value) { return String(value || '').trim(); }
function nowIso() { return new Date().toISOString(); }
function vehicleName(vehicle) { return [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || vehicle?.vin || vehicle?.id || 'Vehicle'; }
function providerName(provider, key) { return provider?.provider_name || key || 'Unknown provider'; }
function isRetired(device) { return device?.lifecycle_status === 'retired' || device?.assigned_status === 'retired' || device?.install_status === 'retired'; }
function hasText(device, term) {
  if (!term) return true;
  const haystack = [device.unique_id, device.device_imei, device.sim_iccid, device.provider_device_id, device.traccar_device_id, device.moovetrax_device_id, device.provider_key].join(' ').toLowerCase();
  return haystack.includes(term.toLowerCase());
}
async function getOne(base44, entity, id) {
  if (!id) return null;
  const rows = await base44.asServiceRole.entities[entity].filter({ id });
  return rows[0] || null;
}
async function currentHost(base44, user) {
  if (!user?.email) return null;
  const hosts = await base44.asServiceRole.entities.Host.filter({ email: user.email });
  return hosts.find(h => h.email === user.email || h.user_id === user.id) || hosts[0] || null;
}
function assertAllowedUser(user) {
  if (!user) throw new Error('Unauthorized');
  if (!['admin', 'host'].includes(user.role)) throw new Error('Forbidden: only admins and hosts can manage telematics device assignment');
}
function assertVehicleAccess(user, host, vehicle) {
  if (!vehicle) throw new Error('Vehicle not found');
  if (user.role === 'admin') return;
  if (!host || vehicle.host_id !== host.id) throw new Error('Forbidden: hosts can only manage their own vehicles');
}
function hostCanSeeDevice(host, ownVehicleIds, device) {
  return !device.vehicle_id || device.host_id === host?.id || ownVehicleIds.has(device.vehicle_id);
}
async function providerMap(base44) {
  const providers = await base44.asServiceRole.entities.TelematicsProviderConfig.list('provider_key', 500);
  return Object.fromEntries(providers.map(p => [p.provider_key, p]));
}
function deviceView(device, providers, linkedVehicle) {
  const provider = providers[device.provider_key];
  return {
    ...device,
    provider_display_name: providerName(provider, device.provider_key),
    linked_vehicle_name: linkedVehicle ? vehicleName(linkedVehicle) : '',
    linked_vehicle_id: linkedVehicle?.id || device.vehicle_id || ''
  };
}
async function logEvent(base44, event_type, { user, device, vehicle, oldVehicleId, newVehicleId, metadata = {} }) {
  await base44.asServiceRole.entities.TelematicsEvent.create({
    company_id: vehicle?.company_id || device?.company_id || '',
    telematics_device_id: device?.id || '',
    provider_key: device?.provider_key || metadata.provider_key || 'manual_unknown',
    vehicle_id: newVehicleId || vehicle?.id || device?.vehicle_id || '',
    event_type,
    source: 'system',
    raw_payload: {
      user_email: user?.email || '',
      user_role: user?.role || '',
      timestamp: nowIso(),
      old_vehicle_id: oldVehicleId || '',
      new_vehicle_id: newVehicleId || '',
      provider_key: device?.provider_key || metadata.provider_key || '',
      device_unique_id: device?.unique_id || '',
      ...metadata
    },
    created_at: nowIso()
  });
}
async function clearVehicleReference(base44, vehicleId, deviceId) {
  const vehicle = await getOne(base44, 'Vehicle', vehicleId);
  if (vehicle?.telematics_device_id === deviceId) {
    await base44.asServiceRole.entities.Vehicle.update(vehicle.id, { telematics_device_id: '' });
  }
}
async function linkDevice(base44, { user, host, deviceId, vehicleId, allowReplace = false, overrideRetired = false }) {
  const device = await getOne(base44, 'TelematicsDevice', deviceId);
  const vehicle = await getOne(base44, 'Vehicle', vehicleId);
  assertVehicleAccess(user, host, vehicle);
  if (!device) throw new Error('Device not found');
  if (isRetired(device) && user.role !== 'admin') throw new Error('Retired devices can only be assigned by an admin override');
  if (isRetired(device) && !overrideRetired) throw new Error('Device is retired. Admin override required.');

  if (user.role === 'host') {
    const ownVehicleIds = new Set((await base44.asServiceRole.entities.Vehicle.filter({ host_id: host.id })).map(v => v.id));
    if (!hostCanSeeDevice(host, ownVehicleIds, device)) throw new Error('Forbidden: host cannot assign this device');
  }

  const activeForVehicle = (await base44.asServiceRole.entities.TelematicsDevice.filter({ vehicle_id: vehicle.id })).filter(d => d.id !== device.id && d.lifecycle_status !== 'retired');
  if (activeForVehicle.length && !allowReplace) throw new Error('This vehicle already has a telematics device. Use Replace Device.');

  const oldVehicleId = device.vehicle_id || '';
  if (oldVehicleId && oldVehicleId !== vehicle.id) await clearVehicleReference(base44, oldVehicleId, device.id);
  await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
    vehicle_id: vehicle.id,
    host_id: vehicle.host_id || '',
    assigned_status: 'assigned',
    lifecycle_status: isRetired(device) ? device.lifecycle_status : (device.lifecycle_status === 'inventory' ? 'provisioned' : (device.lifecycle_status || 'provisioned'))
  });
  await base44.asServiceRole.entities.Vehicle.update(vehicle.id, { telematics_device_id: device.id });
  const updated = { ...device, vehicle_id: vehicle.id, host_id: vehicle.host_id || '' };
  await logEvent(base44, 'device_manually_linked', { user, device: updated, vehicle, oldVehicleId, newVehicleId: vehicle.id });
  return { device: updated, vehicle };
}
async function unlinkDevice(base44, { user, host, deviceId, disposition = 'provisioned', keepHostOwnership = false }) {
  const device = await getOne(base44, 'TelematicsDevice', deviceId);
  if (!device) throw new Error('Device not found');
  const vehicle = await getOne(base44, 'Vehicle', device.vehicle_id);
  if (vehicle) assertVehicleAccess(user, host, vehicle);
  if (user.role === 'host') {
    disposition = 'provisioned';
    keepHostOwnership = true;
  }
  const nextLifecycle = disposition === 'retired' ? 'retired' : disposition === 'inventory' ? 'inventory' : 'provisioned';
  await clearVehicleReference(base44, device.vehicle_id, device.id);
  await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
    vehicle_id: '',
    host_id: keepHostOwnership ? (device.host_id || vehicle?.host_id || '') : '',
    assigned_status: nextLifecycle === 'retired' ? 'retired' : 'unassigned',
    lifecycle_status: nextLifecycle
  });
  await logEvent(base44, 'device_manually_unlinked', { user, device, vehicle, oldVehicleId: device.vehicle_id || '', newVehicleId: '', metadata: { disposition: nextLifecycle } });
  return { ok: true };
}
async function replaceDevice(base44, payload) {
  const { user, host, oldDeviceId, newDeviceId, vehicleId } = payload;
  const vehicle = await getOne(base44, 'Vehicle', vehicleId);
  assertVehicleAccess(user, host, vehicle);
  const disposition = user.role === 'admin' ? clean(payload.oldDeviceDisposition || 'inventory') : 'provisioned';
  await unlinkDevice(base44, { user, host, deviceId: oldDeviceId, disposition, keepHostOwnership: user.role === 'host' || disposition !== 'inventory' });
  const linked = await linkDevice(base44, { user, host, deviceId: newDeviceId, vehicleId, allowReplace: true, overrideRetired: payload.overrideRetired === true });
  await logEvent(base44, 'device_replaced', { user, device: linked.device, vehicle, oldVehicleId: oldDeviceId, newVehicleId: newDeviceId, metadata: { old_device_id: oldDeviceId, new_device_id: newDeviceId, old_device_disposition: disposition } });
  return linked;
}
async function repairAssignment(base44, { user, host, vehicleId }) {
  const vehicle = await getOne(base44, 'Vehicle', vehicleId);
  assertVehicleAccess(user, host, vehicle);
  const linked = (await base44.asServiceRole.entities.TelematicsDevice.filter({ vehicle_id: vehicle.id })).filter(d => d.lifecycle_status !== 'retired');
  if (linked.length > 1) throw new Error('Multiple active devices linked. Use Replace/Unlink before repair.');
  const device = linked[0] || null;
  await base44.asServiceRole.entities.Vehicle.update(vehicle.id, { telematics_device_id: device?.id || '' });
  if (device && device.host_id !== vehicle.host_id) await base44.asServiceRole.entities.TelematicsDevice.update(device.id, { host_id: vehicle.host_id || '' });
  await logEvent(base44, 'device_assignment_repaired', { user, device: device || {}, vehicle, oldVehicleId: vehicle.telematics_device_id || '', newVehicleId: device?.id || '', metadata: { repaired_vehicle_id: vehicle.id } });
  return { device, vehicle_id: vehicle.id };
}
async function findOrCreateAndLink(base44, { user, host, vehicleId, typedDeviceId, providerKey = 'manual_unknown' }) {
  const value = clean(typedDeviceId);
  if (!value) throw new Error('Device ID is required');
  let devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: value });
  let device = devices[0] || null;
  if (!device) {
    device = await base44.asServiceRole.entities.TelematicsDevice.create({
      provider_key: clean(providerKey) || 'manual_unknown',
      provider_type: 'api',
      unique_id: value,
      provider_device_id: value,
      assigned_status: 'unassigned',
      lifecycle_status: 'inventory',
      install_status: 'not_started',
      online_status: 'unknown',
      ignition_status: 'unknown',
      gps_enabled: true,
      created_at: nowIso()
    });
  }
  return linkDevice(base44, { user, host, deviceId: device.id, vehicleId });
}
async function searchDevices(base44, { user, host, query = '', filters = {} }) {
  const [devices, vehicles, providers] = await Promise.all([
    base44.asServiceRole.entities.TelematicsDevice.list('-updated_date', 1000),
    base44.asServiceRole.entities.Vehicle.list('-updated_date', 1000),
    providerMap(base44)
  ]);
  const vehicleById = Object.fromEntries(vehicles.map(v => [v.id, v]));
  const ownVehicleIds = new Set(vehicles.filter(v => v.host_id === host?.id).map(v => v.id));
  const visible = devices.filter(d => {
    if (user.role === 'host' && !hostCanSeeDevice(host, ownVehicleIds, d)) return false;
    if (!hasText(d, query)) return false;
    if (filters.provider && filters.provider !== 'all' && d.provider_key !== filters.provider) return false;
    if (filters.lifecycle_status && filters.lifecycle_status !== 'all' && d.lifecycle_status !== filters.lifecycle_status) return false;
    if (filters.install_status && filters.install_status !== 'all' && d.install_status !== filters.install_status) return false;
    if (filters.assignment === 'unassigned' && d.vehicle_id) return false;
    if (filters.assignment === 'assigned' && !d.vehicle_id) return false;
    if (filters.online_status && filters.online_status !== 'all' && (d.online_status || 'unknown') !== filters.online_status) return false;
    return true;
  });
  return visible.slice(0, 100).map(d => deviceView(d, providers, vehicleById[d.vehicle_id]));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    assertAllowedUser(user);
    const host = user.role === 'host' ? await currentHost(base44, user) : null;
    if (user.role === 'host' && !host) throw new Error('Host profile not found');
    const body = await req.json();
    const action = clean(body.action);

    if (action === 'search_devices') return Response.json({ devices: await searchDevices(base44, { user, host, query: body.query || '', filters: body.filters || {} }) });
    if (action === 'link_device') return Response.json(await linkDevice(base44, { user, host, deviceId: body.device_id, vehicleId: body.vehicle_id, allowReplace: body.allow_replace === true, overrideRetired: body.override_retired === true }));
    if (action === 'unlink_device') return Response.json(await unlinkDevice(base44, { user, host, deviceId: body.device_id, disposition: body.disposition, keepHostOwnership: body.keep_host_ownership === true }));
    if (action === 'replace_device') return Response.json(await replaceDevice(base44, { user, host, oldDeviceId: body.old_device_id, newDeviceId: body.new_device_id, vehicleId: body.vehicle_id, oldDeviceDisposition: body.old_device_disposition, overrideRetired: body.override_retired === true }));
    if (action === 'repair_assignment') return Response.json(await repairAssignment(base44, { user, host, vehicleId: body.vehicle_id }));
    if (action === 'find_or_create_and_link') return Response.json(await findOrCreateAndLink(base44, { user, host, vehicleId: body.vehicle_id, typedDeviceId: body.typed_device_id, providerKey: body.provider_key }));

    return Response.json({ error: 'Unknown assignment action' }, { status: 400 });
  } catch (error) {
    const status = String(error.message || '').startsWith('Forbidden') ? 403 : String(error.message || '').startsWith('Unauthorized') ? 401 : 400;
    return Response.json({ error: error.message }, { status });
  }
});