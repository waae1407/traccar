import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// This function regenerates images for all vehicles EXCEPT Porsche (which already look great)
// Call it once from the admin dashboard to batch-update all other vehicles

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all vehicles
    const vehicles = await base44.asServiceRole.entities.Vehicle.list();

    // Skip Porsches — they already look great
    const targets = vehicles.filter(v => {
      const make = (v.make || '').toLowerCase();
      return make !== 'porsche';
    });

    console.log(`[RegenerateImages] Found ${targets.length} non-Porsche vehicles to regenerate`);

    const results = [];

    for (const v of targets) {
      try {
        const colorStr = v.color ? `${v.color.trim()} ` : '';

        const prompt =
          `A professional automotive studio photograph of a ${colorStr}${v.year} ${v.make} ${v.model}. ` +
          `The car is shown from a 3/4 front-left angle, perfectly centered. ` +
          `Studio setting with a smooth, seamless light grey gradient background — no texture, no reflections on the floor, no environment. ` +
          `Soft, even diffused studio lighting with subtle highlights on the bodywork. ` +
          `The car is clean, showroom condition, full vehicle visible with no cropping. ` +
          `Photorealistic, high resolution, commercial automotive photography style. ` +
          `No people, no text, no logos, no watermarks.`;

        const imageResult = await base44.asServiceRole.integrations.Core.GenerateImage({ prompt });

        if (!imageResult?.url) {
          console.error(`[RegenerateImages] No URL for ${v.id}`);
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
    return Response.json({ ok: error.message }, { status: 500 });
  }
});