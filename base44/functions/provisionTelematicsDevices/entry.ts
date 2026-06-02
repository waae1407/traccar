import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function clean(value) { return String(value || '').trim(); }
function noranCommandDefaults(providerKey, model = '') {
  const isNoran = providerKey === 'traccar_noran_mt20' || String(model || '').toLowerCase().includes('noran');
  return isNoran ? {
    gps_enabled: true,
    lock_unlock_enabled: true,
    horn_light_enabled: true,
    unlock_disarms_alarm: true,
    unlock_double_pulse_enabled: true,
    host_starter_control_enabled: true,
    installer_starter_test_enabled: true,
    production_commands_enabled: true,
    production_command_scope: 'all_supported_commands'
  } : {};
}
function normalize(row = {}) {
  const provider_key = clean(row.provider_key) || 'moovetrax';
  const unique_id = clean(row.unique_id || row.provider_device_id || row.imei);
  const host_id = clean(row.host_id);
  const vehicle_id = clean(row.vehicle_id);
  const installer = clean(row.assigned_installer_email || row.installer_email);
  const scheduled = clean(row.installation_scheduled_at);
  const lifecycle_status = vehicle_id || host_id ? 'assigned' : 'inventory';
  return {
    company_id: clean(row.company_id), provider_key, provider_type: clean(row.provider_type) || (provider_key.includes('traccar') ? 'traccar' : 'api'), unique_id,
    ...noranCommandDefaults(provider_key, row.model),
    device_imei: clean(row.device_imei || row.imei), sim_iccid: clean(row.sim_iccid), provider_device_id: clean(row.provider_device_id),
    traccar_device_id: clean(row.traccar_device_id), model: clean(row.model), batch_number: clean(row.batch_number), host_id,
    vehicle_id, assigned_status: vehicle_id || host_id ? 'assigned' : 'unassigned', install_status: clean(row.install_status) || 'not_started',
    lifecycle_status, assigned_installer_email: installer, installation_scheduled_at: scheduled,
    created_at: new Date().toISOString()
  };
}
async function findDuplicate(base44, device) {
  if (device.provider_key && device.unique_id) {
    const records = await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: device.provider_key, unique_id: device.unique_id });
    if (records[0]) return { reason: 'provider_key + unique_id', existing_id: records[0].id };
  }
  if (device.device_imei) {
    const records = await base44.asServiceRole.entities.TelematicsDevice.filter({ device_imei: device.device_imei });
    if (records[0]) return { reason: 'device_imei', existing_id: records[0].id };
  }
  if (device.sim_iccid) {
    const records = await base44.asServiceRole.entities.TelematicsDevice.filter({ sim_iccid: device.sim_iccid });
    if (records[0]) return { reason: 'sim_iccid', existing_id: records[0].id };
  }
  return null;
}
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    const body = await req.json();
    const rows = Array.isArray(body.devices) ? body.devices : [body.device || body];
    const created = [];
    const skipped = [];
    for (const row of rows) {
      const device = normalize(row);
      if (!device.unique_id) { skipped.push({ row, reason: 'missing unique_id' }); continue; }
      const duplicate = await findDuplicate(base44, device);
      if (duplicate) { skipped.push({ row: device, ...duplicate }); continue; }
      const saved = await base44.asServiceRole.entities.TelematicsDevice.create(device);
      created.push(saved);
    }
    return Response.json({ ok: true, created_count: created.length, skipped_count: skipped.length, created, skipped });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});