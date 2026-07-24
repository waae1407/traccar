import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function envValue(name) {
  return String(Deno.env.toObject()[name] || '').trim();
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

async function fetchTraccarDevices() {
  const baseUrl = envValue('TRACCAR_BASE_URL');
  const username = envValue('TRACCAR_USERNAME');
  const password = envValue('TRACCAR_PASSWORD');
  if (!baseUrl || !username || !password) throw new Error('Traccar credentials are not configured.');

  const response = await fetch(joinUrl(baseUrl, '/api/devices'), {
    headers: {
      Authorization: 'Basic ' + btoa(`${username}:${password}`),
      Accept: 'application/json'
    }
  });

  if (!response.ok) throw new Error(`Traccar device aging lookup failed (${response.status})`);
  const devices = await response.json();
  return Array.isArray(devices) ? devices : [];
}

async function createAgingAlert(base44, device, issueType, title, message, metadata) {
  const dedupeKey = `aging:${issueType}:${device.id}`;
  const existing = (await base44.asServiceRole.entities.OperationalAlert.filter({ dedupe_key: dedupeKey }))[0];
  const payload = {
    alert_type: issueType === 'missing_provider_device' ? 'device_offline' : 'provisioning_failure',
    severity: issueType === 'provider_id_mismatch' ? 'medium' : 'high',
    status: 'new',
    title,
    message,
    recommended_action: 'Review the device identity and reconcile the provider record before relying on live controls.',
    source_entity_type: 'TelematicsDevice',
    source_entity_id: device.id,
    domain: 'telematics',
    provider_key: device.provider_key,
    telematics_device_id: device.id,
    vehicle_id: device.vehicle_id || '',
    host_id: device.host_id || '',
    dedupe_key: dedupeKey,
    metadata,
    first_seen_at: existing?.first_seen_at || new Date().toISOString(),
    last_duplicate_at: existing ? new Date().toISOString() : undefined,
    repeat_count: existing ? Number(existing.repeat_count || 1) + 1 : 1
  };

  if (existing) {
    await base44.asServiceRole.entities.OperationalAlert.update(existing.id, payload);
    return existing.id;
  }
  const alert = await base44.asServiceRole.entities.OperationalAlert.create(payload);
  return alert.id;
}

async function reconcileTraccarDevicePointers(base44, options = {}) {
  const traccarDevices = await fetchTraccarDevices();
  const byUniqueId = new Map();

  for (const traccarDevice of traccarDevices) {
    const key = normalize(traccarDevice.uniqueId);
    if (!key) continue;
    if (!byUniqueId.has(key)) byUniqueId.set(key, []);
    byUniqueId.get(key).push(traccarDevice);
  }

  const requestedUniqueId = normalize(options.unique_id || '');
  const localDevices = requestedUniqueId
    ? await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: 'traccar_noran_mt20', unique_id: requestedUniqueId })
    : await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: 'traccar_noran_mt20' });

  const results = [];

  for (const device of localDevices) {
    const uniqueKey = normalize(device.unique_id);
    const matches = byUniqueId.get(uniqueKey) || [];

    if (!uniqueKey) {
      results.push({ device_id: device.id, issue: 'missing_stable_identity', action: 'blocked', reason: 'Device has no hardware unique_id.' });
      continue;
    }

    if (matches.length === 0) {
      const result = { device_id: device.id, unique_id: device.unique_id, issue: 'missing_provider_device', action: 'alerted', stored_traccar_device_id: device.traccar_device_id || '' };
      if (!options.dry_run) {
        result.alert_id = await createAgingAlert(
          base44,
          device,
          'missing_provider_device',
          `Provider device missing: ${device.unique_id}`,
          `The app has device ${device.unique_id}, but Traccar does not currently return a matching device by unique ID.`,
          result
        );
      }
      results.push(result);
      continue;
    }

    if (matches.length > 1) {
      const result = { device_id: device.id, unique_id: device.unique_id, issue: 'duplicate_provider_identity', action: 'blocked', stored_traccar_device_id: device.traccar_device_id || '', live_traccar_device_ids: matches.map(item => String(item.id)) };
      if (!options.dry_run) {
        result.alert_id = await createAgingAlert(
          base44,
          device,
          'duplicate_provider_identity',
          `Duplicate provider identity: ${device.unique_id}`,
          `Traccar returned multiple records for ${device.unique_id}. Live controls are unsafe until this is resolved.`,
          result
        );
      }
      results.push(result);
      continue;
    }

    const live = matches[0];
    const liveId = String(live.id);
    const storedId = String(device.traccar_device_id || '');
    const providerStoredId = String(device.provider_device_id || '');
    const mismatch = storedId !== liveId || providerStoredId !== liveId;

    if (mismatch) {
      const result = {
        device_id: device.id,
        unique_id: device.unique_id,
        issue: 'provider_id_mismatch',
        action: options.dry_run ? 'would_update' : 'updated',
        old_traccar_device_id: storedId,
        old_provider_device_id: providerStoredId,
        live_traccar_device_id: liveId,
        live_status: live.status || 'unknown',
        live_last_update: live.lastUpdate || ''
      };

      if (!options.dry_run) {
        await base44.asServiceRole.entities.TelematicsDevice.update(device.id, {
          traccar_device_id: liveId,
          provider_device_id: liveId,
          online_status: live.status || device.online_status || 'unknown',
          last_seen_at: live.lastUpdate || device.last_seen_at
        });
        result.alert_id = await createAgingAlert(
          base44,
          device,
          'provider_id_mismatch',
          `Provider ID reconciled: ${device.unique_id}`,
          `The stale Traccar device ID was corrected from ${storedId || 'blank'} to ${liveId}.`,
          result
        );
      }

      results.push(result);
      continue;
    }

    results.push({
      device_id: device.id,
      unique_id: device.unique_id,
      issue: 'none',
      action: 'verified_fresh',
      traccar_device_id: liveId,
      live_status: live.status || 'unknown',
      live_last_update: live.lastUpdate || ''
    });
  }

  return {
    checked: localDevices.length,
    updated: results.filter(item => item.action === 'updated').length,
    alerted: results.filter(item => item.action === 'alerted' || item.alert_id).length,
    blocked: results.filter(item => item.action === 'blocked').length,
    verified_fresh: results.filter(item => item.action === 'verified_fresh').length,
    results
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const isCron = !!(Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET'));
    const isScheduled = req.headers.get('x-base44-scheduled-function') === 'true';

    if (!isCron && !isScheduled) {
      const user = await base44.auth.me().catch(() => null);
      const isAutomation = !!body.automation || body.source === 'scheduled_aging_handler';
      if (!isAutomation && user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden: cron-secret, scheduled, or admin required' }, { status: 403 });
      }
    }

    const scope = body.scope || 'telematics_provider_ids';
    if (scope !== 'telematics_provider_ids') return Response.json({ error: 'Unsupported aging scope.' }, { status: 400 });

    const result = await reconcileTraccarDevicePointers(base44, {
      dry_run: body.dry_run === true,
      unique_id: body.unique_id || ''
    });

    return Response.json({
      ok: true,
      scope,
      dry_run: body.dry_run === true,
      processed_at: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});