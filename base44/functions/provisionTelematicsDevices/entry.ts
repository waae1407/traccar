import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const TRACCAR_PROVIDER_KEY = 'traccar_noran_mt20';

function clean(value) { return String(value || '').trim(); }
function traccarBaseUrl() { return clean(Deno.env.get('TRACCAR_BASE_URL')).replace(/\/+$/, ''); }
function traccarAuthHeader() {
  return 'Basic ' + btoa(`${Deno.env.get('TRACCAR_USERNAME')}:${Deno.env.get('TRACCAR_PASSWORD')}`);
}
function isTraccarProvider(providerKey) { return providerKey === TRACCAR_PROVIDER_KEY; }
async function traccarFetch(path, options = {}) {
  const baseUrl = traccarBaseUrl();
  if (!baseUrl) throw new Error('TRACCAR_BASE_URL is not configured');
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: traccarAuthHeader(),
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Traccar ${path} failed with status ${response.status}: ${text}`);
  return data;
}
async function findTraccarDevice(uniqueId) {
  const devices = await traccarFetch('/api/devices');
  return (Array.isArray(devices) ? devices : []).find(device => clean(device.uniqueId).toUpperCase() === clean(uniqueId).toUpperCase()) || null;
}
async function ensureTraccarDevice(device) {
  if (!isTraccarProvider(device.provider_key)) return device;
  const existing = await findTraccarDevice(device.unique_id);
  const traccarDevice = existing || await traccarFetch('/api/devices', {
    method: 'POST',
    body: JSON.stringify({
      name: device.model || device.unique_id,
      uniqueId: device.unique_id,
      model: device.model || 'Noran MT20',
      category: 'car'
    })
  });
  return {
    ...device,
    provider_device_id: String(traccarDevice.id || device.provider_device_id || ''),
    traccar_device_id: String(traccarDevice.id || device.traccar_device_id || ''),
    model: device.model || traccarDevice.model || 'Noran MT20'
  };
}
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
      let device = normalize(row);
      if (!device.unique_id) { skipped.push({ row, reason: 'missing unique_id' }); continue; }
      device = await ensureTraccarDevice(device);
      const duplicate = await findDuplicate(base44, device);
      if (duplicate) {
        await base44.asServiceRole.entities.TelematicsDevice.update(duplicate.existing_id, {
          provider_device_id: device.provider_device_id,
          traccar_device_id: device.traccar_device_id,
          provider_type: device.provider_type,
          model: device.model
        });
        skipped.push({ row: device, reason: 'already exists locally; Traccar link refreshed', existing_id: duplicate.existing_id });
        continue;
      }
      const saved = await base44.asServiceRole.entities.TelematicsDevice.create(device);
      created.push(saved);
    }
    return Response.json({ ok: true, created_count: created.length, skipped_count: skipped.length, created, skipped });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});