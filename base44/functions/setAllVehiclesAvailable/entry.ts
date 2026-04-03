import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const allVehicles = await base44.asServiceRole.entities.Vehicle.list();
    
    let updated = 0;
    for (const vehicle of allVehicles) {
      if (vehicle.status !== 'Available') {
        await base44.asServiceRole.entities.Vehicle.update(vehicle.id, { status: 'Available' });
        updated++;
        console.log(`✓ Set ${vehicle.id} to Available`);
      }
    }

    return Response.json({ message: `Updated ${updated} vehicles to Available` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});