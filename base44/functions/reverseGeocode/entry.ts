// Reverse-geocode lat/lon to a readable address using Nominatim
Deno.serve(async (req) => {
  try {
    const { lat, lon } = await req.json();
    if (!lat || !lon) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`,
      { headers: { "User-Agent": "uRide-App" } }
    );

    if (!res.ok) {
      return Response.json({ error: "Geocoding service unavailable" }, { status: 502 });
    }

    const data = await res.json();
    const addr = data.address || {};

    const city = addr.city || addr.town || addr.village || addr.suburb || addr.hamlet || "Unknown";
    const state = addr.state || "";
    const zip = addr.postcode || "";
    const displayAddress = data.display_name || [addr.road, city, state, zip].filter(Boolean).join(", ");

    console.log(`Reverse geocoded (${lat}, ${lon}) -> ${displayAddress}`);
    return Response.json({ address: displayAddress, display_name: displayAddress, city, state, zip, lat: parseFloat(lat), lon: parseFloat(lon) });
  } catch (error) {
    console.error("Reverse geocode error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});