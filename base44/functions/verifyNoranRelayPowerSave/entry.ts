import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Admin-only: verifies whether relay power-save (MT20 command 019, X=0) is actually
// in effect on a single Noran MT20 device by observing the starter-kill relay's
// behavior across the 60s ACC-off release window.
//
// Sequence (all commands gated by heartbeat freshness so packets reach the device):
//   1. Wait for a fresh heartbeat (≤10s old, up to 30s)
//   2. Send disable_starter (007,1,1) → device ACKs with bEnable showing pre-command state
//   3. Wait 70s (the 60s relay-release window + buffer)
//   4. Send restore_starter (007,1,0) → device responds with 0x8009 ACK or 0x0032 position,
//      both carrying bEnable that reflects the relay state BEFORE restore executes
//   5. Check starterKilled from the response:
//        false → relay auto-released during wait → power-save ON  → PASS
//        true  → relay stayed energized           → power-save OFF → FAIL

const MAX_HEARTBEAT_AGE_MS = 10000;
const POLL_INTERVAL_MS = 500;
const FRESHNESS_TIMEOUT_MS = 30000;
const ACK_TIMEOUT_MS = 30000;
const RELAY_RELEASE_WAIT_MS = 70000;

function sanitizeIdentifier(value = '') { return String(value).replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80); }
function bytesToHex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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
  return `${sMarkHex}${packetLenHex}${cmdHex}${gisIpHex}${portHex}${bytesToHex(paddedSData)}${sEndHex}`;
}

function buildAsciiCommand(deviceId, commandType) {
  const now = new Date();
  const hhmmss = [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()].map(n => String(n).padStart(2, '0')).join('');
  const clean = sanitizeIdentifier(deviceId);
  if (commandType === 'locate') return `*KW,${clean},000,${hhmmss}#`;
  if (commandType === 'disable_starter') return `*KW,${clean},007,${hhmmss},1,1#`;
  if (commandType === 'restore_starter') return `*KW,${clean},007,${hhmmss},1,0#`;
  throw new Error(`Unknown command type: ${commandType}`);
}

async function sendTraccarCommand(traccarDeviceId, hexPayload) {
  const baseUrl = Deno.env.get('TRACCAR_BASE_URL');
  const username = Deno.env.get('TRACCAR_USERNAME');
  const password = Deno.env.get('TRACCAR_PASSWORD');
  if (!baseUrl || !username || !password) throw new Error('Traccar credentials not configured');
  const payload = { deviceId: Number(traccarDeviceId), type: 'custom', attributes: { data: hexPayload } };
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/commands/send`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Traccar rejected (${res.status}): ${typeof data?.raw === 'string' ? data.raw : JSON.stringify(data)}`);
  return data;
}

async function checkFreshness(base44, deviceId) {
  const device = (await base44.asServiceRole.entities.TelematicsDevice.filter({ id: deviceId }))[0];
  if (!device) return null;
  const lastHb = new Date(device.last_heartbeat_received_at || 0).getTime();
  return { fresh: Date.now() - lastHb <= MAX_HEARTBEAT_AGE_MS, age_ms: Date.now() - lastHb, last_heartbeat: lastHb };
}

async function waitForFreshHeartbeat(base44, deviceId) {
  let f = await checkFreshness(base44, deviceId);
  if (!f) return { fresh: false, reason: 'device_not_found' };
  if (f.fresh) return { fresh: true, age_ms: f.age_ms, waited: false };
  const start = Date.now();
  const initial = f.last_heartbeat;
  while (Date.now() - start < FRESHNESS_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    f = await checkFreshness(base44, deviceId);
    if (!f) return { fresh: false, reason: 'device_not_found' };
    if (f.last_heartbeat > initial) return { fresh: true, age_ms: f.age_ms, waited: true, wait_ms: Date.now() - start };
  }
  return { fresh: false, age_ms: f.age_ms, reason: 'timeout', wait_ms: FRESHNESS_TIMEOUT_MS };
}

async function waitForAck(base44, deviceId, afterMs) {
  const start = Date.now();
  while (Date.now() - start < ACK_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    // Query both 0x8009 command-response events AND 0x0032 position/voltage events,
    // since the MT20 device may respond to command 007 with either packet type.
    const [ackEvents, posEvents] = await Promise.all([
      base44.asServiceRole.entities.TelematicsEvent.filter(
        { telematics_device_id: deviceId, event_type: 'mt20_command_response_forwarded_log' }, '-created_date', 5
      ),
      base44.asServiceRole.entities.TelematicsEvent.filter(
        { telematics_device_id: deviceId, event_type: 'mt20_voltage_forwarded_log' }, '-created_date', 5
      ),
    ]);
    for (const ev of [...ackEvents, ...posEvents]) {
      const evTime = new Date(ev.created_date || ev.created_at || 0).getTime();
      if (evTime < afterMs) continue;
      const parsed = ev.raw_payload?.parsed_forwarded_log;
      if (parsed?.status_bits) {
        return { found: true, starter_killed: parsed.status_bits.starterKilled, status_bits: parsed.status_bits, event_id: ev.id, received_at: ev.created_date, packet_type: parsed.packet_type };
      }
    }
  }
  return { found: false };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json();
    const uniqueId = String(body.unique_id || '').trim();
    if (!uniqueId) return Response.json({ error: 'unique_id is required' }, { status: 400 });

    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ unique_id: uniqueId.toUpperCase() });
    const device = devices[0];
    if (!device) return Response.json({ error: 'Device not found' }, { status: 404 });
    if (device.provider_key !== 'traccar_noran_mt20') return Response.json({ error: 'Only Noran MT20 devices supported' }, { status: 400 });
    if (!device.traccar_device_id) return Response.json({ error: 'Device has no Traccar device ID' }, { status: 400 });

    const relayWaitMs = Number(body.relay_wait_ms) || RELAY_RELEASE_WAIT_MS;
    const steps = [];

    const freshness = await waitForFreshHeartbeat(base44, device.id);
    steps.push({ step: 'freshness_gate', ...freshness });
    if (!freshness.fresh) {
      return Response.json({ ok: false, error: 'Device heartbeat stale — UDP session expired.', steps, heartbeat_age_seconds: Math.round((freshness.age_ms || 0) / 1000) }, { status: 503 });
    }

    const disableAscii = buildAsciiCommand(device.unique_id, 'disable_starter');
    const disableHex = buildMt20WrappedPacket(disableAscii);
    const t1 = Date.now();
    await sendTraccarCommand(device.traccar_device_id, disableHex);
    const ack1 = await waitForAck(base44, device.id, t1);
    steps.push({ step: 'disable_starter', ascii: disableAscii, starter_killed: ack1.starter_killed, ack_found: ack1.found });
    if (!ack1.found) {
      await sendTraccarCommand(device.traccar_device_id, buildMt20WrappedPacket(buildAsciiCommand(device.unique_id, 'restore_starter'))).catch(() => {});
      return Response.json({ ok: false, error: 'No ACK received for disable_starter command.', steps }, { status: 504 });
    }

    await sleep(relayWaitMs);
    steps.push({ step: 'relay_release_wait', waited_ms: relayWaitMs });

    // Use restore_starter as the read step: its 0x8009 ACK contains bEnable
    // reflecting the relay state BEFORE restore executes. If power-save is ON,
    // the relay auto-released during the 70s wait → ACK shows starterKilled=FALSE.
    // If power-save is OFF, the relay stayed engaged → ACK shows starterKilled=TRUE.
    const restoreAscii = buildAsciiCommand(device.unique_id, 'restore_starter');
    const restoreHex = buildMt20WrappedPacket(restoreAscii);
    const t2 = Date.now();
    await sendTraccarCommand(device.traccar_device_id, restoreHex);
    const ack2 = await waitForAck(base44, device.id, t2);
    steps.push({ step: 'restore_starter_read', ascii: restoreAscii, starter_killed: ack2.starter_killed, ack_found: ack2.found });

    if (!ack2.found) {
      return Response.json({ ok: false, error: 'No ACK received for restore_starter — cannot determine power-save state.', steps }, { status: 504 });
    }

    const powerSaveActive = !ack2.starter_killed;
    const result = {
      ok: true,
      device_unique_id: device.unique_id,
      power_save_active: powerSaveActive,
      verdict: powerSaveActive
        ? 'PASS — relay released after ACC-off window (power-save is in effect)'
        : 'FAIL — relay stayed energized (power-save NOT in effect or disabled)',
      starter_killed_before: ack1.starter_killed,
      starter_killed_after: ack2.starter_killed,
      relay_release_wait_ms: relayWaitMs,
      steps,
    };

    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'gps.device_config_traccar_sent',
      actor_id: user.id, actor_email: user.email, actor_role: 'admin',
      target_entity: 'TelematicsDevice', target_id: device.id, vehicle_id: device.vehicle_id || '',
      summary: `Power-save verify for ${device.unique_id}: ${powerSaveActive ? 'PASS' : 'FAIL'}`,
      metadata: { verify: true, power_save_active: powerSaveActive, starter_killed_before: ack1.starter_killed, starter_killed_after: ack2.starter_killed },
      source: 'admin_panel', event_status: powerSaveActive ? 'success' : 'warning',
    }).catch(() => {});

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});