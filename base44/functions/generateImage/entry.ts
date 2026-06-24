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

      // Inline R2 upload (avoids auth-context issues when calling uploadToR2 via functions.invoke)
      const accountId = Deno.env.get('R2_ACCOUNT_ID');
      const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
      const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
      const bucketName = Deno.env.get('R2_BUCKET_NAME');
      const publicUrl = Deno.env.get('R2_PUBLIC_URL');

      if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
        throw new Error("R2 storage not configured");
      }

      const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
      const bodyBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const key = `uploads/imagen-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const contentType = 'image/jpeg';
      const host = `${accountId}.r2.cloudflarestorage.com`;
      const url = `https://${host}/${bucketName}/${key}`;

      const now = new Date();
      const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
      const dateShort = dateStr.slice(0, 8);
      const region = 'auto';
      const service = 's3';

      const bodyHash = await crypto.subtle.digest('SHA-256', bodyBytes);
      const bodyHashHex = Array.from(new Uint8Array(bodyHash)).map(b => b.toString(16).padStart(2, '0')).join('');

      const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${bodyHashHex}\nx-amz-date:${dateStr}\n`;
      const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
      const canonicalRequest = `PUT\n/${bucketName}/${key}\n\n${canonicalHeaders}\n${signedHeaders}\n${bodyHashHex}`;

      const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;
      const crHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest));
      const crHashHex = Array.from(new Uint8Array(crHash)).map(b => b.toString(16).padStart(2, '0')).join('');
      const stringToSign = `AWS4-HMAC-SHA256\n${dateStr}\n${credentialScope}\n${crHashHex}`;

      const hmac = async (hmacKey, hmacData) => {
        const k = await crypto.subtle.importKey('raw', typeof hmacKey === 'string' ? new TextEncoder().encode(hmacKey) : hmacKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        return new Uint8Array(await crypto.subtle.sign('HMAC', k, typeof hmacData === 'string' ? new TextEncoder().encode(hmacData) : hmacData));
      };

      const signingKey = await hmac(await hmac(await hmac(await hmac(`AWS4${secretAccessKey}`, dateShort), region), service), 'aws4_request');
      const signature = Array.from(await hmac(signingKey, stringToSign)).map(b => b.toString(16).padStart(2, '0')).join('');
      const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const r2Res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'x-amz-content-sha256': bodyHashHex, 'x-amz-date': dateStr, 'Authorization': authHeader },
        body: bodyBytes,
      });

      if (!r2Res.ok) {
        const errText = await r2Res.text();
        throw new Error(`R2 upload failed: ${errText}`);
      }

      const imageUrl = `${publicUrl.replace(/\/$/, '')}/${key}`;
      const storageProvider = "cloudflare_r2";
      
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