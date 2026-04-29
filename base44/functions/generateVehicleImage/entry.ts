import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { data, force } = body;

    // Skip if image already exists (unless force regenerate)
    if (data?.image_url && !force) {
      console.log(`[VehicleImage] Vehicle ${data.id} already has an image, skipping`);
      return Response.json({ ok: true });
    }

    // Need year, make, model to generate
    if (!data?.year || !data?.make || !data?.model) {
      console.log(`[VehicleImage] Vehicle ${data?.id} missing year/make/model, skipping`);
      return Response.json({ ok: true });
    }

    const { id, year, make, model, color } = data;

    console.log(`[VehicleImage] Generating photorealistic image for ${year} ${make} ${model} (${color || 'unknown color'})`);

    const colorStr = color ? `${color.trim()} ` : '';

    const prompt =
      `A professional automotive studio photograph of a ${colorStr}${year} ${make} ${model}. ` +
      `The car is shown from a 3/4 front-left angle, perfectly centered. ` +
      `Studio setting with a smooth, seamless light grey gradient background — no texture, no reflections on the floor, no environment. ` +
      `Soft, even diffused studio lighting with subtle highlights on the bodywork. ` +
      `The car is clean, showroom condition, full vehicle visible with no cropping. ` +
      `Photorealistic, high resolution, commercial automotive photography style. ` +
      `No people, no text, no logos, no watermarks.`;

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