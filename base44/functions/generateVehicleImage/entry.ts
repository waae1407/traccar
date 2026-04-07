import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { data } = body;

    // Skip if image already exists
    if (data?.image_url) {
      console.log(`[VehicleImage] Vehicle ${data.id} already has an image, skipping`);
      return Response.json({ ok: true });
    }

    // Need year, make, model to generate
    if (!data?.year || !data?.make || !data?.model) {
      console.log(`[VehicleImage] Vehicle ${data.id} missing year/make/model, skipping`);
      return Response.json({ ok: true });
    }

    const { id, year, make, model, color } = data;

    console.log(`[VehicleImage] Generating cartoon image for ${year} ${make} ${model} (${color || 'unknown color'})`);

    const prompt = `A vibrant, high-quality cartoon-style illustration of a ${year} ${make} ${model}${color ? ` in ${color}` : ''}. ` +
      `Drawn in a bold, playful cartoon style with clean outlines, smooth shading, and vivid colors. ` +
      `Show the full car from a 3/4 front-left angle on a simple light gradient background. ` +
      `No text, no people. Professional automotive cartoon art.`;

    const imageResult = await base44.asServiceRole.integrations.Core.GenerateImage({ prompt });

    if (!imageResult?.url) {
      console.error(`[VehicleImage] Image generation returned no URL for vehicle ${id}`);
      return Response.json({ ok: false, error: 'No image URL returned' });
    }

    await base44.asServiceRole.entities.Vehicle.update(id, { image_url: imageResult.url });

    console.log(`[VehicleImage] ✓ Saved image for vehicle ${id}: ${imageResult.url}`);
    return Response.json({ ok: true, image_url: imageResult.url });

  } catch (error) {
    console.error(`[VehicleImage] Error: ${error.message}`);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});