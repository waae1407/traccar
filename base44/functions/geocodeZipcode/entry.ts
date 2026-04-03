// Common zipcode mappings as fallback (hand-curated corrections)
const ZIPCODE_CACHE = {
  "91355": { city: "Castaic", state: "CA" },
  "60409": { city: "Calumet City", state: "Illinois" },
  "77037": { city: "Houston", state: "Texas" },
  "77038": { city: "Houston", state: "Texas" },
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
      // Extract city and state from display_name string
      // Format: "91351, Santa Clarita, Los Angeles County, California, United States"
      const displayNameParts = (result.display_name || "").split(",").map(p => p.trim());
      
      // Remove zipcode (first element)
      if (displayNameParts[0] === zipcode) {
        displayNameParts.shift();
      }
      
      // Remove country (last part is usually "United States")
      if (displayNameParts[displayNameParts.length - 1] === "United States") {
        displayNameParts.pop();
      }
      
      // State is the last remaining part
      const state = displayNameParts.pop() || "US";
      
      // Now find the city: prioritize non-admin names, fallback to county if needed
      let city = "Unknown";
      let fallbackCity = null;
      const adminTerms = ["County", "Township", "Parish", "Borough", "Municipality"];
      
      for (const part of displayNameParts) {
        const isAdmin = adminTerms.some(term => part.includes(term));
        if (!isAdmin && !fallbackCity) {
          city = part;
          break;
        } else if (isAdmin && !fallbackCity) {
          // Save county/township as fallback
          fallbackCity = part;
        }
      }
      
      // If no city found, use the fallback (county/township)
      if (city === "Unknown" && fallbackCity) {
        city = fallbackCity;
      }

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