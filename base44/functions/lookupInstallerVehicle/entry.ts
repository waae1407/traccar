import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizeVin(vin) {
  return String(vin || '').trim().toUpperCase();
}

async function upsertVinAlert(base44, payload) {
  const existing = await base44.asServiceRole.entities.OperationalAlert.filter({ dedupe_key: payload.dedupe_key });
  if (existing[0]) {
    return await base44.asServiceRole.entities.OperationalAlert.update(existing[0].id, {
      ...payload,
      repeat_count: Number(existing[0].repeat_count || 1) + 1,
      last_duplicate_at: new Date().toISOString(),
      status: existing[0].status === 'resolved' ? 'new' : existing[0].status
    });
  }
  return await base44.asServiceRole.entities.OperationalAlert.create(payload);
}

function publicVehicle(vehicle) {
  if (!vehicle) return null;
  return {
    id: vehicle.id,
    vin: vehicle.vin,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    image_url: vehicle.image_url || '',
    status: vehicle.status || '',
    host_id: vehicle.host_id || ''
  };
}

function publicHost(host) {
  if (!host) return null;
  return {
    id: host.id,
    full_name: host.full_name || '',
    business_name: host.business_name || '',
    status: host.status || ''
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const vin = normalizeVin(body.vin);

    if (!vin || vin.length !== 17) {
      return Response.json({ ok: false, matched: false, error: 'A valid 17-character VIN is required' }, { status: 400 });
    }

    const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ vin });
    const vehicle = vehicles[0] || null;
    let host = null;

    if (vehicle?.host_id) {
      const hosts = await base44.asServiceRole.entities.Host.filter({ id: vehicle.host_id });
      host = hosts[0] || null;
    }

    if (!vehicle) {
      await upsertVinAlert(base44, {
        alert_type: 'vin_mismatch_install',
        severity: 'high',
        status: 'new',
        title: 'Vehicle VIN not found during install',
        message: `Installer scanned VIN ${vin}, but it was not found in uRideHub.`,
        recommended_action: 'Verify the vehicle inventory record before installation continues.',
        domain: 'installers',
        source_entity_type: 'Vehicle',
        source_entity_id: vin,
        provider_key: String(body.provider_key || ''),
        dedupe_key: `installer_vin_not_found:${vin}`,
        first_seen_at: new Date().toISOString(),
        metadata: { vin, actual_device_id: body.actual_device_id || body.device_id || '', expected_device_id: body.expected_device_id || '' }
      });
    }

    return Response.json({
      ok: true,
      matched: !!vehicle,
      vehicle: publicVehicle(vehicle),
      host: publicHost(host)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});