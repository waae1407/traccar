// Hard-coded corrections for zipcodes that APIs resolve to neighborhoods instead of cities
const ZIPCODE_OVERRIDES = {
  "60616": { city: "Chicago", state: "Illinois", lat: 41.8456, lon: -87.6185 },
  "60409": { city: "Calumet City", state: "Illinois", lat: 41.5575, lon: -87.5293 },
  "77037": { city: "Houston", state: "Texas", lat: 29.7589, lon: -95.3677 },
  "77038": { city: "Houston", state: "Texas", lat: 29.7204, lon: -95.2588 },
};

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

// Get lat/lon for a city via Nominatim
async function getCityCoords(city, state) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?city=${city}&state=${state}&country=US&format=json&limit=1`,
      { headers: { "User-Agent": "uRide-App" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.error(`City coords lookup failed for ${city}, ${state}:`, err.message);
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

    // Check overrides first (zipcodes that APIs misresolved)
    if (ZIPCODE_OVERRIDES[zipcode]) {
      const override = ZIPCODE_OVERRIDES[zipcode];
      console.log(`Using override: ${zipcode} -> ${override.city}, ${override.state}`);
      return Response.json({
        zipcode,
        city: override.city,
        state: override.state,
        lat: override.lat,
        lon: override.lon,
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

      // Get lat/lon for the resolved city
      let lat = null, lon = null;
      if (city !== "Unknown") {
        const coords = await getCityCoords(city, state);
        if (coords) {
          lat = coords.lat;
          lon = coords.lon;
        }
      }

      console.log(`Resolved: ${zipcode} -> ${city}, ${state} (${lat}, ${lon})`);
      return Response.json({
        zipcode,
        city,
        state,
        lat,
        lon,
      });
    }

    console.error(`No results for zipcode: ${zipcode}`);
    return Response.json({ error: "Zipcode not found" }, { status: 404 });
  } catch (error) {
    console.error("Function error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});