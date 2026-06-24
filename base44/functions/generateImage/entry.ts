import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const { prompt } = payload;
    
    if (!prompt) {
      throw new Error("Prompt is required");
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

    // We use Imagen 4.0 for image generation via Gemini API
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 }
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Gemini Image API Error: ${JSON.stringify(data)}`);
    }

    if (data.predictions && data.predictions.length > 0 && data.predictions[0].bytesBase64Encoded) {
      const base64 = data.predictions[0].bytesBase64Encoded;
      // Convert to an inline data URL
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      return Response.json({ url: dataUrl });
    }

    throw new Error(`Unexpected image response: ${JSON.stringify(data)}`);

  } catch (error) {
    console.error("generateImage error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});