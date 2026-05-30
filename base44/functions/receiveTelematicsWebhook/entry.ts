import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPPORTED_EVENTS = ['location_update', 'ignition_on', 'ignition_off', 'geofence_enter', 'geofence_exit', 'device_offline', 'device_online', 'power_disconnect', 'command_delivered', 'command_ack', 'command_executed', 'command_failed'];
const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const WEBHOOK_RATE_LIMIT_PER_MINUTE = 120;

function pickNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function getClientIp(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

async function logSecurityEvent(base44, { eventType, providerKey = '', providerId = '', summary, metadata = {} }) {
  await base44.asServiceRole.entities.ActivityEvent.create({
    event_type: 'gps.command_failed',
    actor_id: 'webhook',
    actor_email: 'provider-webhook',
    actor_role: 'system',
    target_entity: providerId ? 'TelematicsProviderConfig' : 'WebhookRequest',
    target_id: providerId,
    summary,
    metadata: { security_event_type: eventType, provider_key: providerKey, ...metadata },
    source: 'webhook',
    event_status: 'error',
  });
}

function getProvidedSecret(req, body) {
  return String(req.headers.get('x-telematics-secret') || req.headers.get('x-webhook-secret') || body.webhook_secret || '').trim();
}

function getWebhookTimestamp(req, body) {
  return String(req.headers.get('x-telematics-timestamp') || req.headers.get('x-webhook-timestamp') || body.timestamp || '').trim();
}

function isValidTimestamp(value) {
  const parsed = Number(value);
  const time = Number.isFinite(parsed) ? (parsed > 1000000000000 ? parsed : parsed * 1000) : Date.parse(value);
  return Number.isFinite(time) && Math.abs(Date.now() - time) <= WEBHOOK_TIMESTAMP_TOLERANCE_MS;
}

async function validateWebhookRequest(base44, req, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    await logSecurityEvent(base44, { eventType: 'malformed_payload', summary: 'Telematics webhook rejected: malformed payload', metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Malformed payload' }, { status: 400 }) };
  }

  const providerKey = String(body.provider_key || body.providerKey || '').trim();
  if (!providerKey) {
    await logSecurityEvent(base44, { eventType: 'missing_provider_key', summary: 'Telematics webhook rejected: provider_key is required', metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'provider_key is required' }, { status: 400 }) };
  }

  const providers = await base44.asServiceRole.entities.TelematicsProviderConfig.filter({ provider_key: providerKey });
  const provider = providers[0];
  if (!provider) {
    await logSecurityEvent(base44, { eventType: 'unknown_provider', providerKey, summary: `Telematics webhook rejected: unknown provider ${providerKey}`, metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Unknown telematics provider' }, { status: 404 }) };
  }

  if (!provider.is_active) {
    await logSecurityEvent(base44, { eventType: 'provider_disabled', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: provider ${providerKey} is disabled`, metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Telematics provider is disabled' }, { status: 403 }) };
  }

  if (!provider.webhook_secret_reference) {
    await logSecurityEvent(base44, { eventType: 'missing_secret_reference', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: provider ${providerKey} has no webhook secret reference`, metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Webhook secret reference is not configured' }, { status: 401 }) };
  }

  const expected = String(Deno.env.toObject()[provider.webhook_secret_reference] || '').trim();
  const provided = getProvidedSecret(req, body);
  if (!expected) {
    await logSecurityEvent(base44, { eventType: 'secret_not_configured', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: ${provider.webhook_secret_reference} is not configured`, metadata: { webhook_secret_reference: provider.webhook_secret_reference, ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Webhook secret is not configured for this provider' }, { status: 401 }) };
  }
  if (!provided || provided !== expected) {
    await logSecurityEvent(base44, { eventType: 'invalid_secret', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: invalid secret for ${providerKey}`, metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Invalid webhook secret' }, { status: 401 }) };
  }

  const timestamp = getWebhookTimestamp(req, body);
  if (!timestamp || !isValidTimestamp(timestamp)) {
    await logSecurityEvent(base44, { eventType: 'invalid_timestamp', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: invalid or stale timestamp for ${providerKey}`, metadata: { timestamp, ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Invalid or stale webhook timestamp' }, { status: 401 }) };
  }

  const eventId = String(req.headers.get('x-telematics-event-id') || body.event_id || body.eventId || '').trim();
  if (!eventId) {
    await logSecurityEvent(base44, { eventType: 'missing_event_id', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: missing event id for ${providerKey}`, metadata: { ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Webhook event id is required' }, { status: 400 }) };
  }

  const recentSecurityEvents = await base44.asServiceRole.entities.ActivityEvent.list('-created_date', 150);
  const replayKey = `telematics_webhook:${providerKey}:${eventId}`;
  if (recentSecurityEvents.some((event) => event.metadata?.replay_key === replayKey)) {
    await logSecurityEvent(base44, { eventType: 'replay_detected', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: replay detected for ${providerKey}`, metadata: { replay_key: replayKey, ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Duplicate webhook event' }, { status: 409 }) };
  }

  const oneMinuteAgo = Date.now() - 60 * 1000;
  const recentCount = recentSecurityEvents.filter((event) =>
    event.metadata?.provider_key === providerKey &&
    event.metadata?.webhook_accepted === true &&
    new Date(event.created_date || 0).getTime() >= oneMinuteAgo
  ).length;
  if (recentCount >= WEBHOOK_RATE_LIMIT_PER_MINUTE) {
    await logSecurityEvent(base44, { eventType: 'rate_limited', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: rate limit exceeded for ${providerKey}`, metadata: { recent_count: recentCount, ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Webhook rate limit exceeded' }, { status: 429 }) };
  }

  if (body.event_type && !SUPPORTED_EVENTS.includes(body.event_type)) {
    await logSecurityEvent(base44, { eventType: 'unsupported_event_type', providerKey, providerId: provider.id, summary: `Telematics webhook rejected: unsupported event type for ${providerKey}`, metadata: { event_type: body.event_type, ip: getClientIp(req) } });
    return { ok: false, response: Response.json({ error: 'Unsupported webhook event type' }, { status: 400 }) };
  }

  await base44.asServiceRole.entities.ActivityEvent.create({
    event_type: 'gps.command_sent',
    actor_id: 'webhook',
    actor_email: 'provider-webhook',
    actor_role: 'system',
    target_entity: 'TelematicsProviderConfig',
    target_id: provider.id,
    summary: `Telematics webhook accepted for ${providerKey}`,
    metadata: { provider_key: providerKey, replay_key: replayKey, webhook_accepted: true },
    source: 'webhook',
    event_status: 'success',
  });

  return { ok: true, providerKey, provider };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => null);
    const validation = await validateWebhookRequest(base44, req, body);
    if (!validation.ok) return validation.response;
    const { providerKey, provider } = validation;

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

    if (['command_delivered', 'command_ack', 'command_executed', 'command_failed'].includes(eventType)) {
      const commandId = body.command_id || body.commandId || '';
      const idempotencyKey = body.idempotency_key || body.idempotencyKey || '';
      const providerCommandId = body.provider_command_id || body.providerCommandId || '';
      const matches = commandId
        ? await base44.asServiceRole.entities.TelematicsCommand.filter({ id: commandId })
        : idempotencyKey
          ? await base44.asServiceRole.entities.TelematicsCommand.filter({ idempotency_key: idempotencyKey })
          : providerCommandId
            ? await base44.asServiceRole.entities.TelematicsCommand.filter({ provider_command_id: String(providerCommandId) })
            : [];
      const command = matches[0];
      if (command) {
        const createdAt = new Date(command.created_at || command.created_date || now).getTime();
        const sentAt = new Date(command.sent_at || command.created_at || command.created_date || now).getTime();
        const update = eventType === 'command_delivered'
          ? { status: 'delivered', queue_status: 'delivered', confirmation_status: 'delivered', delivered_at: now, delivery_latency_ms: Date.now() - sentAt, acknowledgement_source: 'webhook', provider_response: body }
          : eventType === 'command_ack'
            ? { status: 'acknowledged', queue_status: 'acknowledged', confirmation_status: 'acknowledged', acknowledged_at: now, device_acknowledged_at: now, delivery_latency_ms: Date.now() - sentAt, acknowledgement_source: 'webhook', provider_response: body }
            : eventType === 'command_executed'
              ? { status: 'executed', queue_status: 'executed', confirmation_status: 'executed', executed_at: now, confirmed_at: now, execution_latency_ms: Date.now() - createdAt, acknowledgement_source: 'webhook', provider_response: body }
              : { status: 'failed', queue_status: 'failed', confirmation_status: 'failed', failed_at: now, failure_reason: body.reason || 'Provider command failed', acknowledgement_source: 'webhook', provider_response: body };
        await base44.asServiceRole.entities.TelematicsCommand.update(command.id, update);
      }
    }

    return Response.json({ ok: true, event_id: event.id, booking_modified: false, payment_modified: false });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});