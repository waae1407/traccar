import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { data } = body;

    const city = (data?.city || data?.current_city || "").trim();
    if (!city) {
      console.log("No city, skipping geocoding");
      return Response.json({ ok: true });
    }

    // Skip if coordinates already exist
    if (data.vehicle_lat && data.vehicle_lon) {
      console.log("Coordinates already set, skipping");
      return Response.json({ ok: true });
    }

    const state = (data.state || "").trim();
    console.log(`Geocoding vehicle ${data.id} at ${city}, ${state}`);

    // Call Nominatim directly (no auth needed)
    const query = state ? `${city}, ${state}, USA` : `${city}, USA`;
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { "User-Agent": "uRide-app/1.0" } }
    );
    const geoData = await geoRes.json();

    if (geoData?.[0]?.lat && geoData?.[0]?.lon) {
      const lat = parseFloat(geoData[0].lat);
      const lon = parseFloat(geoData[0].lon);
      await base44.asServiceRole.entities.Vehicle.update(data.id, {
        vehicle_lat: lat,
        vehicle_lon: lon,
      });
      console.log(`✓ Updated vehicle ${data.id} with coords: ${lat}, ${lon}`);
    } else {
      console.warn(`Failed to geocode "${city}, ${state}"`);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Auto-geocode error:", error.message);
    return Response.json({ ok: true });
  }
});