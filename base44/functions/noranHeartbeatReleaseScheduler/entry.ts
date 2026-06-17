import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Noran MT20 Heartbeat-Triggered Command Release Scheduler ──
// Runs every minute to check for heartbeat-matched commands ready to release
// Only applies to: provider_key = traccar_noran_mt20, production_commands_enabled = true

const PROVIDER_KEY = 'traccar_noran_mt20';
const HEARTBEAT_EXPIRATION_SECONDS = 90;
const STARTER_COMMANDS = ['disable_starter', 'restore_starter'];

function envValue(name) {
  return String(Deno.env.toObject()[name] || '').trim();
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
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
    headers: {
      Authorization: 'Basic ' + btoa(`${username}:${password}`),
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
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

  // Find all Noran commands waiting for heartbeat (BACKUP ONLY - webhook handles primary release)
  const pendingCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({
    provider_key: PROVIDER_KEY,
    queue_status: 'pending_waiting_for_next_heartbeat'
  }, '-created_date', 50);

    if (pendingCommands.length === 0) {
      return Response.json({ ok: true, processed: 0, waiting: 0, released: 0, expired: 0, message: 'No commands pending heartbeat' });
    }

    const results = { processed: 0, waiting: 0, released: 0, expired: 0, details: [] };

    for (const command of pendingCommands) {
      try {
        const requestedAt = new Date(command.requested_at || command.created_at || command.created_date || now).getTime();
        const elapsedSeconds = Math.floor((nowMs - requestedAt) / 1000);

        // Check expiration (90 seconds without heartbeat)
        if (elapsedSeconds > HEARTBEAT_EXPIRATION_SECONDS) {
          await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
            status: 'expired_no_heartbeat',
            queue_status: 'expired_no_heartbeat',
            confirmation_status: 'failed',
            stop_reason: 'expired_no_heartbeat',
            final_attempt_at: nowIso,
            failure_reason: `Command expired after ${elapsedSeconds}s without heartbeat (max: ${HEARTBEAT_EXPIRATION_SECONDS}s)`
          });
          results.expired++;
          results.details.push({ command_id: command.id, action: 'expired', elapsed_seconds: elapsedSeconds });
          continue;
        }

        // Get device
        const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: command.telematics_device_id });
        const device = devices[0];
        if (!device) {
          await base44.asServiceRole.entities.TelematicsCommand.update(command.id, { status: 'failed', queue_status: 'failed', failure_reason: 'Device not found' });
          results.details.push({ command_id: command.id, action: 'device_not_found' });
          continue;
        }

        const configuredDelay = device.post_heartbeat_release_delay_seconds ?? 0;
        const lastHeartbeatAt = device.last_heartbeat_received_at || device.last_inbound_packet_at;
        
        // Check if heartbeat matched
        const heartbeatMatchedAt = command.heartbeat_matched_at || (lastHeartbeatAt ? new Date(lastHeartbeatAt).getTime() : null);
        
        if (!heartbeatMatchedAt) {
          results.waiting++;
          results.details.push({ command_id: command.id, action: 'waiting_for_heartbeat', elapsed_seconds: elapsedSeconds });
          continue;
        }

        // Heartbeat matched - check if delay period passed
        const heartbeatMatchedMs = typeof heartbeatMatchedAt === 'string' ? new Date(heartbeatMatchedAt).getTime() : heartbeatMatchedAt;
        
        // CRITICAL: If delay is 0, skip waiting and release immediately
        if (configuredDelay === 0) {
          // Immediate release - no waiting
        } else {
          const msSinceHeartbeat = nowMs - heartbeatMatchedMs;
          const secondsSinceHeartbeat = Math.floor(msSinceHeartbeat / 1000);
          const delayMs = configuredDelay * 1000;

          if (msSinceHeartbeat < delayMs) {
            const remainingSeconds = Math.ceil((delayMs - msSinceHeartbeat) / 1000);
            results.waiting++;
            results.details.push({ 
              command_id: command.id, 
              action: 'waiting_for_delay', 
              configured_delay: configuredDelay,
              seconds_since_heartbeat: secondsSinceHeartbeat,
              remaining_seconds: remainingSeconds
            });
            continue;
          }
        }

        // Safety: block starter commands
        if (STARTER_COMMANDS.includes(command.command_type)) {
          await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
            status: 'blocked', queue_status: 'blocked', stop_reason: 'starter_commands_not_supported',
            failure_reason: 'Starter commands not supported in heartbeat-delay strategy'
          });
          results.details.push({ command_id: command.id, action: 'blocked_starter' });
          continue;
        }

        // Release command
        const hexPayload = command.hex_payload || command.wrapped_payload;
        if (!hexPayload) {
          await base44.asServiceRole.entities.TelematicsCommand.update(command.id, { status: 'failed', queue_status: 'failed', failure_reason: 'No hex payload' });
          results.details.push({ command_id: command.id, action: 'no_payload' });
          continue;
        }

        let sendResult;
        try {
          sendResult = await sendViaTraccar(device, hexPayload);
        } catch (error) {
          await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
            status: 'failed', queue_status: 'failed', failure_reason: `Traccar send failed: ${error.message}`, failed_at: nowIso
          });
          results.details.push({ command_id: command.id, action: 'send_failed', error: error.message });
          continue;
        }

        const actualDelaySeconds = configuredDelay === 0 ? 0 : Math.floor((nowMs - heartbeatMatchedMs) / 1000);

        await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
          status: 'sent', queue_status: 'sent', confirmation_status: 'sent', sent_at: nowIso,
          sent_to_traccar_at: sendResult.sent_to_traccar_at,
          traccar_api_response: sendResult.traccar_response,
          transmission_format: 'mt20_wrapped_hex',
          provider_response: sendResult.traccar_response,
          released_after_heartbeat: true,
          released_at: nowIso,
          heartbeat_matched_at: typeof heartbeatMatchedAt === 'number' ? new Date(heartbeatMatchedAt).toISOString() : heartbeatMatchedAt,
          configured_post_heartbeat_release_delay_seconds: configuredDelay,
          actual_heartbeat_to_release_delay_seconds: actualDelaySeconds,
          heartbeat_source_ip: device.last_heartbeat_source_ip,
          heartbeat_source_port: device.last_heartbeat_source_port,
          release_strategy: 'heartbeat_delay'
        });

        await base44.asServiceRole.entities.TelematicsEvent.create({
          telematics_device_id: device.id, provider_key: PROVIDER_KEY, vehicle_id: device.vehicle_id || '',
          event_type: `command_${command.command_type}_sent`, source: 'heartbeat_trigger',
          raw_payload: { released_after_heartbeat: true, configured_delay: configuredDelay, actual_delay_seconds: actualDelaySeconds },
          created_at: nowIso
        }).catch(() => {});

        results.released++;
        results.processed++;
        results.details.push({
          command_id: command.id, action: 'released', configured_delay: configuredDelay,
          actual_delay_seconds: actualDelaySeconds
        });

        console.log(`[NORAN_HEARTBEAT_RELEASE] command=${command.command_type} device=${device.unique_id} configured_delay=${configuredDelay}s actual_delay=${actualDelaySeconds}s immediate_release=${configuredDelay === 0}`);

      } catch (error) {
        console.error('[NORAN_HEARTBEAT_RELEASE] Error:', command.id, error.message);
        results.details.push({ command_id: command.id, action: 'error', error: error.message });
      }
    }

    return Response.json({ ok: true, ...results, timestamp: nowIso });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});