import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPPORTED_EVENTS = ['location_update', 'ignition_on', 'ignition_off', 'geofence_enter', 'geofence_exit', 'device_offline', 'device_online', 'power_disconnect', 'command_ack', 'command_failed'];

function pickNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const providerKey = String(body.provider_key || body.providerKey || '').trim();
    if (!providerKey) return Response.json({ error: 'provider_key is required' }, { status: 400 });

    const providers = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: providerKey });
    const provider = providers[0];
    if (!provider) return Response.json({ error: 'Unknown telematics provider' }, { status: 404 });

    if (provider.webhook_secret_reference) {
      const expected = Deno.env.get(provider.webhook_secret_reference) || '';
      const provided = req.headers.get('x-telematics-secret') || body.webhook_secret || '';
      if (expected && provided !== expected) return Response.json({ error: 'Invalid webhook secret' }, { status: 401 });
    }

    const eventType = SUPPORTED_EVENTS.includes(body.event_type) ? body.event_type : 'location_update';
    const uniqueId = String(body.unique_id || body.device_id || body.provider_device_id || body.imei || '').trim();
    let device = null;
    if (uniqueId) {
      const byUnique = await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: providerKey, unique_id: uniqueId });
      const byProvider = byUnique[0] ? [] : await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: providerKey, provider_device_id: uniqueId });
      device = byUnique[0] || byProvider[0] || null;
    }

    const latitude = pickNumber(body.latitude, body.lat, body.position?.latitude);
    const longitude = pickNumber(body.longitude, body.lng, body.lon, body.position?.longitude);
    const speed = pickNumber(body.speed, body.position?.speed);
    const ignition = eventType === 'ignition_on' ? true : eventType === 'ignition_off' ? false : body.ignition;
    const now = new Date().toISOString();

    const event = await base44.asServiceRole.entities.TelematicsEvent.create({
      company_id: device?.company_id || provider.company_id || '',
      telematics_device_id: device?.id || '',
      provider_key: providerKey,
      vehicle_id: device?.vehicle_id || body.vehicle_id || '',
      event_type: eventType,
      source: 'webhook',
      latitude,
      longitude,
      speed,
      ignition: typeof ignition === 'boolean' ? ignition : undefined,
      raw_payload: body,
      created_at: now,
    });

    if (device) {
      const updates = { last_seen_at: now };
      if (latitude !== undefined) updates.last_latitude = latitude;
      if (longitude !== undefined) updates.last_longitude = longitude;
      if (speed !== undefined) updates.speed = speed;
      if (eventType === 'device_online') updates.online_status = 'online';
      if (eventType === 'device_offline') updates.online_status = 'offline';
      if (eventType === 'ignition_on') updates.ignition_status = 'on';
      if (eventType === 'ignition_off') updates.ignition_status = 'off';
      await base44.asServiceRole.entities.TelematicsDevice.update(device.id, updates);
    }

    return Response.json({ ok: true, event_id: event.id, booking_modified: false, payment_modified: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});