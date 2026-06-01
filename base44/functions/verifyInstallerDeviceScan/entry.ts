import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizeDeviceId(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

async function findDeviceByIdentifier(base44, identifier) {
  const fields = ['unique_id', 'device_imei', 'provider_device_id', 'traccar_device_id', 'moovetrax_device_id'];
  for (const field of fields) {
    const matches = await base44.asServiceRole.entities.TelematicsDevice.filter({ [field]: identifier });
    if (matches[0]) return matches[0];
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const actualDeviceId = normalizeDeviceId(body.actual_device_id || body.device_id || body.unique_id);
    const now = new Date().toISOString();

    if (!actualDeviceId) return Response.json({ error: 'Physical device barcode is required' }, { status: 400 });

    let device = await findDeviceByIdentifier(base44, actualDeviceId);
    const createdPendingDevice = !device;

    if (!device) {
      device = await base44.asServiceRole.entities.TelematicsDevice.create({
        provider_key: 'unknown',
        unique_id: actualDeviceId,
        lifecycle_status: 'inventory',
        assigned_status: 'unassigned',
        install_status: 'not_started',
        online_status: 'unknown',
        created_at: now
      });
    }

    return Response.json({
      ok: true,
      status: 'verified',
      message: createdPendingDevice ? 'Device not found. Pending device record created for admin review.' : 'Device found.',
      actual_device_id: actualDeviceId,
      provider_key: device.provider_key || 'unknown',
      device,
      created_pending_device: createdPendingDevice
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});