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
          `Ultra-realistic luxury automotive hero photo of a ${colorStr}${v.year} ${v.make} ${v.model}. ` +
          `Vehicle color is ${v.color ? v.color.trim() : 'correct factory color'} — render it exactly, do not substitute any other color. ` +
          `Accurate make/model/year body shape, trim proportions, headlights, grille, and wheels — no fantasy body kits, no distorted proportions. ` +
          `Composition: 3/4 front-left angle, perfectly centered, full vehicle visible, wheels straight, no cropping, no tilted camera. ` +
          `Background: deep dark exotic environment — dark premium studio or dramatic dusk skyline with deep charcoal/near-black tones, subtle atmospheric depth, polished reflective dark ground surface, cinematic rim lighting wrapping the vehicle silhouette. ` +
          `Front headlights and daytime running lights ON with a refined electric blue/cyan glow coming only from the actual headlight housings — no glow on body panels, trim lines, roof, or wheels. ` +
          `Warm amber rim lighting highlights the body curves and ground reflection so the vehicle reads as luxurious and dimensional. ` +
          `No people, no text, no watermarks, no logos, no bright coastal or outdoor scenes, no daylight sky, no streets. ` +
          `Photorealistic, premium automotive catalog quality, sharp focus, unified dark-luxury fleet style.`;

        const { data: imageResult } = await base44.asServiceRole.functions.invoke('generateImage', { prompt });

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