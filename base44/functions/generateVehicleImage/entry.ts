import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event, data } = body;

    // Skip if image already exists
    if (data?.image_url) {
      console.log(`Vehicle ${data.id} already has an image, skipping generation`);
      return Response.json({ ok: true });
    }

    // Need year, make, model to generate
    if (!data?.year || !data?.make || !data?.model) {
      console.log(`Vehicle ${data.id} missing year/make/model, skipping generation`);
      return Response.json({ ok: true });
    }

    const { year, make, model, color } = data;
    
    console.log(`Generating cartoon image for ${year} ${make} ${model}`);

    // Generate detailed prompt for cartoon vehicle
    const prompt = `A cute, colorful cartoon-style illustration of a ${year} ${make} ${model}${color ? ` in ${color}` : ''}. 
    The car should be drawn in a friendly, playful cartoon style with simple rounded shapes and bright colors. 
    Show the full car from a 3/4 front-left angle. The background should be a simple, light gradient. 
    Professional, modern cartoon art style. High quality.`;

    // Generate image using Base44 integration
    const imageResult = await base44.integrations.Core.GenerateImage({
      prompt: prompt
    });

    if (!imageResult?.url) {
      console.error(`Failed to generate image for ${year} ${make} ${model}`);
      return Response.json({ ok: true }); // Don't fail the automation
    }

    // Update vehicle with generated image
    await base44.asServiceRole.entities.Vehicle.update(data.id, {
      image_url: imageResult.url
    });

    console.log(`✓ Generated and saved image for ${data.id}: ${imageResult.url}`);
    return Response.json({ ok: true, image_url: imageResult.url });
  } catch (error) {
    console.error("Image generation error:", error.message);
    return Response.json({ ok: true }); // Don't fail the automation
  }
});