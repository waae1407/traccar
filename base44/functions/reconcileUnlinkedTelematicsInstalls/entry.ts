import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ADMIN_EMAIL = 'admin@uridehub.com';

function normalizeVin(vin) {
  return String(vin || '').trim().toUpperCase();
}

function vehicleName(vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin || vehicle.id;
}

async function safeSendEmail(base44, payload) {
  try {
    await base44.asServiceRole.functions.invoke('sendEmail', payload);
  } catch (error) {
    console.error('[reconcile-unlinked-installs] email failed:', error.message);
  }
}

async function resolveAlert(base44, vin, vehicle, record) {
  const alerts = await base44.asServiceRole.entities.OperationalAlert.filter({ dedupe_key: `installer_vin_not_found:${vin}` });
  if (!alerts[0]) return;
  await base44.asServiceRole.entities.OperationalAlert.update(alerts[0].id, {
    status: 'resolved',
    resolved_at: new Date().toISOString(),
    resolved_by: 'reconcileUnlinkedTelematicsInstalls',
    resolution_notes: `Matched to vehicle ${vehicle.id}.`,
    vehicle_id: vehicle.id,
    host_id: vehicle.host_id || '',
    install_record_id: record.id
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const pending = await base44.asServiceRole.entities.TelematicsInstallRecord.filter({ vehicle_match_status: 'pending_vehicle_link' }, '-updated_date', 50);
    const linked = [];

    for (const record of pending) {
      const vin = normalizeVin(record.vin_entered || record.vin);
      if (!vin) continue;

      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ vin });
      const vehicle = vehicles[0];
      if (!vehicle) continue;

      let host = null;
      if (vehicle.host_id) {
        const hosts = await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id });
        host = hosts[0] || null;
      }

      await base44.asServiceRole.entities.TelematicsInstallRecord.update(record.id, {
        vehicle_id: vehicle.id,
        host_id: vehicle.host_id || '',
        vehicle_match_status: 'matched'
      });

      if (record.telematics_device_id) {
        await base44.asServiceRole.entities.TelematicsDevice.update(record.telematics_device_id, {
          vehicle_id: vehicle.id,
          host_id: vehicle.host_id || '',
          assigned_status: 'assigned',
          lifecycle_status: 'installation_completed'
        });
      }

      await resolveAlert(base44, vin, vehicle, record);

      const subject = 'Pending telematics install linked to vehicle';
      const body = `<p>Device ${record.device_unique_id || record.telematics_device_id} has been linked to ${vehicleName(vehicle)} after VIN ${vin} was added.</p>`;
      await safeSendEmail(base44, { to: ADMIN_EMAIL, subject, body });
      if (host?.email) await safeSendEmail(base44, { to: host.email, subject, body });

      linked.push({ install_record_id: record.id, vehicle_id: vehicle.id, host_id: vehicle.host_id || '', vin });
    }

    return Response.json({ ok: true, checked: pending.length, linked });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});