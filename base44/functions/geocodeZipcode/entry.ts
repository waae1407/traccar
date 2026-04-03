// Fallback: try online zipcode lookup via zippopotam.us
async function lookupZipcodeOnline(zipcode) {
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zipcode}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.places && data.places.length > 0) {
      const place = data.places[0];
      return { city: place["place name"], state: data["state abbreviation"] };
    }
  } catch (err) {
    console.error(`Zippopotam lookup failed for ${zipcode}:`, err.message);
  }
  return null;
}

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
      
      // Now find the city: prioritize non-admin names
      let city = null;
      const adminTerms = ["County", "Township", "Parish", "Borough", "Municipality"];
      
      for (const part of displayNameParts) {
        const isAdmin = adminTerms.some(term => part.includes(term));
        if (!isAdmin) {
          city = part;
          break;
        }
      }

      // If still no city found, try online zipcode lookup
      if (!city) {
        console.log(`Nominatim didn't find city for ${zipcode}, trying zippopotam.us...`);
        const onlineData = await lookupZipcodeOnline(zipcode);
        if (onlineData) {
          city = onlineData.city;
        } else {
          city = "Unknown";
        }
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