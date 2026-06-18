import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PROVIDER_KEY = 'traccar_noran_mt20';
const RETRY_INTERVAL_SECONDS = 5;
const MAX_ATTEMPTS = 12;

function envValue(name) {
  return String(Deno.env.toObject()[name] || '').trim();
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

// ── HEARTBEAT FRESHNESS GATE ──
const MAX_HEARTBEAT_AGE_MS = 10000;

function isHeartbeatFresh(device) {
  const lastHb = new Date(device.last_heartbeat_received_at || 0).getTime();
  return (Date.now() - lastHb) <= MAX_HEARTBEAT_AGE_MS;
}

async function sendViaTraccar(device, hexPayload) {
  const baseUrl = envValue('TRACCAR_BASE_URL');
  const username = envValue('TRACCAR_USERNAME');
  const password = envValue('TRACCAR_PASSWORD');
  
  if (!baseUrl || !username || !password) throw new Error('Traccar credentials not configured');

  const traccarDeviceId = Number(device.traccar_device_id);
  if (!Number.isFinite(traccarDeviceId)) throw new Error('Invalid Traccar device ID');

  const traccarPayload = { deviceId: traccarDeviceId, type: 'custom', attributes: { data: hexPayload } };
  const sentAt = new Date().toISOString();
  const res = await fetch(joinUrl(baseUrl, '/api/commands/send'), {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(traccarPayload)
  });

  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Traccar API failed (${res.status}): ${text}`);

  return { traccar_payload: traccarPayload, traccar_response: data, sent_to_traccar_at: sentAt, traccar_api_status: res.status };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const isScheduled = req.headers.get('x-base44-scheduled-function') === 'true';
    if (!isScheduled && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin or scheduled function only' }, { status: 403 });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();

    const retryingCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({
      provider_key: PROVIDER_KEY,
      queue_status: 'retrying_until_ack'
    });

    if (retryingCommands.length === 0) {
      return Response.json({ ok: true, processed: 0, message: 'No commands in retry queue' });
    }

    const results = { processed: 0, attempts_sent: 0, commands_completed: 0, commands_failed: 0, details: [] };

    for (const command of retryingCommands) {
      try {
        const payload = command.request_payload || {};
        const requestedAt = new Date(command.requested_at || command.created_at || command.created_date || now).getTime();
        const elapsedSeconds = Math.floor((nowMs - requestedAt) / 1000);
        const shouldAttemptNumber = Math.min(Math.floor(elapsedSeconds / RETRY_INTERVAL_SECONDS) + 1, MAX_ATTEMPTS);
        const currentAttempt = payload.retry_attempt_number || 0;
        const nextAttempt = Math.max(currentAttempt + 1, shouldAttemptNumber);

        if (currentAttempt >= MAX_ATTEMPTS || ['acknowledged', 'executed', 'delivered'].includes(command.status || '')) {
          if (command.status !== 'no_ack_after_retries' && !['acknowledged', 'executed', 'delivered'].includes(command.status || '')) {
            await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
              status: 'no_ack_after_retries', queue_status: 'no_ack_after_retries', confirmation_status: 'failed',
              stop_reason: 'max_attempts_reached', final_attempt_at: nowIso, total_attempts_sent: currentAttempt
            });
            results.commands_failed++;
          } else {
            results.commands_completed++;
          }
          continue;
        }

        if (currentAttempt >= nextAttempt) {
          results.details.push({ command_id: command.id, action: 'already_sent', current_attempt: currentAttempt, should_attempt: nextAttempt });
          continue;
        }

        const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: command.telematics_device_id });
        const device = devices[0];
        if (!device) {
          await base44.asServiceRole.entities.TelematicsCommand.update(command.id, { status: 'failed', queue_status: 'failed', failure_reason: 'Device not found' });
          results.commands_failed++;
          continue;
        }

        const hexPayload = command.hex_payload || command.wrapped_payload;
        if (!hexPayload) {
          await base44.asServiceRole.entities.TelematicsCommand.update(command.id, { status: 'failed', queue_status: 'failed', failure_reason: 'No hex payload' });
          results.commands_failed++;
          continue;
        }

        // ── Heartbeat freshness check — skip retry if UDP session stale ──
        if (!isHeartbeatFresh(device)) {
          const hbAge = Math.round((nowMs - new Date(device.last_heartbeat_received_at || 0).getTime()) / 1000);
          console.log(`[NORAN_RETRY_SKIP_STALE] command=${command.id} device=${device.unique_id} heartbeat_age=${hbAge}s — skipping retry, UDP session expired`);
          results.details.push({ command_id: command.id, action: 'skipped_stale_heartbeat', heartbeat_age_seconds: hbAge });
          results.processed++;
          continue;
        }

        const lastHeartbeatAt = device.last_heartbeat_received_at || device.last_inbound_packet_at;
        const lastHeartbeatMs = lastHeartbeatAt ? new Date(lastHeartbeatAt).getTime() : 0;
        const secondsAfterHeartbeat = lastHeartbeatMs ? Math.floor((nowMs - lastHeartbeatMs) / 1000) : null;

        let attemptResult;
        try {
          attemptResult = await sendViaTraccar(device, hexPayload);
        } catch (error) {
          await base44.asServiceRole.entities.TelematicsCommandAttempt.create({
            command_id: command.id, telematics_device_id: device.id, device_unique_id: device.unique_id,
            traccar_device_id: device.traccar_device_id, command_type: command.command_type, attempt_number: nextAttempt,
            attempted_at: nowIso, seconds_after_request: elapsedSeconds, seconds_after_last_heartbeat: secondsAfterHeartbeat,
            last_heartbeat_at: lastHeartbeatAt || null, traccar_api_called: true, traccar_api_status: null,
            failure_reason: error.message, host_id: device.host_id, vehicle_id: device.vehicle_id, provider_key: PROVIDER_KEY
          });
          await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
            request_payload: { ...payload, retry_attempt_number: nextAttempt, last_error: error.message, last_attempt_at: nowIso },
            last_attempt_at: nowIso, total_attempts_sent: nextAttempt
          });
          results.details.push({ command_id: command.id, attempt: nextAttempt, action: 'send_failed', error: error.message });
          results.processed++;
          continue;
        }

        await base44.asServiceRole.entities.TelematicsCommandAttempt.create({
          command_id: command.id, telematics_device_id: device.id, device_unique_id: device.unique_id,
          traccar_device_id: device.traccar_device_id, command_type: command.command_type, attempt_number: nextAttempt,
          attempted_at: nowIso, seconds_after_request: elapsedSeconds, seconds_after_last_heartbeat: secondsAfterHeartbeat,
          last_heartbeat_at: lastHeartbeatAt || null, traccar_api_called: true, traccar_api_status: attemptResult.traccar_api_status,
          traccar_response: attemptResult.traccar_response, ascii_payload: command.ascii_payload, hex_payload: hexPayload,
          sent_to_traccar_at: attemptResult.sent_to_traccar_at, host_id: device.host_id, vehicle_id: device.vehicle_id, provider_key: PROVIDER_KEY
        });

        await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
          request_payload: { ...payload, retry_attempt_number: nextAttempt, last_attempt_at: nowIso, last_traccar_response: attemptResult.traccar_response },
          last_attempt_at: nowIso, total_attempts_sent: nextAttempt
        });

        results.attempts_sent++;
        results.processed++;
        results.details.push({
          command_id: command.id, attempt: nextAttempt, action: 'attempt_sent',
          seconds_after_request: elapsedSeconds, elapsed_seconds: elapsedSeconds, calculated_attempt: shouldAttemptNumber
        });

        console.log(`[NORAN_RETRY] command=${command.command_type} device=${device.unique_id} attempt=${nextAttempt}/${MAX_ATTEMPTS} elapsed=${elapsedSeconds}s calculated=${shouldAttemptNumber} traccar_status=${attemptResult.traccar_api_status}`);

      } catch (error) {
        console.error('[NORAN_RETRY] Error processing command:', command.id, error.message);
        results.details.push({ command_id: command.id, action: 'error', error: error.message });
      }
    }

    return Response.json({ ok: true, ...results, timestamp: nowIso });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});