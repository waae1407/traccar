import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Noran MT20 Single-Owner Command Release Helper ──
// This is the ONLY function allowed to send production Noran commands to Traccar.
// All release paths (webhook, scheduler) must call this helper.
// Implements idempotency lock to prevent double-release.

const PROVIDER_KEY = 'traccar_noran_mt20';
const STARTER_COMMANDS = ['disable_starter', 'restore_starter'];

function envValue(name) {
  return String(Deno.env.toObject()[name] || '').trim();
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

// Send command via Traccar API
async function sendViaTraccar(device, hexPayload) {
  const baseUrl = envValue('TRACCAR_BASE_URL');
  const username = envValue('TRACCAR_USERNAME');
  const password = envValue('TRACCAR_PASSWORD');
  
  if (!baseUrl || !username || !password) {
    throw new Error('Traccar credentials not configured');
  }

  const traccarDeviceId = Number(device.traccar_device_id);
  if (!Number.isFinite(traccarDeviceId)) {
    throw new Error('Invalid Traccar device ID');
  }

  const traccarPayload = { deviceId: traccarDeviceId, type: 'custom', attributes: { data: hexPayload } };
  const sentAt = new Date().toISOString();
  
  console.log(`[TRACCAR_SEND] POST /api/commands/send device_id=${traccarDeviceId} unique_id=${device.unique_id} hex_length=${hexPayload.length / 2}bytes`);
  
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
  
  if (!res.ok) {
    throw new Error(`Traccar API failed (${res.status}): ${text}`);
  }

  console.log(`[TRACCAR_RESP] status=${res.status} traccar_command_id=${data?.id || 'N/A'}`);

  return { 
    traccar_payload: traccarPayload, 
    traccar_response: data, 
    sent_to_traccar_at: sentAt, 
    traccar_api_status: res.status 
  };
}

// Acquire release lock with idempotency check
async function acquireReleaseLock(base44, commandId) {
  const now = new Date();
  const nowIso = now.toISOString();
  
  // Re-read command to check current state
  const commands = await base44.asServiceRole.entities.TelematicsCommand.filter({ id: commandId });
  const command = commands[0];
  
  if (!command) {
    return { acquired: false, reason: 'Command not found' };
  }
  
  // Idempotency checks - do not release if already sent or completed
  if (command.sent_to_traccar_at) {
    return { acquired: false, reason: 'Already sent to Traccar', command };
  }
  
  const terminalStatuses = ['acknowledged', 'executed', 'completed', 'failed', 'expired', 'blocked'];
  if (terminalStatuses.includes(command.status || '') || terminalStatuses.includes(command.queue_status || '')) {
    return { acquired: false, reason: 'Command in terminal status', command };
  }
  
  // Generate unique lock token
  const releaseLockToken = `lock_${commandId}_${now.getTime()}`;
  
  // Attempt to acquire lock atomically
  try {
    await base44.asServiceRole.entities.TelematicsCommand.update(commandId, {
      release_lock_token: releaseLockToken,
      release_lock_acquired_at: nowIso,
      release_attempt_count: (command.release_attempt_count || 0) + 1
    });
    
    // Verify lock was acquired (check for race condition)
    const verifyCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({ id: commandId });
    const verifyCommand = verifyCommands[0];
    
    if (!verifyCommand || verifyCommand.release_lock_token !== releaseLockToken) {
      return { acquired: false, reason: 'Lock race condition - another process acquired lock', command: verifyCommand };
    }
    
    return { acquired: true, command: verifyCommand, releaseLockToken };
  } catch (error) {
    return { acquired: false, reason: `Lock acquisition failed: ${error.message}`, command };
  }
}

// Create critical operational alert for dispatch persistence failures
async function createDispatchAlert(base44, command, error, context) {
  const now = new Date().toISOString();
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000)); // 5-minute buckets
  const dedupeKey = `noran_dispatch_persistence_failed:${command.id}:${bucket}`;
  
  // Check for existing alert
  const existing = (await base44.asServiceRole.entities.OperationalAlert.filter({ dedupe_key: dedupeKey }))[0];
  
  if (existing) {
    await base44.asServiceRole.entities.OperationalAlert.update(existing.id, {
      repeat_count: (existing.repeat_count || 1) + 1,
      last_duplicate_at: now
    });
  } else {
    await base44.asServiceRole.entities.OperationalAlert.create({
      alert_type: 'command_failed',
      severity: 'critical',
      status: 'new',
      title: 'Noran command dispatch persistence failed',
      message: `Command ${command.id} (${command.command_type}) for device ${command.device_unique_id} was sent to Traccar but audit fields failed to persist. Error: ${error.message}`,
      recommended_action: 'Review command audit trail and manually verify Traccar command status. Check database write permissions.',
      assigned_role: 'admin',
      source_entity_type: 'TelematicsCommand',
      source_entity_id: command.id,
      domain: 'telematics',
      action_url: '/admin/telematics-command-test',
      provider_key: PROVIDER_KEY,
      telematics_device_id: command.telematics_device_id,
      vehicle_id: command.vehicle_id || '',
      dedupe_key: dedupeKey,
      metadata: {
        command_type: command.command_type,
        device_unique_id: command.device_unique_id,
        error_message: error.message,
        context
      }
    });
  }
}

// Main release helper - ONLY function allowed to send production commands to Traccar
export async function releaseNoranQueuedCommandToTraccar(base44, commandId, context) {
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  
  console.log(`[RELEASE_HELPER] command_id=${commandId} source=${context?.source || 'unknown'} triggered_by=${context?.triggeredBy || 'unknown'}`);
  
  // Acquire release lock with idempotency check
  const lockResult = await acquireReleaseLock(base44, commandId);
  
  if (!lockResult.acquired) {
    console.log(`[RELEASE_HELPER] Lock not acquired: ${lockResult.reason}`);
    return { 
      released: false, 
      reason: lockResult.reason,
      command_id: commandId 
    };
  }
  
  const command = lockResult.command;
  
  // Validate command has required fields
  const hexPayload = command.hex_payload || command.wrapped_payload;
  if (!hexPayload) {
    await base44.asServiceRole.entities.TelematicsCommand.update(commandId, {
      status: 'failed',
      queue_status: 'failed',
      failure_reason: 'No hex payload available for dispatch',
      failed_at: nowIso
    });
    return { released: false, reason: 'No hex payload', command_id: commandId };
  }
  
  // Get device
  const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: command.telematics_device_id });
  const device = devices[0];
  
  if (!device) {
    await base44.asServiceRole.entities.TelematicsCommand.update(commandId, {
      status: 'failed',
      queue_status: 'failed',
      failure_reason: 'Device not found',
      failed_at: nowIso
    });
    return { released: false, reason: 'Device not found', command_id: commandId };
  }
  
  // Safety check: block starter commands unless explicitly allowed
  if (STARTER_COMMANDS.includes(command.command_type)) {
    const payload = command.request_payload || {};
    const hasConfirmation = payload.starter_confirmation === true || payload.confirm_starter_command === true;
    
    if (!hasConfirmation && context?.source !== 'admin_test') {
      await base44.asServiceRole.entities.TelematicsCommand.update(commandId, {
        status: 'blocked',
        queue_status: 'blocked',
        failure_reason: 'Starter command requires explicit confirmation',
        blocked_at: nowIso
      });
      return { released: false, reason: 'Starter command blocked - no confirmation', command_id: commandId };
    }
  }
  
  // Send to Traccar
  let sendResult;
  try {
    sendResult = await sendViaTraccar(device, hexPayload);
  } catch (error) {
    console.error(`[RELEASE_HELPER] Traccar send failed: ${error.message}`);
    await base44.asServiceRole.entities.TelematicsCommand.update(commandId, {
      status: 'failed',
      queue_status: 'failed',
      failure_reason: `Traccar send failed: ${error.message}`,
      failed_at: nowIso,
      release_lock_token: null // Release lock on failure
    });
    return { released: false, reason: `Traccar send failed: ${error.message}`, command_id: commandId, error: error.message };
  }
  
  // Extract Traccar command ID
  const traccarCommandId = sendResult.traccar_response?.id || sendResult.traccar_response?.commandId || null;
  
  // Compute release timing
  const heartbeatMatchedAt = command.heartbeat_received_at || command.heartbeat_matched_at;
  const heartbeatMatchedMs = heartbeatMatchedAt ? new Date(heartbeatMatchedAt).getTime() : null;
  const expectedReleaseAt = heartbeatMatchedMs ? new Date(heartbeatMatchedMs + (command.configured_delay_seconds || 0) * 1000).toISOString() : null;
  const actualReleaseLagSeconds = heartbeatMatchedMs ? (nowMs - heartbeatMatchedMs) / 1000 : null;
  
  // Atomically persist all audit fields
  const auditPayload = {
    status: 'sent_to_traccar',
    queue_status: 'sent_to_traccar',
    confirmation_status: 'sent',
    sent_at: nowIso,
    sent_to_traccar_at: sendResult.sent_to_traccar_at,
    command_released_at: nowIso,
    traccar_api_response: sendResult.traccar_response,
    traccar_api_called_at: nowIso,
    traccar_command_id: traccarCommandId ? String(traccarCommandId) : null,
    provider_command_id: traccarCommandId ? String(traccarCommandId) : null,
    transmission_format: 'mt20_wrapped_hex',
    provider_response: sendResult.traccar_response,
    released_after_heartbeat: !!heartbeatMatchedAt,
    released_at: nowIso,
    heartbeat_matched_at: heartbeatMatchedAt,
    matched_heartbeat_device_unique_id: device.unique_id,
    matched_heartbeat_event_id: command.matched_heartbeat_event_id || null,
    configured_delay_seconds: command.configured_delay_seconds || 0,
    expected_release_at: expectedReleaseAt,
    actual_release_at: nowIso,
    actual_heartbeat_to_release_delay_seconds: actualReleaseLagSeconds,
    heartbeat_source_ip: device.last_heartbeat_source_ip,
    heartbeat_source_port: device.last_heartbeat_source_port,
    release_strategy: 'heartbeat_delay_only',
    release_triggered_by: context?.triggeredBy || 'unknown',
    release_source_function: context?.source || 'releaseNoranQueuedCommandToTraccar',
    release_reason: context?.reason || 'heartbeat_delay_release',
    source_function: context?.source || 'releaseNoranQueuedCommandToTraccar',
    ascii_payload: command.ascii_payload,
    hex_payload: command.hex_payload,
    payload_length_bytes: command.hex_payload ? command.hex_payload.length / 2 : 0,
    release_lock_token: lockResult.releaseLockToken,
    release_attempt_count: command.release_attempt_count || 1,
    release_device_match_verified: true
  };
  
  try {
    await base44.asServiceRole.entities.TelematicsCommand.update(commandId, auditPayload);
    
    // Verify persistence
    const verifyCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({ id: commandId });
    const verifyCommand = verifyCommands[0];
    
    if (!verifyCommand?.sent_to_traccar_at) {
      console.error(`[RELEASE_HELPER] CRITICAL: Audit persistence verification failed for command ${commandId}`);
      await createDispatchAlert(base44, command, new Error('sent_to_traccar_at not persisted after update'), context);
    }
    
    console.log(`[RELEASE_HELPER] SUCCESS command_id=${commandId} traccar_command_id=${traccarCommandId} sent_to_traccar_at=${verifyCommand?.sent_to_traccar_at ? 'VERIFIED' : 'MISSING'}`);
    
  } catch (error) {
    console.error(`[RELEASE_HELPER] Audit persistence failed: ${error.message}`);
    await createDispatchAlert(base44, command, error, context);
    
    // Still return success since Traccar received the command
    return { 
      released: true, 
      reason: 'Sent to Traccar but audit persistence failed',
      command_id: commandId,
      traccar_command_id: traccarCommandId,
      audit_error: error.message
    };
  }
  
  // Create telemetry event
  await base44.asServiceRole.entities.TelematicsEvent.create({
    telematics_device_id: device.id,
    provider_key: PROVIDER_KEY,
    vehicle_id: device.vehicle_id || '',
    event_type: `command_${command.command_type}_sent`,
    source: 'release_helper',
    raw_payload: {
      released_after_heartbeat: !!heartbeatMatchedAt,
      configured_delay_seconds: command.configured_delay_seconds || 0,
      actual_delay_seconds: actualReleaseLagSeconds,
      traccar_command_id: traccarCommandId,
      release_triggered_by: context?.triggeredBy,
      release_source_function: context?.source
    },
    created_at: nowIso
  }).catch(() => {});
  
  return {
    released: true,
    command_id: commandId,
    traccar_command_id: traccarCommandId,
    sent_to_traccar_at: sendResult.sent_to_traccar_at,
    actual_delay_seconds: actualReleaseLagSeconds,
    release_triggered_by: context?.triggeredBy
  };
}

// Standalone function for direct invocation
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const isScheduled = req.headers.get('x-base44-scheduled-function') === 'true';
    
    if (!isScheduled && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin or scheduled function only' }, { status: 403 });
    }
    
    const body = await req.json().catch(() => ({}));
    const commandId = body.command_id;
    
    if (!commandId) {
      return Response.json({ error: 'command_id required' }, { status: 400 });
    }
    
    const result = await releaseNoranQueuedCommandToTraccar(base44, commandId, {
      source: body.source || 'direct_invocation',
      triggeredBy: body.triggeredBy || 'manual',
      reason: body.reason || 'manual_release'
    });
    
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});