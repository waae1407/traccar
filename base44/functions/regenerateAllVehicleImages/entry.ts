import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Regenerates images for all current vehicles using the unified luxury California lifestyle standard
// Uses the saved vehicle color exactly with accurate make/model/year styling

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const vehicles = await base44.asServiceRole.entities.Vehicle.list();

    // Regenerate every current vehicle so the fleet has one unified visual standard.
    const targets = vehicles;

    console.log(`[RegenerateImages] Regenerating ${targets.length} vehicles with the new hyper-realistic standard`);

    const results = [];

    for (const v of targets) {
      try {
        const colorStr = v.color ? `${v.color.trim()} ` : '';

        const prompt =
          `Ultra-realistic luxury automotive lifestyle photo of a ${colorStr}${v.year} ${v.make} ${v.model} in an exotic California front scene. ` +
          `The vehicle paint color must be exactly ${v.color ? v.color.trim() : 'the correct factory color from the vehicle record'} — do not change it to silver, gray, black, white, or any other color unless that is the saved vehicle color. ` +
          `Keep the make, model, year, body shape, trim proportions, headlights, grille, wheels, and factory styling accurate to the real ${v.year} ${v.make} ${v.model}. ` +
          `Use one consistent premium hero composition for every vehicle: 3/4 front-left angle, perfectly centered, same scale, full vehicle visible, wheels straight, no cropping, no tilted camera, no unusual angle deviations. ` +
          `Scene must feel bright, aspirational, and expensive: Pacific Coast Highway / Malibu coastal cliffs at golden hour, soft ocean horizon, warm amber sunlight, subtle atmospheric haze, polished road surface, cinematic reflections, showroom-clean finish. ` +
          `All front headlights, daytime running lights, and front light elements are ON with tasteful electric blue/cyan glow. Blue illumination must come only from the actual front lights, not random body outlines, wheel arches, trim lines, doors, roof, or rear edges. ` +
          `Add refined warm rim lighting and natural ground reflection so the vehicle feels luxurious and dimensional, not dark or flat. ` +
          `No people, no text, no watermarks, no extra logos, no distorted proportions, no fantasy body kit, no incorrect vehicle color. ` +
          `Photorealistic, luxury automotive catalog quality, sharp focus, accurate make/model/year styling, unified fleet image style.`;

        const imageResult = await base44.asServiceRole.integrations.Core.GenerateImage({ prompt });

        if (!imageResult?.url) {
          results.push({ id: v.id, status: 'failed', error: 'No URL returned' });
          continue;
        }

        await base44.asServiceRole.entities.Vehicle.update(v.id, { image_url: imageResult.url });
        console.log(`[RegenerateImages] ✓ ${v.year} ${v.make} ${v.model}`);
        results.push({ id: v.id, status: 'ok', vehicle: `${v.year} ${v.make} ${v.model}` });

      } catch (err) {
        console.error(`[RegenerateImages] Failed for ${v.id}: ${err.message}`);
        results.push({ id: v.id, status: 'failed', error: err.message });
      }
    }

    return Response.json({ ok: true, processed: targets.length, results });

  } catch (error) {
    console.error(`[RegenerateImages] Fatal: ${error.message}`);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});