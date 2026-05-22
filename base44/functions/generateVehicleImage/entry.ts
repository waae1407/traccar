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

    console.log(`[VehicleImage] Generating image for ${year} ${make} ${model} (${color || 'unknown color'})`);

    const colorStr = color ? `${color.trim()} ` : '';

    const prompt =
      `Ultra-realistic professional automotive studio photo of a ${colorStr}${year} ${make} ${model}. ` +
      `The vehicle paint color must be exactly ${color ? color.trim() : 'the correct factory color from the vehicle record'} — do not change it to silver, gray, black, or any other color unless that is the saved vehicle color. ` +
      `Show the car from a premium 3/4 front-left angle, perfectly centered, full vehicle visible with no cropping. ` +
      `Use high-end commercial car photography lighting with crisp reflections, realistic body panels, real tires, detailed wheels, glass, trim, and showroom-clean finish. ` +
      `The headlights and daytime running lights are ON with a vivid electric blue/cyan signature glow, casting a subtle cool blue light on the front bumper and ground. ` +
      `Background is a clean studio gradient from soft sky blue at the top to pure white at the bottom, airy and seamless. ` +
      `No people, no text, no watermarks, no extra logos, no distorted proportions, no fantasy body kit. ` +
      `Photorealistic, luxury automotive catalog quality, sharp focus, accurate make/model/year styling.`;

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