import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Regenerates images for current vehicles that need the new hyper-realistic standard
// Uses the saved vehicle color exactly with the blue-glow studio style

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const vehicles = await base44.asServiceRole.entities.Vehicle.list();

    // Keep the already-approved Porsche Macan images; regenerate the rest using the new standard.
    const targets = vehicles.filter(v => (v.make || '').toLowerCase() !== 'porsche');

    console.log(`[RegenerateImages] Regenerating ${targets.length} vehicles with the new hyper-realistic standard`);

    const results = [];

    for (const v of targets) {
      try {
        const colorStr = v.color ? `${v.color.trim()} ` : '';

        const prompt =
          `Ultra-realistic professional automotive studio photo of a ${colorStr}${v.year} ${v.make} ${v.model}. ` +
          `The vehicle paint color must be exactly ${v.color ? v.color.trim() : 'the correct factory color from the vehicle record'} — do not change it to silver, gray, black, or any other color unless that is the saved vehicle color. ` +
          `Show the car from a premium 3/4 front-left angle, perfectly centered, full vehicle visible with no cropping. ` +
          `Use high-end commercial car photography lighting with crisp reflections, realistic body panels, real tires, detailed wheels, glass, trim, and showroom-clean finish. ` +
          `The headlights and daytime running lights are ON with a vivid electric blue/cyan signature glow, casting a subtle cool blue light on the front bumper and ground. ` +
          `Background is a clean studio gradient from soft sky blue at the top to pure white at the bottom, airy and seamless. ` +
          `No people, no text, no watermarks, no extra logos, no distorted proportions, no fantasy body kit. ` +
          `Photorealistic, luxury automotive catalog quality, sharp focus, accurate make/model/year styling.`;

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