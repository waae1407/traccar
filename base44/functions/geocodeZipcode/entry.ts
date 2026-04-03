// Common zipcode mappings as fallback
const ZIPCODE_CACHE = {
  "91355": { city: "Castaic", state: "CA" },
};

Deno.serve(async (req) => {
  try {
    const { zipcode } = await req.json();

    if (!zipcode || zipcode.length !== 5 || !/^\d+$/.test(zipcode)) {
      return Response.json({ error: "Invalid zipcode format" }, { status: 400 });
    }

    // Check cache first
    if (ZIPCODE_CACHE[zipcode]) {
      const data = ZIPCODE_CACHE[zipcode];
      return Response.json({
        zipcode,
        city: data.city,
        state: data.state,
        displayName: `${data.city}, ${data.state}`,
      });
    }

    // Try USPS/Google Geocoding via free public API
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?postalcode=${zipcode}&country=US&format=json&limit=1`,
        { headers: { "User-Agent": "uRide-App" } }
      );

      const data = await res.json();

      if (data && data.length > 0) {
        const result = data[0];
        const address = result.address || {};
        const city = address.city || address.town || address.village || address.county || "Unknown";
        const state = address.state || "US";

        return Response.json({
          zipcode,
          city,
          state,
          displayName: `${city}, ${state}`,
        });
      }
    } catch (apiError) {
      console.error("Nominatim API error:", apiError.message);
    }

    return Response.json({ error: "Zipcode not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});