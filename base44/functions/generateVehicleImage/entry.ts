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
      `Ultra-realistic luxury automotive lifestyle photo of a ${colorStr}${year} ${make} ${model} in an exotic California front scene. ` +
      `The vehicle paint color must be exactly ${color ? color.trim() : 'the correct factory color from the vehicle record'} — do not change it to silver, gray, black, white, or any other color unless that is the saved vehicle color. ` +
      `Keep the make, model, year, body shape, trim proportions, headlights, grille, wheels, and factory styling accurate to the real ${year} ${make} ${model}. ` +
      `Use one consistent premium hero composition for every vehicle: 3/4 front-left angle, perfectly centered, same scale, full vehicle visible, wheels straight, no cropping, no tilted camera, no unusual angle deviations. ` +
      `Scene must feel bright, aspirational, and expensive: Pacific Coast Highway / Malibu coastal cliffs at golden hour, soft ocean horizon, warm amber sunlight, subtle atmospheric haze, polished road surface, cinematic reflections, showroom-clean finish. ` +
      `All front headlights, daytime running lights, and front light elements are ON with tasteful electric blue/cyan glow. Blue illumination must come only from the actual front lights, not random body outlines, wheel arches, trim lines, doors, roof, or rear edges. ` +
      `Add refined warm rim lighting and natural ground reflection so the vehicle feels luxurious and dimensional, not dark or flat. ` +
      `No people, no text, no watermarks, no extra logos, no distorted proportions, no fantasy body kit, no incorrect vehicle color. ` +
      `Photorealistic, luxury automotive catalog quality, sharp focus, accurate make/model/year styling, unified fleet image style.`;

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