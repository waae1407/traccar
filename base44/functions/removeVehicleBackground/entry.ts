import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { encodeBase64, decodeBase64 } from 'jsr:@std/encoding@1/base64';

// Replaces a vehicle photo's background with pure black so the car blends into
// the dark My Vehicle header. Saves the result to Vehicle.hero_image_url and
// leaves the original image_url untouched.
//
// Admins may force a re-run. Anyone else (customers viewing My Vehicle, the
// image-generation pipeline via service role) can only trigger it when the
// hero is missing or stale, so repeated calls cost nothing.

const MODEL = 'gemini-2.5-flash-image';
const PROMPT =
  'Edit this photo. Keep the vehicle EXACTLY as it is: same make, model, body shape, paint color, angle, wheels, ' +
  'headlights, badges and every detail unchanged, at the same size and position in the frame. ' +
  'Remove everything that is not the vehicle — studio backdrop, walls, sky, floor, ground, reflections, shadows — ' +
  'and replace it with a perfectly uniform, solid pure black (#000000) background. ' +
  'No gradients, no vignette, no floor reflection, no glow, no text, no watermark.';

async function uploadToR2(bytes, contentType, key) {
  const accountId = Deno.env.get('R2_ACCOUNT_ID');
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const bucketName = Deno.env.get('R2_BUCKET_NAME');
  const publicUrl = Deno.env.get('R2_PUBLIC_URL');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    throw new Error('R2 storage not configured');
  }

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const url = `https://${host}/${bucketName}/${key}`;
  const dateStr = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateShort = dateStr.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const toHex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

  const bodyHashHex = toHex(await crypto.subtle.digest('SHA-256', bytes));
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${bodyHashHex}\nx-amz-date:${dateStr}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n/${bucketName}/${key}\n\n${canonicalHeaders}\n${signedHeaders}\n${bodyHashHex}`;
  const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;
  const crHashHex = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)));
  const stringToSign = `AWS4-HMAC-SHA256\n${dateStr}\n${credentialScope}\n${crHashHex}`;

  const hmac = async (k, d) => {
    const ck = await crypto.subtle.importKey('raw', typeof k === 'string' ? new TextEncoder().encode(k) : k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', ck, typeof d === 'string' ? new TextEncoder().encode(d) : d));
  };
  const signingKey = await hmac(await hmac(await hmac(await hmac(`AWS4${secretAccessKey}`, dateShort), region), service), 'aws4_request');
  const signature = toHex(await hmac(signingKey, stringToSign));
  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-amz-content-sha256': bodyHashHex, 'x-amz-date': dateStr, 'Authorization': authHeader },
    body: bytes,
  });
  if (!res.ok) throw new Error(`R2 upload failed: ${await res.text()}`);
  return `${publicUrl.replace(/\/$/, '')}/${key}`;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let user = null;
  try { user = await base44.auth.me(); } catch (_) { /* service-role or anonymous caller */ }

  try {
    const body = await req.json().catch(() => ({}));
    const vehicleId = body.vehicle_id || body.data?.id;
    if (!vehicleId) return Response.json({ error: 'vehicle_id is required' }, { status: 400 });

    const force = user?.role === 'admin' && body.force === true;
    const vehicle = await base44.asServiceRole.entities.Vehicle.get(vehicleId);
    if (!vehicle?.image_url) return Response.json({ ok: true, skipped: 'no_image' });
    if (!force && vehicle.hero_image_url && vehicle.hero_image_source_url === vehicle.image_url) {
      return Response.json({ ok: true, skipped: 'up_to_date', hero_image_url: vehicle.hero_image_url });
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');

    // 1. Download the current photo
    const imgRes = await fetch(vehicle.image_url);
    if (!imgRes.ok) throw new Error(`Could not download vehicle image (${imgRes.status})`);
    const inputMime = (imgRes.headers.get('content-type') || 'image/png').split(';')[0];
    const inputB64 = encodeBase64(new Uint8Array(await imgRes.arrayBuffer()));

    // 2. Ask Gemini to replace the background with pure black (retry on 429)
    let data;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ inlineData: { mimeType: inputMime, data: inputB64 } }, { text: PROMPT }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      });
      data = await res.json();
      if (res.ok) break;
      if (res.status === 429 && attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
        continue;
      }
      throw new Error(`Gemini image edit error: ${JSON.stringify(data)}`);
    }

    const imagePart = (data?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data);
    if (!imagePart) throw new Error(`Gemini returned no image: ${JSON.stringify(data).slice(0, 500)}`);
    const outMime = imagePart.inlineData.mimeType || 'image/png';
    const ext = outMime.includes('jpeg') ? 'jpg' : 'png';

    // 3. Store on R2 and save to the vehicle
    const heroUrl = await uploadToR2(
      decodeBase64(imagePart.inlineData.data),
      outMime,
      `uploads/vehicle-hero-${vehicleId}-${Date.now()}.${ext}`,
    );
    await base44.asServiceRole.entities.Vehicle.update(vehicleId, {
      hero_image_url: heroUrl,
      hero_image_source_url: vehicle.image_url,
    });

    await base44.asServiceRole.entities.AIUsageLog.create({
      provider: 'google',
      model: MODEL,
      function_name: 'removeVehicleBackground',
      image_count: 1,
      estimated_cost: 0.04,
      user_id: user?.id || null,
      success: true,
    });

    console.log(`[removeVehicleBackground] ✓ ${vehicleId} → ${heroUrl}`);
    return Response.json({ ok: true, hero_image_url: heroUrl });
  } catch (error) {
    console.error('[removeVehicleBackground] error:', error.message);
    await base44.asServiceRole.entities.AIUsageLog.create({
      provider: 'google',
      model: MODEL,
      function_name: 'removeVehicleBackground',
      success: false,
      user_id: user?.id || null,
      error_message: error.message,
    });
    return Response.json({ error: error.message }, { status: 500 });
  }
});