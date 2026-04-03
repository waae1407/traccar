import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const allVehicles = await base44.asServiceRole.entities.Vehicle.list();

    const summary = allVehicles.map(v => ({
      id: v.id,
      name: `${v.year} ${v.make} ${v.model}`,
      city: v.current_city,
      status: v.status,
      lat: v.vehicle_lat,
      lon: v.vehicle_lon,
    }));

    return Response.json(summary);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});