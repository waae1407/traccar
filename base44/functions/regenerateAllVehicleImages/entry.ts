import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Regenerates images for all vehicles EXCEPT Porsche (already perfect)
// Uses the same sky-blue-to-white gradient background matching the Porsche style

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const vehicles = await base44.asServiceRole.entities.Vehicle.list();

    // Skip Porsches — they already look great
    const targets = vehicles.filter(v => (v.make || '').toLowerCase() !== 'porsche');

    console.log(`[RegenerateImages] Regenerating ${targets.length} non-Porsche vehicles`);

    const results = [];

    for (const v of targets) {
      try {
        const colorStr = v.color ? `${v.color.trim()} ` : '';

        const prompt =
          `A professional automotive studio illustration of a ${colorStr}${v.year} ${v.make} ${v.model}. ` +
          `The car is shown from a 3/4 front-left angle, perfectly centered, full vehicle visible with no cropping. ` +
          `The headlights and daytime running lights are ON and glowing with a vivid electric blue/cyan color, casting a cool blue light on the front bumper and ground — similar to modern Porsche DRL lighting. ` +
          `Background is a smooth gradient that transitions from a soft sky blue at the top to pure white at the bottom — clean, airy, and seamless. ` +
          `No floor reflections, no shadows, no environment details. ` +
          `Soft studio lighting with gentle highlights on the bodywork. The car is clean, showroom condition. ` +
          `Semi-realistic illustration style with clean lines, similar to high-end automotive CGI rendering. ` +
          `No people, no text, no logos, no watermarks.`;

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