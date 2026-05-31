// Reverse-geocode lat/lon to a readable address using Nominatim
Deno.serve(async (req) => {
  try {
    const { lat, lon } = await req.json();
    const parsedLat = Number(lat);
    const parsedLon = Number(lon);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) {
      return Response.json({ error: "valid lat and lon required" }, { status: 400 });
    }

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${parsedLat}&lon=${parsedLon}&format=json&addressdetails=1&zoom=18`,
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

    console.log(`Reverse geocoded (${parsedLat}, ${parsedLon}) -> ${displayAddress}`);
    return Response.json({ address: displayAddress, display_name: displayAddress, city, state, zip, lat: parsedLat, lon: parsedLon });
  } catch (error) {
    console.error("Reverse geocode error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});