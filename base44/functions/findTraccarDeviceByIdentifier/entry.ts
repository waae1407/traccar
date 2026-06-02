import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function baseUrl() {
  return String(Deno.env.get('TRACCAR_BASE_URL') || '').replace(/\/+$/, '');
}

function authHeader() {
  const username = Deno.env.get('TRACCAR_USERNAME');
  const password = Deno.env.get('TRACCAR_PASSWORD');
  return 'Basic ' + btoa(`${username}:${password}`);
}

function normalized(value) {
  return String(value || '').trim().toUpperCase();
}

function deviceMatches(device, identifier) {
  const target = normalized(identifier);
  const fields = [device.id, device.uniqueId, device.name, device.phone, device.model, device.contact];
  return fields.some((value) => normalized(value) === target || normalized(value).includes(target));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json();
    const identifier = String(body.identifier || '').trim();
    if (!identifier) return Response.json({ error: 'identifier is required' }, { status: 400 });
    if (!baseUrl()) return Response.json({ error: 'TRACCAR_BASE_URL is not configured' }, { status: 500 });

    const response = await fetch(`${baseUrl()}/api/devices`, {
      headers: { Authorization: authHeader(), Accept: 'application/json' }
    });
    if (!response.ok) return Response.json({ error: `Traccar devices query failed with status ${response.status}` }, { status: response.status });

    const devices = await response.json();
    const matches = (Array.isArray(devices) ? devices : []).filter((device) => deviceMatches(device, identifier));

    return Response.json({
      ok: true,
      identifier,
      match_count: matches.length,
      matches: matches.map((device) => ({
        id: device.id,
        name: device.name,
        uniqueId: device.uniqueId,
        status: device.status,
        disabled: device.disabled,
        lastUpdate: device.lastUpdate,
        phone: device.phone,
        model: device.model,
        contact: device.contact,
        category: device.category
      }))
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});