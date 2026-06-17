// ── Noran MT20 Heartbeat-Triggered Command Dispatch Logic ──
// Extracted from webhookLightLogForwarder for maintainability

const NORAN_HEARTBEAT_EXPIRY_SECONDS = 90;
const UDP_MIN_COMMAND_SPACING_MS = 3000;
const UDP_PENDING_STATUS = 'pending_waiting_for_next_heartbeat';
const STARTER_COMMANDS = ['disable_starter', 'restore_starter'];

export function isStarterCommand(commandType) {
  return STARTER_COMMANDS.includes(commandType);
}

export async function dispatchPendingCommandViaTraccar(base44, command, device) {
  const baseUrl = String(Deno.env.get('TRACCAR_BASE_URL') || '').trim();
  const username = String(Deno.env.get('TRACCAR_USERNAME') || '').trim();
  const password = String(Deno.env.get('TRACCAR_PASSWORD') || '').trim();
  if (!baseUrl || !username || !password) throw new Error('Traccar credentials not configured for auto-dispatch.');

  const traccarDeviceId = Number(device.traccar_device_id);
  if (!Number.isFinite(traccarDeviceId)) throw new Error('Device has no valid Traccar device ID for auto-dispatch.');

  const hexPayload = command.hex_payload || command.wrapped_payload;
  if (!hexPayload) throw new Error('Pending command has no hex_payload to dispatch.');

  const traccarPayload = { deviceId: traccarDeviceId, type: 'custom', attributes: { data: hexPayload } };
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/commands/send`, {
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
  if (!res.ok) throw new Error(`Traccar dispatch failed (${res.status}): ${text}`);
  return { traccar_payload: traccarPayload, traccar_response: data };
}

export async function autoDispatchPendingCommands(base44, device, heartbeatTimestamp) {
  if (!device?.id || !heartbeatTimestamp) return 0;

  const now = new Date();
  const nowMs = Date.now();
  const expiryCutoff = new Date(nowMs - NORAN_HEARTBEAT_EXPIRY_SECONDS * 1000).toISOString();
  const configuredDelay = device.post_heartbeat_release_delay_seconds ?? 0;

  // Find oldest pending command - includes BOTH pending and waiting_for_delay statuses
  const pendingCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({
    telematics_device_id: device.id,
    queue_status: ['pending_waiting_for_next_heartbeat', 'waiting_for_delay']
  }, '-created_date', 10).catch(() => []);

  // Expire old commands (>90s without heartbeat)
  for (const cmd of pendingCommands) {
    const createdAt = cmd.created_at || cmd.created_date || '';
    if (createdAt && createdAt < expiryCutoff) {
      await base44.asServiceRole.entities.TelematicsCommand.update(cmd.id, {
        status: 'expired_no_heartbeat', queue_status: 'expired_no_heartbeat',
        confirmation_status: 'expired', failed_at: now.toISOString(),
        failure_reason: 'No heartbeat received within 90 seconds',
        status_message: 'Expired - no heartbeat'
      }).catch(() => {});
    }
  }

  // Find eligible command (not starter-locked without approval)
  const eligible = pendingCommands.find((cmd) => {
    const createdAt = cmd.created_at || cmd.created_date || '';
    if (!createdAt || createdAt < expiryCutoff) return false;
    if (isStarterCommand(cmd.command_type)) {
      const payload = cmd.request_payload || {};
      return (payload.starter_confirmation === true || payload.confirm_starter_command === true);
    }
    return true;
  });

  if (!eligible) return 0;

  // Enforce 3-second spacing
  const recentlySent = await base44.asServiceRole.entities.TelematicsCommand.filter(
    { telematics_device_id: device.id },
    '-created_date', 10
  ).catch(() => []);
  const tooRecent = recentlySent.some((cmd) => {
    if (cmd.id === eligible.id) return false;
    const sentMs = new Date(cmd.sent_at || cmd.created_at || cmd.created_date || 0).getTime();
    return (nowMs - sentMs) < UDP_MIN_COMMAND_SPACING_MS && ['sent', 'waiting_for_delay', 'sent_to_traccar'].includes(cmd.queue_status || cmd.status || '');
  });

  if (tooRecent) return 0;

  // HEARTBEAT-DELAY RULE: Handle both pending and waiting_for_delay commands
  const isWaitingForDelay = eligible.queue_status === 'waiting_for_delay';
  const hbMs = isWaitingForDelay 
    ? (eligible.heartbeat_received_at ? new Date(eligible.heartbeat_received_at).getTime() : new Date(heartbeatTimestamp).getTime())
    : new Date(heartbeatTimestamp).getTime();
  
  if (configuredDelay === 0) {
    // Immediate release - skip waiting_for_delay
  } else if (isWaitingForDelay) {
    const delayCompleteAt = hbMs + (configuredDelay * 1000);
    if (nowMs < delayCompleteAt) {
      const secondsRemaining = Math.ceil((delayCompleteAt - nowMs) / 1000);
      await base44.asServiceRole.entities.TelematicsCommand.update(eligible.id, {
        seconds_until_release: secondsRemaining,
        last_heartbeat_check_at: heartbeatTimestamp
      }).catch(() => {});
      return 0;
    }
  } else {
    const delayCompleteAt = hbMs + (configuredDelay * 1000);
    if (nowMs < delayCompleteAt) {
      const secondsRemaining = Math.ceil((delayCompleteAt - nowMs) / 1000);
      await base44.asServiceRole.entities.TelematicsCommand.update(eligible.id, {
        queue_status: 'waiting_for_delay',
        status: 'waiting_for_delay',
        status_message: `Heartbeat received, waiting ${configuredDelay}s before sending`,
        heartbeat_received_at: heartbeatTimestamp,
        heartbeat_matched_at: new Date().toISOString(),
        configured_delay_seconds: configuredDelay,
        seconds_until_release: secondsRemaining,
        delay_complete_at: new Date(delayCompleteAt).toISOString()
      }).catch(() => {});
      return 0;
    }
  }

  // Delay complete - send to Traccar
  try {
    const dispatchResult = await dispatchPendingCommandViaTraccar(base44, eligible, device);
    const traccarCommandId = dispatchResult.traccar_response?.id || dispatchResult.traccar_response?.commandId || null;
    const actualDelayMs = nowMs - hbMs;
    const releaseTriggeredBy = isWaitingForDelay ? 'webhook_waiting_for_delay' : 'webhook_immediate';

    await base44.asServiceRole.entities.TelematicsCommand.update(eligible.id, {
      queue_status: 'sent_to_traccar',
      status: 'sent_to_traccar',
      confirmation_status: 'sent',
      sent_at: now.toISOString(),
      sent_to_traccar_at: now.toISOString(),
      status_message: configuredDelay === 0 ? 'Released immediately on heartbeat (0s delay)' : `Sent to Traccar after ${configuredDelay}s delay`,
      traccar_api_response: dispatchResult.traccar_response || dispatchResult,
      transmission_format: 'mt20_wrapped_hex',
      provider_response: { ...dispatchResult, auto_dispatched: true, triggered_by: releaseTriggeredBy },
      heartbeat_received_at: eligible.heartbeat_received_at || heartbeatTimestamp,
      heartbeat_matched_at: eligible.heartbeat_matched_at || new Date().toISOString(),
      command_released_at: now.toISOString(),
      actual_heartbeat_to_release_delay_seconds: actualDelayMs / 1000,
      configured_delay_seconds: configuredDelay,
      delay_source: 'TelematicsDevice.post_heartbeat_release_delay_seconds',
      release_strategy: 'heartbeat_delay_only',
      release_triggered_by: releaseTriggeredBy,
      traccar_command_id: traccarCommandId
    });

    await base44.asServiceRole.entities.TelematicsEvent.create({
      telematics_device_id: device.id,
      provider_key: 'traccar_noran_mt20',
      vehicle_id: device.vehicle_id || '',
      event_type: `command_${eligible.command_type}_sent`,
      source: 'webhook',
      raw_payload: {
        auto_dispatched: true,
        pending_command_id: eligible.id,
        triggered_by: 'heartbeat_delay_release',
        dispatch_result: dispatchResult,
        configured_delay_seconds: configuredDelay,
        actual_delay_seconds: actualDelayMs / 1000
      },
      created_at: now.toISOString()
    }).catch(() => {});

    console.log(`[HEARTBEAT_DELAY_RELEASE] device=${device.unique_id} command=${eligible.command_type} configured_delay=${configuredDelay}s actual_delay=${(actualDelayMs/1000).toFixed(1)}s sent_to_traccar=true`);
    return 1;
  } catch (err) {
    await base44.asServiceRole.entities.TelematicsCommand.update(eligible.id, {
      queue_status: 'failed',
      status: 'failed',
      failure_reason: `Heartbeat-delay release failed: ${err.message}`,
      failed_at: now.toISOString()
    }).catch(() => {});
  }
  return 0;
}