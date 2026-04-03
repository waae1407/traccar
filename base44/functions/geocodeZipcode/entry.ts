// Static zipcode lookup for common US zipcodes with city/state
const ZIPCODE_DB = {
  "60473": { city: "Chicago", state: "IL" },
  "60616": { city: "Chicago", state: "IL" },
  "60601": { city: "Chicago", state: "IL" },
  "60617": { city: "Chicago", state: "IL" },
  "10001": { city: "New York", state: "NY" },
  "10002": { city: "New York", state: "NY" },
  "90001": { city: "Los Angeles", state: "CA" },
  "90210": { city: "Los Angeles", state: "CA" },
  "77001": { city: "Houston", state: "TX" },
  "77036": { city: "Houston", state: "TX" },
  "75201": { city: "Dallas", state: "TX" },
  "33101": { city: "Miami", state: "FL" },
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
        city: data.city,
        state: data.state,
        displayName: `${data.city}, ${data.state}`,
      });
    }

    return Response.json({ error: "Zipcode not found" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});