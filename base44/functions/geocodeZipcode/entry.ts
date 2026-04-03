Deno.serve(async (req) => {
  try {
    const { zipcode } = await req.json();

    if (!zipcode || zipcode.length !== 5 || !/^\d+$/.test(zipcode)) {
      return Response.json({ error: "Invalid zipcode format" }, { status: 400 });
    }

    // Use OpenStreetMap Nominatim (free, no API key needed)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${zipcode}&country=us&format=json`
    );

    const data = await res.json();

    if (!data || data.length === 0) {
      return Response.json({ error: "Zipcode not found" }, { status: 404 });
    }

    const result = data[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const addressParts = result.address || {};
    const city = addressParts.city || addressParts.town || addressParts.county || "";
    const state = addressParts.state || "";

    return Response.json({
      zipcode,
      lat,
      lon,
      city,
      state,
      displayName: `${city}, ${state}`.trim(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});