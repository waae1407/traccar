import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function sanitize(value = '') {
  return String(value).replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80);
}

function bridgePayload(vehicle) {
  return {
    company_id: vehicle.company_id || '',
    provider_key: 'moovetrax',
    provider_type: 'api',
    unique_id: `moovetrax:${sanitize(vehicle.moovetrax_device_id)}`,
    moovetrax_device_id: vehicle.moovetrax_device_id,
    provider_device_id: vehicle.moovetrax_device_id,
    vehicle_id: vehicle.id,
    host_id: vehicle.host_id || '',
    assigned_status: 'assigned',
    install_status: 'installed',
    lifecycle_status: 'live_enabled',
    gps_enabled: true,
    lock_unlock_enabled: true,
    horn_light_enabled: true,
    production_commands_enabled: true,
    production_command_scope: 'all_supported_commands',
    created_at: new Date().toISOString()
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const vehicles = await base44.asServiceRole.entities.Vehicle.list('-updated_date', 1000);
    const targets = vehicles.filter(vehicle => vehicle.moovetrax_device_id);
    let created = 0;
    let updated = 0;
    const bridged = [];

    for (const vehicle of targets) {
      const uniqueId = `moovetrax:${sanitize(vehicle.moovetrax_device_id)}`;
      const existingByUnique = await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: 'moovetrax', unique_id: uniqueId });
      const existingByVehicle = existingByUnique[0] ? [] : await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: 'moovetrax', vehicle_id: vehicle.id });
      const existing = existingByUnique[0] || existingByVehicle[0] || null;
      const payload = bridgePayload(vehicle);
      if (existing) {
        const saved = await base44.asServiceRole.entities.TelematicsDevice.update(existing.id, payload);
        updated += 1;
        bridged.push({ vehicle_id: vehicle.id, telematics_device_id: saved.id, action: 'updated' });
      } else {
        const saved = await base44.asServiceRole.entities.TelematicsDevice.create(payload);
        created += 1;
        bridged.push({ vehicle_id: vehicle.id, telematics_device_id: saved.id, action: 'created' });
      }
    }

    return Response.json({ ok: true, compatibility_only: true, source: 'Vehicle.moovetrax_device_id', canonical_target: 'TelematicsDevice', scanned: vehicles.length, eligible: targets.length, created, updated, bridged });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});