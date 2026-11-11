import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Verifies that a payment-enforcement starter kill (007,1,1) ACTUALLY landed.
//
// Background: a kill used to be treated as successful the moment the device
// echoed an ACK. An ACK only proves the packet was received — the MT20 reports
// the relay state it held BEFORE the command executes. So the only honest proof
// is a seconds-later status read showing starterKilled = true.
//
// Read trick (same mechanism as verifyNoranRelayPowerSave): re-sending the kill
// is safe and idempotent, and its ACK carries bEnable = the state the relay was
// in immediately before this send. If the earlier kill is holding, that reads
// true. If it reads false, the kill never engaged.
//
// Outcomes per open enforcement kill:
//   confirmed          -> command marked executed, device.starter_disabled = true
//   not_holding        -> retry_count++, keep open (next run re-checks)
//   failed             -> after 3 attempts OR vehicle moving -> critical alert
//   device_offline     -> heartbeat stale, cannot read; no false confidence

const PROVIDER_KEY = 'traccar_noran_mt20';
const MAX_HEARTBEAT_AGE_MS = 10000;
const FRESHNESS_TIMEOUT_MS = 30000;
const POLL_INTERVAL_MS = 500;
const ACK_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 3;
const ALERT_DEDUPE_HOURS = 6;
const OPEN_ALERT_STATUSES = ['new', 'notified', 'acknowledged', 'in_progress', 'under_review', 'escalated'];

function envValue(name) { return String(Deno.env.toObject()[name] || '').trim(); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function bytesToHex(bytes) { return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase(); }
function sanitizeIdentifier(value = '') { return String(value).replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80); }

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

function buildDisableStarterAscii(deviceId) {
  const now = new Date();
  const hhmmss = [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()].map((n) => String(n).padStart(2, '0')).join('');
  return `*KW,${sanitizeIdentifier(deviceId)},007,${hhmmss},1,1#`;
}

async function sendViaTraccar(device, hexPayload) {
  const baseUrl = envValue('TRACCAR_BASE_URL');
  const username = envValue('TRACCAR_USERNAME');
  const password = envValue('TRACCAR_PASSWORD');
  if (!baseUrl || !username || !password) throw new Error('Traccar credentials not configured');
  const traccarDeviceId = Number(device.traccar_device_id);
  if (!Number.isFinite(traccarDeviceId)) throw new Error('Invalid Traccar device ID');
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/commands/send`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ deviceId: traccarDeviceId, type: 'custom', attributes: { data: hexPayload } }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Traccar rejected (${res.status}): ${text.slice(0, 200)}`);
  return true;
}

function heartbeatAgeMs(device) {
  return Date.now() - new Date(device?.last_heartbeat_received_at || 0).getTime();
}

async function waitForFreshHeartbeat(base44, device) {
  if (heartbeatAgeMs(device) <= MAX_HEARTBEAT_AGE_MS) return { fresh: true, waited: false };
  const initial = new Date(device?.last_heartbeat_received_at || 0).getTime();
  const start = Date.now();
  while (Date.now() - start < FRESHNESS_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    const fresh = (await base44.asServiceRole.entities.TelematicsDevice.filter({ id: device.id }))[0];
    if (!fresh) return { fresh: false, reason: 'device_not_found' };
    if (new Date(fresh.last_heartbeat_received_at || 0).getTime() > initial) {
      return { fresh: true, waited: true, wait_ms: Date.now() - start, device: fresh };
    }
  }
  return { fresh: false, reason: 'timeout', age_ms: heartbeatAgeMs(device) };
}

// Reads the relay state the device reports in its command ACK / position packet.
async function readRelayState(base44, deviceId, afterMs) {
  const start = Date.now();
  while (Date.now() - start < ACK_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
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
        return {
          found: true,
          starter_killed: parsed.status_bits.starterKilled,
          status_bits: parsed.status_bits,
          event_id: ev.id,
          packet_type: parsed.packet_type,
          received_at: ev.created_date,
        };
      }
    }
  }
  return { found: false };
}

async function createOnce(base44, dedupeKey, payload) {
  const since = new Date(Date.now() - ALERT_DEDUPE_HOURS * 60 * 60 * 1000).toISOString();
  const existing = await base44.asServiceRole.entities.OperationalAlert.filter({
    dedupe_key: dedupeKey,
    status: { $in: OPEN_ALERT_STATUSES },
  });
  if (existing.length > 0) {
    const open = existing[0];
    await base44.asServiceRole.entities.OperationalAlert.update(open.id, {
      repeat_count: (open.repeat_count || 1) + 1,
      last_duplicate_at: new Date().toISOString(),
    }).catch(() => {});
    return { created: false, alert_id: open.id };
  }
  const priorRecent = await base44.asServiceRole.entities.OperationalAlert.filter({
    dedupe_key: dedupeKey,
    created_date: { $gte: since },
  });
  if (priorRecent.length > 0) return { created: false, alert_id: priorRecent[0].id, suppressed: true };

  const alert = await base44.asServiceRole.entities.OperationalAlert.create({
    ...payload,
    dedupe_key: dedupeKey,
    first_seen_at: new Date().toISOString(),
    repeat_count: 1,
  });
  return { created: true, alert_id: alert.id };
}

// Verifies one open enforcement kill. Returns a plain result object.
async function verifyCommand(base44, command) {
  const deviceId = command.telematics_device_id;
  if (!deviceId) return { command_id: command.id, outcome: 'no_device_linked' };

  const device = (await base44.asServiceRole.entities.TelematicsDevice.filter({ id: deviceId }))[0];
  if (!device) return { command_id: command.id, outcome: 'device_not_found' };
  if (device.provider_key !== PROVIDER_KEY || !device.traccar_device_id) {
    return { command_id: command.id, outcome: 'unsupported_device' };
  }

  const freshness = await waitForFreshHeartbeat(base44, device);
  if (!freshness.fresh) {
    return {
      command_id: command.id,
      device_unique_id: device.unique_id,
      outcome: 'device_offline',
      detail: 'Heartbeat stale — relay state could not be read. Not treated as enforced.',
    };
  }
  const liveDevice = freshness.device || device;

  // Re-send the kill. Idempotent, and its ACK reports the relay state held
  // immediately before this send — i.e. whether the earlier kill is holding.
  const ascii = buildDisableStarterAscii(device.unique_id);
  const sentAt = Date.now();
  await sendViaTraccar(liveDevice, buildMt20WrappedPacket(ascii));
  const read = await readRelayState(base44, device.id, sentAt);

  if (!read.found) {
    return {
      command_id: command.id,
      device_unique_id: device.unique_id,
      outcome: 'no_device_response',
      detail: 'Device did not report relay state after re-send.',
    };
  }

  const moving = Number(liveDevice.speed || 0) > 3;
  const ignitionOn = liveDevice.ignition_status === 'on';
  const enteredThisSend = read.starter_killed === true;

  const base = {
    command_id: command.id,
    device_unique_id: device.unique_id,
    vehicle_id: device.vehicle_id || command.vehicle_id || null,
    host_id: device.host_id || command.host_id || null,
    starter_killed: read.starter_killed,
    ignition_on: ignitionOn,
    speed: Number(liveDevice.speed || 0),
    read_event_id: read.event_id,
  };

  if (enteredThisSend) {
    await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
      status: 'executed',
      queue_status: 'confirmed',
      confirmation_status: 'executed',
      executed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
      acknowledgement_source: 'device_status_bit',
      failure_reason: null,
      provider_response: { ...(command.provider_response || {}), starter_kill_verification: { ...base, verified_at: new Date().toISOString() } },
    });
    await base44.asServiceRole.entities.TelematicsDevice.update(device.id, { starter_disabled: true });
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'gps.kill_confirmed',
      actor_role: 'system',
      target_entity: 'TelematicsDevice',
      target_id: device.id,
      vehicle_id: device.vehicle_id || '',
      host_id: device.host_id || '',
      booking_id: command.booking_id || null,
      summary: `Starter kill CONFIRMED on ${device.unique_id} — device reports relay open.`,
      metadata: base,
      source: 'system',
      event_status: 'success',
    }).catch(() => {});
    return { ...base, outcome: 'confirmed' };
  }

  // Relay is NOT open: the kill never engaged or it released.
  const attempts = Number(command.retry_count || 0) + 1;
  await base44.asServiceRole.entities.TelematicsDevice.update(device.id, { starter_disabled: false });

  if (attempts >= MAX_ATTEMPTS || moving || ignitionOn) {
    await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
      status: 'failed',
      queue_status: 'failed',
      confirmation_status: 'failed',
      failed_at: new Date().toISOString(),
      retry_count: attempts,
      failure_reason: moving || ignitionOn
        ? 'starter_kill_bypassed_vehicle_in_use'
        : `relay_not_engaged_after_${attempts}_attempts`,
      provider_response: { ...(command.provider_response || {}), starter_kill_verification: { ...base, verified_at: new Date().toISOString() } },
    });

    await createOnce(base44, `starter_kill_bypass_${device.id}`, {
      alert_type: 'command_acknowledged_not_executed',
      severity: 'critical',
      status: 'new',
      domain: 'payments',
      title: moving || ignitionOn
        ? `Starter kill NOT holding — vehicle in use (${device.unique_id})`
        : `Starter kill failed after ${attempts} attempts (${device.unique_id})`,
      message: moving || ignitionOn
        ? `Device ${device.unique_id} acknowledged the payment-enforcement kill but reports ignition=${liveDevice.ignition_status || 'unknown'} and speed=${Math.round(Number(liveDevice.speed || 0))} mph. The vehicle is being driven while enforcement is active. The relay is not opening — treat as a retrieval case, not a payment nudge.`
        : `Device ${device.unique_id} acknowledged the kill but its status packet reports the relay still closed after ${attempts} attempts. Wiring or relay fault suspected.`,
      recommended_action: moving || ignitionOn
        ? 'Confirm relay wiring with the installer. Vehicle can be driven — dispatch retrieval and consider it unauthorized use.'
        : 'Inspect relay wiring at the vehicle. Vehicle can still be started.',
      source_entity_type: 'TelematicsCommand',
      source_entity_id: command.id,
      telematics_device_id: device.id,
      vehicle_id: device.vehicle_id || null,
      host_id: device.host_id || null,
      command_id: command.id,
      related_booking_id: command.booking_id || null,
      provider_key: PROVIDER_KEY,
      action_url: '/admin/vehicle-command-center',
      metadata: base,
    });

    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'gps.kill_failed',
      actor_role: 'system',
      target_entity: 'TelematicsDevice',
      target_id: device.id,
      vehicle_id: device.vehicle_id || '',
      host_id: device.host_id || '',
      booking_id: command.booking_id || null,
      summary: `Starter kill NOT holding on ${device.unique_id} (ignition=${liveDevice.ignition_status || 'unknown'}, ${Math.round(Number(liveDevice.speed || 0))} mph).`,
      metadata: base,
      source: 'system',
      event_status: 'error',
    }).catch(() => {});

    return { ...base, outcome: 'failed', attempts };
  }

  await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
    retry_count: attempts,
    confirmation_status: 'pending',
    failure_reason: 'relay_not_engaged_retrying',
    provider_response: { ...(command.provider_response || {}), starter_kill_verification: { ...base, verified_at: new Date().toISOString() } },
  });
  return { ...base, outcome: 'not_holding', attempts };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    const url = new URL(req.url);
    const cronSecret = envValue('CRON_SECRET');
    const providedSecret = req.headers.get('x-cron-secret') || url.searchParams.get('secret');
    const isScheduled = req.headers.get('x-base44-scheduled-function') === 'true';
    const isCron = !!(cronSecret && providedSecret === cronSecret);
    if (!isScheduled && !isCron && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin, scheduled, or cron-secret required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const deviceId = body.device_id ? String(body.device_id) : null;
    const commandId = body.command_id ? String(body.command_id) : null;
    const bookingId = body.booking_id ? String(body.booking_id) : null;
    const lookbackDays = Number(body.lookback_days) || 21;

    const sinceMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

    let candidates = await base44.asServiceRole.entities.TelematicsCommand.filter(
      { provider_key: PROVIDER_KEY, command_type: 'disable_starter' },
      '-created_date',
      200
    );

    candidates = candidates.filter((c) => {
      const created = new Date(c.created_date || c.created_at || 0).getTime();
      if (created < sinceMs) return false;
      if (c.confirmation_status === 'executed' || c.confirmed_at) return false;
      if (['failed', 'expired', 'blocked', 'cancelled'].includes(c.queue_status)) return false;
      if (commandId) return c.id === commandId;
      if (bookingId) return c.booking_id === bookingId;
      if (deviceId) return c.telematics_device_id === deviceId;
      return true;
    });

    if (candidates.length === 0) {
      return Response.json({ ok: true, checked: 0, message: 'No unconfirmed enforcement kills to verify.' });
    }

    const results = [];
    for (let i = 0; i < candidates.length; i += 4) {
      const batch = candidates.slice(i, i + 4);
      const settled = await Promise.allSettled(batch.map((c) => verifyCommand(base44, c)));
      for (let j = 0; j < settled.length; j++) {
        const s = settled[j];
        results.push(s.status === 'fulfilled'
          ? s.value
          : { command_id: batch[j].id, outcome: 'error', detail: s.reason?.message || 'unknown' });
      }
    }

    const summary = results.reduce((acc, r) => {
      acc[r.outcome] = (acc[r.outcome] || 0) + 1;
      return acc;
    }, {});

    return Response.json({ ok: true, checked: results.length, summary, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});