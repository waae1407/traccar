import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event, data } = body;

    if (!data?.current_city) {
      console.log("No current_city, skipping geocoding");
      return Response.json({ ok: true });
    }

    // Skip if coordinates already exist
    if (data.vehicle_lat && data.vehicle_lon) {
      console.log("Coordinates already set, skipping");
      return Response.json({ ok: true });
    }

    console.log(`Geocoding vehicle ${data.id} at ${data.current_city}`);

    // Call geocodeCity function
    const geocodeRes = await base44.functions.invoke("geocodeCity", {
      city: data.current_city,
      state: data.state || "",
    });

    if (geocodeRes.data?.lat && geocodeRes.data?.lon) {
      // Update vehicle with coordinates
      await base44.asServiceRole.entities.Vehicle.update(data.id, {
        vehicle_lat: geocodeRes.data.lat,
        vehicle_lon: geocodeRes.data.lon,
      });
      console.log(`Updated ${data.id} with coords: ${geocodeRes.data.lat}, ${geocodeRes.data.lon}`);
    } else {
      console.warn(`Failed to geocode ${data.current_city}`);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Auto-geocode error:", error.message);
    return Response.json({ ok: true }); // Don't fail the automation
  }
});