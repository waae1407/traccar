import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let user;
  try {
    user = await base44.auth.me();
  } catch (e) {
    // If running from webhook or system it might throw, but let's assume auth is needed
  }
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let prompt = "";
  try {
    const payload = await req.json();
    prompt = payload.prompt;
    
    if (!prompt) {
      throw new Error("Prompt is required");
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");

    // We use Imagen 4.0 for image generation via Gemini API
    // Retry with exponential backoff on 429 (quota exceeded)
    let res, data;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1 }
        })
      });
      data = await res.json();
      if (res.ok) break;
      if (res.status === 429 && attempt < 2) {
        const backoffMs = (attempt + 1) * 5000; // 5s, 10s
        console.log(`[generateImage] 429 quota hit, backing off ${backoffMs}ms (attempt ${attempt + 1}/3)`);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      throw new Error(`Gemini Image API Error: ${JSON.stringify(data)}`);
    }

    if (data.predictions && data.predictions.length > 0 && data.predictions[0].bytesBase64Encoded) {
      const base64 = data.predictions[0].bytesBase64Encoded;
      
      let imageUrl = null;
      let storageProvider = null;
      
      try {
        const uploadRes = await base44.asServiceRole.functions.invoke('uploadToR2', {
          fileBase64: base64,
          fileName: `imagen-${Date.now()}.jpg`,
          fileType: 'image/jpeg'
        });
        
        if (uploadRes.data && uploadRes.data.file_url) {
          imageUrl = uploadRes.data.file_url;
          storageProvider = "cloudflare_r2";
        } else {
          throw new Error("Upload failed: " + JSON.stringify(uploadRes.data));
        }
      } catch (uploadError) {
        console.error("[generateImage] Image upload failed:", uploadError);
        throw new Error("Image generated but upload to storage failed");
      }
      
      const responsePayload = {
        image_url: imageUrl,
        storage_provider: storageProvider,
        filename: imageUrl.split('/').pop(),
        mime_type: "image/jpeg",
        size_bytes: Math.round((base64.length * 3) / 4),
        prompt: prompt,
        model: "imagen-4.0-generate-001",
        provider: "google",
        created_at: new Date().toISOString()
      };
      
      await base44.asServiceRole.entities.AIUsageLog.create({
        provider: "google",
        model: "imagen-4.0-generate-001",
        function_name: "generateImage",
        image_count: 1,
        estimated_cost: 0.03,
        user_id: user.id,
        success: true
      });

      // Maintain backward compatibility by returning 'url' directly as well
      return Response.json({ url: imageUrl, ...responsePayload });
    }

    throw new Error(`Unexpected image response: ${JSON.stringify(data)}`);

  } catch (error) {
    console.error("generateImage error:", error);
    await base44.asServiceRole.entities.AIUsageLog.create({
      provider: "google",
      model: "imagen-4.0-generate-001",
      function_name: "generateImage",
      success: false,
      user_id: user ? user.id : null,
      error_message: error.message
    });
    return Response.json({ error: error.message }, { status: 500 });
  }
});