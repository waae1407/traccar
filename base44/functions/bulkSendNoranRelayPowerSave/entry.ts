import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Admin-only: sends MT20 command 019 (relay power-save) through Traccar /api/commands/send
// Uses the full 68-byte MT20 wrapped packet — same path as lock/unlock/starter commands.

function sanitizeIdentifier(value = '') { return String(value).replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80); }
function bytesToHex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(); }

function buildMt20WrappedPacket(asciiCommand) {
  const sMarkHex = '0D0A2A4B5700';
  const packetLenHex = '4400';
  const cmdHex = '0200';
  const gisIpHex = '741E649C';
  const portHex = '5B9A';
  const sEndHex = '0D0A';
  const sDataBytes = new TextEncoder().encode(asciiCommand);
  if (sDataBytes.length > 50) throw new Error('sData exceeds 50 bytes');
  const paddedSData = new Uint8Array(50);
  paddedSData.set(sDataBytes);
  const sDataHex = bytesToHex(paddedSData);
  return `${sMarkHex}${packetLenHex}${cmdHex}${gisIpHex}${portHex}${sDataHex}${sEndHex}`;
}

function buildRelayPowerSaveAscii(deviceId, mode) {
  const now = new Date();
  const hhmmss = [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()]
    .map(n => String(n).padStart(2, '0')).join('');
  return `*KW,${sanitizeIdentifier(deviceId)},019,${hhmmss},${mode}#`;
}

async function sendTraccarCommand(traccarDeviceId, hexPayload) {
  const baseUrl = Deno.env.get('TRACCAR_BASE_URL');
  const username = Deno.env.get('TRACCAR_USERNAME');
  const password = Deno.env.get('TRACCAR_PASSWORD');
  if (!baseUrl || !username || !password) throw new Error('Traccar credentials not configured');

  const payload = { deviceId: Number(traccarDeviceId), type: 'custom', attributes: { data: hexPayload } };
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/commands/send`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${username}:${password}`),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Traccar rejected (${res.status}): ${typeof data?.raw === 'string' ? data.raw : JSON.stringify(data)}`);
  return data;
}

// ── Heartbeat freshness gate (matches sendTelematicsCommand.ensureFreshHeartbeat) ──
// Only sends to devices with a fresh UDP NAT session (heartbeat ≤10s old) so the
// command actually reaches the device and gets a 0x8009 ACK. Stale devices are
// held in a shared wait window (up to 30s) and sent as soon as a new heartbeat arrives.
const MAX_HEARTBEAT_AGE_MS = 10000;
const FRESHNESS_POLL_INTERVAL_MS = 500;
const FRESHNESS_POLL_TIMEOUT_MS = 30000;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function checkFreshness(base44, deviceId) {
  const device = (await base44.asServiceRole.entities.TelematicsDevice.filter({ id: deviceId }))[0];
  if (!device) return null;
  const lastHb = new Date(device.last_heartbeat_received_at || 0).getTime();
  return { fresh: Date.now() - lastHb <= MAX_HEARTBEAT_AGE_MS, age_ms: Date.now() - lastHb, last_heartbeat: lastHb };
}

async function sendToDevice(device, mode) {
  try {
    const ascii = buildRelayPowerSaveAscii(device.unique_id, mode);
    const hex = buildMt20WrappedPacket(ascii);
    const traccarResult = await sendTraccarCommand(device.traccar_device_id, hex);
    return { device_id: device.id, unique_id: device.unique_id, traccar_device_id: device.traccar_device_id, status: 'sent', ascii_command: ascii, hex_packet: hex, traccar_response: traccarResult };
  } catch (error) {
    return { device_id: device.id, unique_id: device.unique_id, status: 'failed', error: error.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const powerSaveMode = body.power_save_mode !== false; // default true (X=0)
    const mode = powerSaveMode ? 0 : 1;
    const bulk = body.bulk === true;
    const waitForHeartbeat = body.wait_for_heartbeat !== false; // default true

    if (bulk) {
      const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: 'traccar_noran_mt20' });
      const results = [];
      const stale = [];

      // Pass 1: send to already-fresh devices, collect stale ones for the shared wait
      for (const device of devices) {
        if (!device.traccar_device_id || !device.unique_id) {
          results.push({ device_id: device.id, unique_id: device.unique_id, status: 'skipped', reason: 'Missing Traccar device ID or unique_id' });
          continue;
        }
        const freshness = await checkFreshness(base44, device.id);
        if (!freshness) {
          results.push({ device_id: device.id, unique_id: device.unique_id, status: 'skipped', reason: 'Device record not found' });
          continue;
        }
        if (freshness.fresh) {
          results.push(await sendToDevice(device, mode));
        } else {
          stale.push({ device, initial_last_heartbeat: freshness.last_heartbeat, initial_age_ms: freshness.age_ms });
        }
      }

      // Pass 2: shared freshness wait — poll stale devices concurrently, send each as a new heartbeat arrives
      if (stale.length > 0 && waitForHeartbeat) {
        const startTime = Date.now();
        const staleMap = new Map(stale.map(s => [s.device.id, s]));
        while (staleMap.size > 0 && Date.now() - startTime < FRESHNESS_POLL_TIMEOUT_MS) {
          await sleep(FRESHNESS_POLL_INTERVAL_MS);
          for (const [deviceId, entry] of [...staleMap]) {
            const freshness = await checkFreshness(base44, deviceId);
            if (!freshness) {
              results.push({ device_id: deviceId, unique_id: entry.device.unique_id, status: 'skipped', reason: 'Device record not found during wait' });
              staleMap.delete(deviceId);
              continue;
            }
            // Send as soon as any new heartbeat is observed (matches sendTelematicsCommand)
            if (freshness.last_heartbeat > entry.initial_last_heartbeat) {
              const sendResult = await sendToDevice(entry.device, mode);
              sendResult.waited_for_heartbeat = true;
              sendResult.wait_ms = Date.now() - startTime;
              results.push(sendResult);
              staleMap.delete(deviceId);
            }
          }
        }
        // Remaining stale after timeout
        for (const [deviceId, entry] of staleMap) {
          results.push({ device_id: deviceId, unique_id: entry.device.unique_id, status: 'skipped', reason: `Heartbeat stale — no fresh heartbeat within ${FRESHNESS_POLL_TIMEOUT_MS / 1000}s` });
        }
      } else if (stale.length > 0) {
        for (const entry of stale) {
          results.push({ device_id: entry.device.id, unique_id: entry.device.unique_id, status: 'skipped', reason: `Heartbeat stale (${Math.round(entry.initial_age_ms / 1000)}s old) — wait_for_heartbeat disabled` });
        }
      }

      const sent = results.filter(r => r.status === 'sent').length;
      const failed = results.filter(r => r.status === 'failed').length;
      const skipped = results.filter(r => r.status === 'skipped').length;

      await base44.asServiceRole.entities.ActivityEvent.create({
        event_type: 'gps.device_config_traccar_sent',
        actor_id: user.id,
        actor_email: user.email,
        actor_role: 'admin',
        target_entity: 'TelematicsDevice',
        target_id: '',
        summary: `Bulk Traccar relay power-save ${powerSaveMode ? 'ENABLED' : 'DISABLED'} — sent:${sent} failed:${failed} skipped:${skipped}`,
        metadata: { command: '019', mode, power_save_mode: powerSaveMode, bulk: true, sent, failed, skipped, freshness_gate: true },
        source: 'admin_panel',
        event_status: sent > 0 ? 'success' : 'warning',
      }).catch(() => {});

      return Response.json({ ok: true, bulk: true, power_save_mode: powerSaveMode, freshness_gate: true, total: results.length, sent, failed, skipped, results });
    }

    // ── Single device ──
    const { device_id, unique_id } = body;
    if (!device_id && !unique_id) {
      return Response.json({ error: 'device_id or unique_id required (or use bulk: true)' }, { status: 400 });
    }

    const query = device_id ? { id: device_id } : { unique_id: unique_id?.toUpperCase() };
    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter(query);
    const device = devices[0];
    if (!device) return Response.json({ error: 'Device not found' }, { status: 404 });
    if (device.provider_key !== 'traccar_noran_mt20') return Response.json({ error: 'Only Noran MT20 devices supported' }, { status: 400 });
    if (!device.traccar_device_id) return Response.json({ error: 'Device has no Traccar device ID' }, { status: 400 });

    // Freshness gate — wait up to 30s for a heartbeat
    let heartbeatFreshness = await checkFreshness(base44, device.id);
    if (heartbeatFreshness && !heartbeatFreshness.fresh && waitForHeartbeat) {
      const startTime = Date.now();
      const initialLastHb = heartbeatFreshness.last_heartbeat;
      while (Date.now() - startTime < FRESHNESS_POLL_TIMEOUT_MS) {
        await sleep(FRESHNESS_POLL_INTERVAL_MS);
        heartbeatFreshness = await checkFreshness(base44, device.id);
        if (!heartbeatFreshness || heartbeatFreshness.last_heartbeat > initialLastHb) break;
      }
    }

    if (heartbeatFreshness && !heartbeatFreshness.fresh) {
      return Response.json({
        error: 'Device heartbeat stale — UDP session expired. Command not sent.',
        heartbeat_age_seconds: Math.round((heartbeatFreshness.age_ms || 0) / 1000),
        max_age_seconds: MAX_HEARTBEAT_AGE_MS / 1000,
        suggestion: 'Try again — system will automatically wait for next heartbeat.',
      }, { status: 503 });
    }

    const ascii = buildRelayPowerSaveAscii(device.unique_id, mode);
    const hex = buildMt20WrappedPacket(ascii);
    const traccarResult = await sendTraccarCommand(device.traccar_device_id, hex);

    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'gps.device_config_traccar_sent',
      actor_id: user.id,
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'TelematicsDevice',
      target_id: device.id,
      vehicle_id: device.vehicle_id || '',
      summary: `Traccar relay power-save ${powerSaveMode ? 'ENABLED' : 'DISABLED'} for ${device.unique_id}`,
      metadata: { command: '019', mode, power_save_mode: powerSaveMode, ascii_command: ascii, hex_packet: hex, freshness_gate: true, heartbeat_freshness: heartbeatFreshness },
      source: 'admin_panel',
      event_status: 'success',
    }).catch(() => {});

    return Response.json({
      ok: true,
      device_id: device.id,
      unique_id: device.unique_id,
      traccar_device_id: device.traccar_device_id,
      power_save_mode: powerSaveMode,
      freshness_gate: true,
      heartbeat_freshness: heartbeatFreshness,
      ascii_command: ascii,
      hex_packet: hex,
      traccar_response: traccarResult,
      message: powerSaveMode
        ? 'Relay power-save ENABLED via Traccar. Relay will release 60s after ACC off.'
        : 'Relay power-save DISABLED via Traccar. Relay stays energized 24/7.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});