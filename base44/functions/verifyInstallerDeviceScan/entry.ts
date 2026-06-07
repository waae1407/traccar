import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizeDeviceId(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function baseUrl() { return String(Deno.env.get('TRACCAR_BASE_URL') || '').replace(/\/+$/, ''); }
function authHeader() { return 'Basic ' + btoa(`${Deno.env.get('TRACCAR_USERNAME')}:${Deno.env.get('TRACCAR_PASSWORD')}`); }
function noranCommandDefaults() {
  return {
    provider_key: 'traccar_noran_mt20',
    provider_type: 'traccar',
    model: 'Noran MT20',
    gps_enabled: true,
    lock_unlock_enabled: true,
    horn_light_enabled: true,
    unlock_disarms_alarm: true,
    unlock_double_pulse_enabled: true,
    host_starter_control_enabled: true,
    installer_starter_test_enabled: true,
    production_commands_enabled: false,
    production_command_scope: 'non_starter_only'
  };
}
async function findTraccarDevice(identifier) {
  if (!baseUrl()) return null;
  const response = await fetch(`${baseUrl()}/api/devices`, { headers: { Authorization: authHeader(), Accept: 'application/json' } });
  if (!response.ok) return null;
  const devices = await response.json();
  return (Array.isArray(devices) ? devices : []).find(device => normalizeDeviceId(device.uniqueId) === identifier || normalizeDeviceId(device.name) === identifier) || null;
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
    const traccarDevice = await findTraccarDevice(actualDeviceId);

    if (!device && !traccarDevice) {
      return Response.json({
        error: 'Device was not found in Traccar. Provision it before installation can continue.',
        requires_provisioning: true,
        actual_device_id: actualDeviceId
      }, { status: 409 });
    }

    if (!device) {
      device = await base44.asServiceRole.entities.TelematicsDevice.create({
        provider_key: 'traccar_noran_mt20',
        provider_type: 'traccar',
        unique_id: actualDeviceId,
        provider_device_id: String(traccarDevice.id),
        traccar_device_id: String(traccarDevice.id),
        model: 'Noran MT20',
        lifecycle_status: 'inventory',
        assigned_status: 'unassigned',
        install_status: 'not_started',
        online_status: traccarDevice.status || 'unknown',
        ...noranCommandDefaults(),
        created_at: now
      });
    } else if (traccarDevice && device.provider_key !== 'traccar_noran_mt20') {
      device = await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
        ...noranCommandDefaults(),
        provider_device_id: String(traccarDevice.id),
        traccar_device_id: String(traccarDevice.id),
        online_status: traccarDevice.status || device.online_status || 'unknown'
      });
    }

    return Response.json({
      ok: true,
      status: 'verified',
      message: traccarDevice ? 'Device found in Traccar and command-ready.' : 'Device found locally. Traccar link should be verified before final installation submission.',
      actual_device_id: actualDeviceId,
      provider_key: device.provider_key || 'unknown',
      device,
      created_pending_device: false
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});