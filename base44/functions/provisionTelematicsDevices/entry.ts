import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function clean(value) { return String(value || '').trim(); }
function normalize(row = {}) {
  const provider_key = clean(row.provider_key) || 'moovetrax';
  const unique_id = clean(row.unique_id || row.provider_device_id || row.imei);
  return {
    company_id: clean(row.company_id), provider_key, provider_type: clean(row.provider_type) || (provider_key.includes('traccar') ? 'traccar' : 'api'), unique_id,
    device_imei: clean(row.device_imei || row.imei), sim_iccid: clean(row.sim_iccid), provider_device_id: clean(row.provider_device_id),
    traccar_device_id: clean(row.traccar_device_id), model: clean(row.model), batch_number: clean(row.batch_number), host_id: clean(row.host_id),
    vehicle_id: clean(row.vehicle_id), assigned_status: clean(row.vehicle_id) ? 'assigned' : 'unassigned', install_status: clean(row.install_status) || 'not_started',
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