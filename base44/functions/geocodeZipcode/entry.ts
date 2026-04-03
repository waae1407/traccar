// Common zipcode mappings as fallback
const ZIPCODE_CACHE = {
  "91355": { city: "Castaic", state: "CA" },
};

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    let zipcode = body.zipcode;
    
    // Ensure zipcode is a string
    zipcode = String(zipcode).trim();

    if (!zipcode || zipcode.length !== 5 || !/^\d+$/.test(zipcode)) {
      console.error("Invalid zipcode format:", zipcode);
      return Response.json({ error: "Invalid zipcode format" }, { status: 400 });
    }

    // Check cache first
    if (ZIPCODE_CACHE[zipcode]) {
      const data = ZIPCODE_CACHE[zipcode];
      console.log(`Found in cache: ${zipcode} -> ${data.city}, ${data.state}`);
      return Response.json({
        zipcode,
        city: data.city,
        state: data.state,
        displayName: `${data.city}, ${data.state}`,
      });
    }

    // Try OpenStreetMap Nominatim API
    console.log(`Querying Nominatim for zipcode: ${zipcode}`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${zipcode}&country=US&format=json&limit=1`,
      { headers: { "User-Agent": "uRide-App" } }
    );

    const data = await res.json();
    console.log(`Nominatim response for ${zipcode}:`, data);

    if (data && data.length > 0) {
      const result = data[0];
      const address = result.address || {};
      const city = address.city || address.town || address.village || address.county || "Unknown";
      const state = address.state || "US";

      console.log(`Resolved: ${zipcode} -> ${city}, ${state}`);
      return Response.json({
        zipcode,
        city,
        state,
        displayName: `${city}, ${state}`,
      });
    }

    console.error(`No results for zipcode: ${zipcode}`);
    return Response.json({ error: "Zipcode not found" }, { status: 404 });
  } catch (error) {
    console.error("Function error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});