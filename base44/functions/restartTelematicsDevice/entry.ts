import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function asciiToHex(input = '') {
  return Array.from(input)
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function currentHhmmss() {
  const now = new Date();
  return [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join('');
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

async function traccarFetch(path, options = {}) {
  const baseUrl = String(Deno.env.get('TRACCAR_BASE_URL') || '').trim();
  const username = String(Deno.env.get('TRACCAR_USERNAME') || '').trim();
  const password = String(Deno.env.get('TRACCAR_PASSWORD') || '').trim();
  if (!baseUrl || !username || !password) throw new Error('Traccar credentials are not configured.');

  const response = await fetch(joinUrl(baseUrl, path), {
    ...options,
    headers: {
      Authorization: 'Basic ' + btoa(`${username}:${password}`),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`Traccar API failed (${response.status}): ${text}`);
  return data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json();
    const uniqueId = String(body.unique_id || body.device_id || '').trim().toUpperCase();
    if (!uniqueId) return Response.json({ error: 'unique_id is required' }, { status: 400 });

    // Find device in Traccar
    const devices = await traccarFetch('/api/devices', { method: 'GET' });
    const list = Array.isArray(devices) ? devices : [];
    const traccarDevice = list.find(d => String(d.uniqueId || '').toUpperCase() === uniqueId)
      || list.find(d => String(d.name || '').toUpperCase().includes(uniqueId));

    if (!traccarDevice) return Response.json({ error: `Device ${uniqueId} not found in Traccar` }, { status: 404 });

    // Build MT20 restart command: *KW,<DEVICE_ID>,099,HHMMSS#
    const hhmmss = currentHhmmss();
    const ascii = `*KW,${uniqueId},099,${hhmmss}#`;
    const hex = asciiToHex(ascii);

    // Send via Traccar
    const result = await traccarFetch('/api/commands/send', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: Number(traccarDevice.id),
        type: 'custom',
        attributes: { data: hex },
      }),
    });

    // Log the command in Base44
    const localDevices = await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: uniqueId });
    const localDevice = localDevices[0];
    const now = new Date().toISOString();

    if (localDevice) {
      await base44.asServiceRole.entities.TelematicsCommand.create({
        telematics_device_id: localDevice.id,
        provider_key: 'traccar_noran_mt20',
        vehicle_id: localDevice.vehicle_id || '',
        host_id: localDevice.host_id || '',
        command_type: 'restart',
        provider_command_name: 'custom',
        ascii_payload: ascii,
        hex_payload: hex,
        request_payload: { traccar_device_id: String(traccarDevice.id), restart: true },
        status: 'sent',
        queue_status: 'sent',
        confirmation_status: 'sent',
        confirmation_required: false,
        provider_response: result || {},
        requested_by: user.email,
        requested_role: user.role || 'admin',
        failure_reason: '',
        created_at: now,
        sent_at: now,
      });
    }

    return Response.json({
      ok: true,
      unique_id: uniqueId,
      traccar_device_id: String(traccarDevice.id),
      ascii_command: ascii,
      hex_command: hex,
      traccar_response: result,
      note: 'Restart command (MT20 code 099) sent. Device should reboot within 10-30 seconds.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});