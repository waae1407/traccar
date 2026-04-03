// Get lat/lon for a city via Nominatim
Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { city, state } = body;

    if (!city) {
      return Response.json({ error: "City is required" }, { status: 400 });
    }

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state || "")}&country=US&format=json&limit=1`,
      { headers: { "User-Agent": "uRide-App" } }
    );

    if (!res.ok) {
      return Response.json({ error: "Geocoding service unavailable" }, { status: 502 });
    }

    const data = await res.json();
    if (data && data.length > 0) {
      const coords = {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
      };
      console.log(`Geocoded ${city}, ${state} -> ${coords.lat}, ${coords.lon}`);
      return Response.json(coords);
    }

    return Response.json({ error: "City not found" }, { status: 404 });
  } catch (error) {
    console.error("Geocode error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});