import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizeDeviceId(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function isNoranDeviceId(value) {
  return /^(TRSL|NR09G)[A-Z0-9]+$/i.test(String(value || '').trim());
}

function inferProviderKey(deviceId, requestedProvider) {
  if (requestedProvider) return String(requestedProvider).trim();
  if (isNoranDeviceId(deviceId)) return 'traccar_noran_mt20';
  return '';
}

async function upsertAlert(base44, payload) {
  const existing = payload.dedupe_key ? await base44.asServiceRole.entities.OperationalAlert.filter({ dedupe_key: payload.dedupe_key }) : [];
  if (existing[0]) {
    return await base44.asServiceRole.entities.OperationalAlert.update(existing[0].id, {
      ...payload,
      repeat_count: Number(existing[0].repeat_count || 1) + 1,
      last_duplicate_at: new Date().toISOString(),
      status: existing[0].status === 'resolved' ? 'new' : existing[0].status
    });
  }
  return await base44.asServiceRole.entities.OperationalAlert.create(payload);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const expectedDeviceId = normalizeDeviceId(body.expected_device_id);
    const actualDeviceId = normalizeDeviceId(body.actual_device_id || body.device_id || body.unique_id);
    let providerKey = inferProviderKey(actualDeviceId || expectedDeviceId, body.provider_key);
    const batchNumber = String(body.batch_number || '').trim();
    const now = new Date().toISOString();

    if (!actualDeviceId) return Response.json({ error: 'Actual device barcode is required' }, { status: 400 });

    if (expectedDeviceId && expectedDeviceId !== actualDeviceId) {
      await upsertAlert(base44, {
        alert_type: 'installation_failure',
        severity: 'high',
        status: 'new',
        title: 'Device package mismatch',
        message: `Package label ${expectedDeviceId} does not match physical device barcode ${actualDeviceId}.`,
        recommended_action: 'Stop installation and verify the device package before continuing.',
        domain: 'installers',
        source_entity_type: 'TelematicsDevice',
        source_entity_id: actualDeviceId,
        provider_key: providerKey,
        dedupe_key: `installer_device_mismatch:${expectedDeviceId}:${actualDeviceId}`,
        first_seen_at: now,
        metadata: { expected_device_id: expectedDeviceId, actual_device_id: actualDeviceId, batch_number: batchNumber }
      });
      return Response.json({
        ok: false,
        status: 'mismatch',
        error: 'Device mismatch. The package label does not match the physical device barcode. Do not continue installation.',
        expected_device_id: expectedDeviceId,
        actual_device_id: actualDeviceId,
        provider_key: providerKey
      }, { status: 409 });
    }

    let devices = providerKey
      ? await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: providerKey, unique_id: actualDeviceId })
      : [];

    if (!devices[0]) {
      const byUniqueId = await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: actualDeviceId });
      if (byUniqueId[0]) {
        devices = byUniqueId;
        providerKey = byUniqueId[0].provider_key || providerKey;
      }
    }

    let device = devices[0] || null;
    if (!device) {
      providerKey = inferProviderKey(actualDeviceId, providerKey) || 'traccar_noran_mt20';
      device = await base44.asServiceRole.entities.TelematicsDevice.create({
        provider_key: providerKey,
        unique_id: actualDeviceId,
        device_imei: actualDeviceId,
        batch_number: batchNumber,
        model: isNoranDeviceId(actualDeviceId) ? 'Noran MT20' : '',
        lifecycle_status: 'inventory',
        assigned_status: 'unassigned',
        install_status: 'not_started',
        online_status: 'unknown',
        created_at: now
      });
    } else if (batchNumber && !device.batch_number) {
      device = await base44.asServiceRole.entities.TelematicsDevice.update(device.id, { batch_number: batchNumber });
    }

    return Response.json({
      ok: true,
      status: 'verified',
      message: expectedDeviceId ? 'Device verified.' : 'Device barcode accepted.',
      expected_device_id: expectedDeviceId,
      actual_device_id: actualDeviceId,
      provider_key: providerKey,
      batch_number: batchNumber,
      device,
      created_pending_device: !devices[0]
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});