// Static zipcode lookup for common US zipcodes with city/state
const ZIPCODE_DB = {
  "60473": { lat: 41.6826, lon: -87.5400, city: "Chicago", state: "IL" },
  "60616": { lat: 41.8719, lon: -87.6183, city: "Chicago", state: "IL" },
  "60601": { lat: 41.8816, lon: -87.6191, city: "Chicago", state: "IL" },
  "60617": { lat: 41.8386, lon: -87.5730, city: "Chicago", state: "IL" },
  "10001": { lat: 40.7506, lon: -73.9972, city: "New York", state: "NY" },
  "10002": { lat: 40.7180, lon: -73.9950, city: "New York", state: "NY" },
  "90001": { lat: 33.9731, lon: -118.2479, city: "Los Angeles", state: "CA" },
  "90210": { lat: 34.0901, lon: -118.4065, city: "Los Angeles", state: "CA" },
  "77001": { lat: 29.7589, lon: -95.3677, city: "Houston", state: "TX" },
  "75201": { lat: 32.7767, lon: -96.7970, city: "Dallas", state: "TX" },
  "33101": { lat: 25.7617, lon: -80.1918, city: "Miami", state: "FL" },
};

Deno.serve(async (req) => {
  try {
    const { zipcode } = await req.json();

    if (!zipcode || zipcode.length !== 5 || !/^\d+$/.test(zipcode)) {
      return Response.json({ error: "Invalid zipcode format" }, { status: 400 });
    }

    // Check static database first
    if (ZIPCODE_DB[zipcode]) {
      const data = ZIPCODE_DB[zipcode];
      return Response.json({
        zipcode,
        lat: data.lat,
        lon: data.lon,
        city: data.city,
        state: data.state,
        displayName: `${data.city}, ${data.state}`,
      });
    }

    // Fallback to OpenStreetMap Nominatim
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

    return Response.json({
      zipcode,
      lat,
      lon,
      city: "Unknown",
      state: "US",
      displayName: "Unknown, US",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});