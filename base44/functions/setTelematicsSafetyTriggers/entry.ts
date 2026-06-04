import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function validatePayload(body) {
  const geofenceEnabled = body.geofence_enabled === true;
  const overspeedEnabled = body.overspeed_enabled === true;
  const latitude = numberOrUndefined(body.geofence_latitude);
  const longitude = numberOrUndefined(body.geofence_longitude);
  const radius = numberOrUndefined(body.geofence_radius_meters);
  const limit = numberOrUndefined(body.overspeed_limit_mph);

  if (geofenceEnabled) {
    if (latitude === undefined || latitude < -90 || latitude > 90) return 'Valid geofence latitude is required.';
    if (longitude === undefined || longitude < -180 || longitude > 180) return 'Valid geofence longitude is required.';
    if (radius === undefined || radius < 25 || radius > 100000) return 'Geofence radius must be between 25 and 100,000 meters.';
  }
  if (overspeedEnabled && (limit === undefined || limit < 5 || limit > 150)) return 'Overspeed limit must be between 5 and 150 mph.';
  return '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json();
    const deviceId = String(body.device_id || '').trim();
    if (!deviceId) return Response.json({ error: 'device_id is required' }, { status: 400 });

    const validationError = validatePayload(body);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: deviceId });
    const device = devices[0];
    if (!device) return Response.json({ error: 'Telematics device not found' }, { status: 404 });

    const now = new Date().toISOString();
    const data = {
      device_id: device.id,
      vehicle_id: device.vehicle_id || '',
      host_id: device.host_id || '',
      provider_key: device.provider_key || '',
      status: body.status === 'disabled' ? 'disabled' : 'active',
      geofence_enabled: body.geofence_enabled === true,
      geofence_latitude: numberOrUndefined(body.geofence_latitude),
      geofence_longitude: numberOrUndefined(body.geofence_longitude),
      geofence_radius_meters: numberOrUndefined(body.geofence_radius_meters) || 300,
      geofence_mode: ['exit', 'enter', 'both'].includes(body.geofence_mode) ? body.geofence_mode : 'exit',
      overspeed_enabled: body.overspeed_enabled === true,
      overspeed_limit_mph: numberOrUndefined(body.overspeed_limit_mph) || 75,
      configured_by: user.email,
      configured_at: now,
      notes: String(body.notes || '').slice(0, 500)
    };

    const existing = (await base44.asServiceRole.entities.TelematicsSafetyTriggerConfig.filter({ device_id: device.id }))[0];
    const config = existing
      ? await base44.asServiceRole.entities.TelematicsSafetyTriggerConfig.update(existing.id, data)
      : await base44.asServiceRole.entities.TelematicsSafetyTriggerConfig.create(data);

    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'admin.override',
      actor_id: user.id || '',
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'TelematicsSafetyTriggerConfig',
      target_id: config.id,
      vehicle_id: device.vehicle_id || '',
      summary: `Telematics safety triggers updated for ${device.unique_id || device.id}`,
      metadata: { device_id: device.id, geofence_enabled: data.geofence_enabled, overspeed_enabled: data.overspeed_enabled },
      source: 'admin_panel',
      event_status: 'success'
    });

    return Response.json({ ok: true, config });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});