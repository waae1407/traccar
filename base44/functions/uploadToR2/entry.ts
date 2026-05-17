import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { fileBase64, fileName, fileType } = await req.json();
  if (!fileBase64) return Response.json({ error: 'No file provided' }, { status: 400 });

  const accountId = Deno.env.get('R2_ACCOUNT_ID');
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const bucketName = Deno.env.get('R2_BUCKET_NAME');
  const publicUrl = Deno.env.get('R2_PUBLIC_URL');

  // Decode base64 to bytes
  const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
  const bodyBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

  const ext = fileName ? fileName.split('.').pop().toLowerCase() : 'bin';
  const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const contentType = fileType || 'application/octet-stream';

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const url = `${endpoint}/${bucketName}/${key}`;

  // AWS Signature V4
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateShort = dateStr.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const host = `${accountId}.r2.cloudflarestorage.com`;

  const bodyHash = await crypto.subtle.digest('SHA-256', bodyBytes);
  const bodyHashHex = Array.from(new Uint8Array(bodyHash)).map(b => b.toString(16).padStart(2, '0')).join('');

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${bodyHashHex}\nx-amz-date:${dateStr}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n/${bucketName}/${key}\n\n${canonicalHeaders}\n${signedHeaders}\n${bodyHashHex}`;

  const credentialScope = `${dateShort}/${region}/${service}/aws4_request`;
  const crHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest));
  const crHashHex = Array.from(new Uint8Array(crHash)).map(b => b.toString(16).padStart(2, '0')).join('');
  const stringToSign = `AWS4-HMAC-SHA256\n${dateStr}\n${credentialScope}\n${crHashHex}`;

  const hmac = async (key, data) => {
    const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? new TextEncoder().encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', k, typeof data === 'string' ? new TextEncoder().encode(data) : data));
  };

  const signingKey = await hmac(
    await hmac(await hmac(await hmac(`AWS4${secretAccessKey}`, dateShort), region), service),
    'aws4_request'
  );
  const signature = Array.from(await hmac(signingKey, stringToSign)).map(b => b.toString(16).padStart(2, '0')).join('');
  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const r2Res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': bodyHashHex,
      'x-amz-date': dateStr,
      'Authorization': authHeader,
    },
    body: bodyBytes,
  });

  if (!r2Res.ok) {
    const errText = await r2Res.text();
    console.error('[R2 Upload] Failed:', errText);
    return Response.json({ error: `R2 upload failed: ${errText}` }, { status: 500 });
  }

  const file_url = `${publicUrl}/${key}`;
  console.log('[R2 Upload] Success:', file_url);
  return Response.json({ file_url });
});