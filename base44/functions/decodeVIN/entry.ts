Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { vin } = body;

    if (!vin || vin.length < 10) {
      return Response.json({ error: "Invalid VIN format" }, { status: 400 });
    }

    // Call NHTSA API to decode VIN (free, no auth required)
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`
    );

    if (!res.ok) {
      return Response.json({ error: "VIN lookup failed" }, { status: 502 });
    }

    const data = await res.json();
    
    if (data.Results?.length === 0) {
      return Response.json({ error: "VIN not found" }, { status: 404 });
    }

    // Extract year, make, model from results
    const results = data.Results;
    const year = results.find(r => r.Variable === "Model Year")?.Value;
    const make = results.find(r => r.Variable === "Make")?.Value;
    const model = results.find(r => r.Variable === "Model")?.Value;

    if (!year || !make || !model) {
      return Response.json({ error: "Could not decode VIN details" }, { status: 422 });
    }

    return Response.json({
      year: parseInt(year),
      make,
      model,
    });
  } catch (error) {
    console.error("VIN decode error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});