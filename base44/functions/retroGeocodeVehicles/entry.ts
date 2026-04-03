import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Only admins can run this
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all vehicles
    const allVehicles = await base44.asServiceRole.entities.Vehicle.list();
    console.log(`Found ${allVehicles.length} total vehicles`);

    let updated = 0;
    let skipped = 0;

    for (const vehicle of allVehicles) {
      // Skip if already has coordinates
      if (vehicle.vehicle_lat && vehicle.vehicle_lon) {
        skipped++;
        continue;
      }

      // Skip if no city
      if (!vehicle.current_city) {
        skipped++;
        continue;
      }

      console.log(`Geocoding vehicle ${vehicle.id}: ${vehicle.current_city}`);

      try {
        // Call Nominatim directly
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(vehicle.current_city)}&state=${encodeURIComponent(vehicle.state || "")}&country=US&format=json&limit=1`,
          { headers: { "User-Agent": "uRide-App" } }
        );

        const data = await res.json();
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          
          // Update vehicle with coordinates
          await base44.asServiceRole.entities.Vehicle.update(vehicle.id, {
            vehicle_lat: lat,
            vehicle_lon: lon,
          });
          updated++;
          console.log(`✓ Updated ${vehicle.id} with ${lat}, ${lon}`);
        } else {
          console.warn(`✗ Failed to geocode ${vehicle.current_city}`);
          skipped++;
        }
      } catch (err) {
        console.error(`Error geocoding ${vehicle.id}:`, err.message);
        skipped++;
      }
    }

    return Response.json({
      message: `Geocoding complete`,
      updated,
      skipped,
      total: allVehicles.length,
    });
  } catch (error) {
    console.error("Retro-geocode error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});