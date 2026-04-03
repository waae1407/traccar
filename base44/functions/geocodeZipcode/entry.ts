Deno.serve(async (req) => {
  try {
    const { zipcode } = await req.json();

    if (!zipcode || zipcode.length !== 5 || !/^\d+$/.test(zipcode)) {
      return Response.json({ error: "Invalid zipcode format" }, { status: 400 });
    }

    // Use OpenStreetMap Nominatim for zipcode lookup
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${zipcode}&country=us&format=json&limit=1`
    );

    const data = await res.json();

    if (!data || data.length === 0) {
      return Response.json({ error: "Zipcode not found" }, { status: 404 });
    }

    const result = data[0];
    const address = result.address || {};
    
    // Extract city (try multiple fallbacks)
    const city = address.city || address.town || address.village || address.county || "Unknown";
    
    // Extract state (two-letter code)
    const state = address.state || "US";
    
    return Response.json({
      zipcode,
      city,
      state,
      displayName: `${city}, ${state}`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});