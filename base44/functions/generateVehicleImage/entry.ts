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

    // Need year, make, model, color to generate
    if (!data?.year || !data?.make || !data?.model || !data?.color) {
      console.log(`[VehicleImage] Vehicle ${data?.id} missing year/make/model/color, skipping`);
      return Response.json({ ok: true });
    }

    const { id, year, make, model, color } = data;

    console.log(`[VehicleImage] Generating image for ${year} ${make} ${model} (${color || 'unknown color'})`);

    const colorStr = color ? `${color.trim()} ` : '';

    const prompt =
      `Ultra-realistic luxury automotive hero photo of a ${colorStr}${year} ${make} ${model}. ` +
      `Vehicle color is ${color ? color.trim() : 'correct factory color'} — render it exactly, do not substitute any other color. ` +
      `Accurate make/model/year body shape, trim proportions, headlights, grille, and wheels — no fantasy body kits, no distorted proportions. ` +
      `Composition: 3/4 front-left angle, perfectly centered, full vehicle visible, wheels straight, no cropping, no tilted camera. ` +
      `Background: deep dark exotic environment — dark premium studio or dramatic dusk skyline with deep charcoal/near-black tones, subtle atmospheric depth, polished reflective dark ground surface, cinematic rim lighting wrapping the vehicle silhouette. ` +
      `Front headlights and daytime running lights ON with a refined electric blue/cyan glow coming only from the actual headlight housings — no glow on body panels, trim lines, roof, or wheels. ` +
      `Warm amber rim lighting highlights the body curves and ground reflection so the vehicle reads as luxurious and dimensional. ` +
      `No people, no text, no watermarks, no logos, no bright coastal or outdoor scenes, no daylight sky, no streets. ` +
      `Photorealistic, premium automotive catalog quality, sharp focus, unified dark-luxury fleet style.`;

    const { data: imageResult } = await base44.asServiceRole.functions.invoke('generateImage', { prompt });

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