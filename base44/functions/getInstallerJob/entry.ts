import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function publicDevice(device = {}) {
  return {
    id: device.id,
    unique_id: device.unique_id,
    provider_key: device.provider_key,
    model: device.model,
    vehicle_id: device.vehicle_id,
    install_status: device.install_status,
    lifecycle_status: device.lifecycle_status
  };
}

function publicVehicle(vehicle = {}) {
  return {
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    color: vehicle.color,
    plate: vehicle.plate,
    pickup_address: vehicle.pickup_address,
    city: vehicle.city,
    state: vehicle.state
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { install_token } = await req.json();
    if (!install_token || String(install_token).length < 32) return Response.json({ error: 'Invalid installation link' }, { status: 400 });

    const records = await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ install_token });
    const record = records[0];
    if (!record) return Response.json({ error: 'Invalid installation link' }, { status: 404 });

    const now = Date.now();
    const expiresAt = record.install_token_expires_at ? new Date(record.install_token_expires_at).getTime() : 0;
    if (record.installer_access_status === 'revoked') return Response.json({ error: 'This installation link has been revoked' }, { status: 403 });
    if (expiresAt && expiresAt < now) {
      await base44.asServiceRole.entities.TelematicsInstallRecord.update(record.id, { installer_access_status: 'expired' });
      return Response.json({ error: 'This installation link has expired' }, { status: 403 });
    }

    const devices = record.telematics_device_id ? await base44.asServiceRole.entities.TelematicsDevice.filter({ id: record.telematics_device_id }) : [];
    const vehicles = record.vehicle_id ? await base44.asServiceRole.entities.Vehicle.filter({ id: record.vehicle_id }) : [];

    return Response.json({
      record: {
        id: record.id,
        installer_email: record.installer_email || record.assigned_installer_email || '',
        installer_phone: record.installer_phone || '',
        installer_access_status: record.installer_access_status || 'active',
        install_status: record.install_status || 'not_started',
        qa_status: record.qa_status || 'not_submitted',
        installation_notes: record.installation_notes || '',
        install_photos: record.install_photos || [],
        voltage_verified: !!record.voltage_verified,
        gps_verified: !!record.gps_verified,
        ignition_verified: !!record.ignition_verified,
        lock_unlock_verified: !!record.lock_unlock_verified,
        tamper_check_verified: !!record.tamper_check_verified,
        installer_signature_name: record.installer_signature_name || '',
        install_token_expires_at: record.install_token_expires_at || ''
      },
      device: publicDevice(devices[0]),
      vehicle: publicVehicle(vehicles[0]),
      locked: record.installer_access_status === 'submitted' || record.qa_status === 'pending' || record.qa_status === 'approved'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});