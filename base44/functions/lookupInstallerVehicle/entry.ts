import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizeVin(vin) {
  return String(vin || '').trim().toUpperCase();
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