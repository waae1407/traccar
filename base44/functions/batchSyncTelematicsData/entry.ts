import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PROVIDER_KEY = 'traccar_noran_mt20';

function createWebhookClient(req) {
  const headers = new Headers(req.headers);
  headers.delete('authorization');
  headers.delete('cookie');
  return createClientFromRequest(new Request(req.url, { method: req.method, headers }));
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.batch)) {
      return Response.json({ error: 'Invalid payload — expected { batch: [...] }' }, { status: 400 });
    }

    const expectedSecret = String(Deno.env.get('TRACCAR_WEBHOOK_SECRET') || '').trim();
    const providedSecret = String(req.headers.get('x-webhook-secret') || req.headers.get('x-telematics-secret') || '').trim();
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return Response.json({ error: 'Invalid webhook secret' }, { status: 401 });
    }

    if (String(body.provider_key || PROVIDER_KEY) !== PROVIDER_KEY) {
      return Response.json({ error: 'Unsupported provider_key' }, { status: 400 });
    }

    const base44 = createWebhookClient(req);

    // Group by device_unique_id — keep only the LATEST entry per device
    // This means if 50 position packets arrive for the same device in 5 min,
    // we do 1 lookup + 1 update instead of 50.
    const deviceMap = new Map();
    for (const entry of body.batch) {
      const uid = String(entry.device_unique_id || '').trim();
      if (!uid) continue;
      const existing = deviceMap.get(uid);
      if (!existing || new Date(entry.timestamp || 0) > new Date(existing.timestamp || 0)) {
        deviceMap.set(uid, entry);
      }
    }

    let updated = 0;
    let notFound = 0;
    let errors = 0;
    const deviceIds = [];

    for (const [uid, entry] of deviceMap) {
      try {
        const matches = await base44.asServiceRole.entities.TelematicsDevice.filter({
          provider_key: PROVIDER_KEY,
          unique_id: uid
        });
        const device = matches[0];
        if (!device) {
          notFound++;
          continue;
        }

        const timestamp = entry.timestamp || new Date().toISOString();
        const sourceIpRaw = String(entry.source_ip || '').trim() || null;
        const sourcePort = sourceIpRaw && sourceIpRaw.includes(':') ? sourceIpRaw.split(':').pop() : null;
        const sourceIpOnly = sourceIpRaw && sourceIpRaw.includes(':') ? sourceIpRaw.split(':')[0] : sourceIpRaw;

        const updateData = {
          online_status: 'online',
          last_seen_at: timestamp,
          last_inbound_packet_at: timestamp,
          last_inbound_packet_type: entry.packet_type === 'heartbeat' ? 'heartbeat' : 'position',
          last_inbound_source: 'batch_sync',
          last_inbound_raw_hex: String(entry.raw_hex_prefix || '').slice(0, 20)
        };

        if (entry.packet_type === 'heartbeat') {
          updateData.last_heartbeat_received_at = timestamp;
          updateData.last_heartbeat_source_ip = sourceIpOnly || null;
          updateData.last_heartbeat_source_port = sourcePort || null;
        }

        if (typeof entry.voltage === 'number' && entry.voltage > 0 && entry.voltage <= 30) {
          updateData.battery_voltage = entry.voltage;
          updateData.power_voltage = entry.voltage;
          updateData.external_voltage = entry.voltage;
          updateData.voltage = entry.voltage;
          updateData.voltage_source = 'batch_sync_mt20_0032';
          updateData.voltage_last_seen_at = timestamp;
        }

        await base44.asServiceRole.entities.TelematicsDevice.update(device.id, updateData);
        deviceIds.push(device.id);
        updated++;
      } catch (err) {
        errors++;
        console.error(`[batchSync] Error for ${uid}:`, err.message);
      }
    }

    return Response.json({
      ok: true,
      batch_size: body.batch.length,
      unique_devices: deviceMap.size,
      devices_updated: updated,
      devices_not_found: notFound,
      errors
    });
  } catch (error) {
    console.error('[batchSyncTelematicsData] CRITICAL:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});