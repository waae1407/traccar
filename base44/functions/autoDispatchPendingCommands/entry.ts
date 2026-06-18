const PROVIDER_KEY = 'traccar_noran_mt20';
const NORAN_HEARTBEAT_EXPIRY_SECONDS = 90;
const STARTER_COMMANDS = ['disable_starter', 'restore_starter'];

function isStarterCommand(commandType) {
  return STARTER_COMMANDS.includes(commandType);
}

/**
 * Auto-dispatch pending Noran MT20 commands on heartbeat.
 * Called by webhookLightLogForwarder when a heartbeat packet is received.
 * 
 * @param {Object} base44 - Base44 SDK client
 * @param {Object} device - TelematicsDevice record
 * @param {string} heartbeatTimestamp - ISO timestamp of heartbeat
 * @param {string} heartbeatEventId - TelematicsEvent ID for this heartbeat
 * @returns {Object} Release evaluation results
 */
export async function autoDispatchPendingCommands(base44, device, heartbeatTimestamp, heartbeatEventId) {
  // ── HARD DEBUG: Entry point ──
  console.log(`[AUTO_DISPATCH_ENTRY] device_unique_id=${device.unique_id || 'UNKNOWN'} internal_device_id=${device.id} heartbeat_event_id=${heartbeatEventId || 'N/A'} heartbeat_received_at=${heartbeatTimestamp}`);
  
  if (!device?.id || !heartbeatTimestamp) {
    console.log(`[AUTO_DISPATCH_SKIP] device_id=${device?.id || 'MISSING'} heartbeatTimestamp=${heartbeatTimestamp || 'MISSING'}`);
    return { released: 0, evaluated: [], waiting: [], skipped: [], pending: 0 };
  }

  const now = new Date();
  const nowMs = Date.now();
  const nowIso = now.toISOString();
  const expiryCutoff = new Date(nowMs - NORAN_HEARTBEAT_EXPIRY_SECONDS * 1000).toISOString();
  const configuredDelay = device.post_heartbeat_release_delay_seconds ?? 0;

  // ── HARD DEBUG: Query filters ──
  console.log(`[AUTO_DISPATCH_QUERY] telematics_device_id=${device.id} queue_status=['pending_waiting_for_next_heartbeat','waiting_for_delay'] expiryCutoff=${expiryCutoff}`);

  // ── CRITICAL DEVICE MATCH GUARD: Only process commands for THIS exact device ──
  console.log(`[AUTO_DISPATCH_DEVICE_GUARD] heartbeat_device_unique_id=${device.unique_id} heartbeat_device_id=${device.id}`);

  // Find ALL pending commands for this device
  const pendingCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({
    telematics_device_id: device.id,
    provider_key: PROVIDER_KEY
  }, '-created_date', 50).catch((err) => {
    console.error(`[AUTO_DISPATCH_QUERY_FAILED] device_id=${device.id} error=${err.message}`);
    return [];
  });

  // Filter in-memory to catch commands that may have status in either field
  // ── CRITICAL: Also verify device_unique_id matches to prevent cross-device release ──
  const filteredCommands = pendingCommands.filter(cmd => {
    const statusField = cmd.queue_status || cmd.status;
    const hasCorrectStatus = ['pending_waiting_for_next_heartbeat', 'waiting_for_delay'].includes(statusField);
    const hasCorrectDevice = cmd.telematics_device_id === device.id || cmd.device_unique_id === device.unique_id;
    return hasCorrectStatus && hasCorrectDevice;
  });

  console.log(`[AUTO_DISPATCH_FOUND] total_queried=${pendingCommands.length} filtered_pending=${filteredCommands.length}`);

  const result = { released: 0, evaluated: [], waiting: [], skipped: [], pending: filteredCommands.length };

  if (filteredCommands.length === 0) {
    console.log(`[AUTO_DISPATCH_NO_PENDING] device_unique_id=${device.unique_id || device.id} pending_command_count=0`);
    return result;
  }

  // Process each command
  for (const cmd of filteredCommands) {
    const createdAt = cmd.created_at || cmd.created_date || '';
    const createdAtMs = new Date(createdAt).getTime();
    const heartbeatForCommand = cmd.heartbeat_received_at || heartbeatTimestamp;
    const heartbeatForCommandMs = new Date(heartbeatForCommand).getTime();
    
    // ── HARD DEBUG: Per-command state ──
    const cmdDeviceMatch = cmd.telematics_device_id === device.id || cmd.device_unique_id === device.unique_id;
    console.log(`[AUTO_DISPATCH_EVAL] command_id=${cmd.id} command_type=${cmd.command_type} queue_status=${cmd.queue_status} status=${cmd.status} device_unique_id=${cmd.device_unique_id} telematics_device_id=${cmd.telematics_device_id} heartbeat_device_unique_id=${device.unique_id} device_match=${cmdDeviceMatch} created_at=${createdAt} heartbeat_received_at=${cmd.heartbeat_received_at || 'NULL'} configured_delay=${cmd.configured_delay_seconds ?? configuredDelay}s`);

    // ── CRITICAL: Skip if device doesn't match (cross-device heartbeat) ──
    if (!cmdDeviceMatch) {
      console.log(`[AUTO_DISPATCH_SKIP_DEVICE_MISMATCH] command_id=${cmd.id} command_device=${cmd.device_unique_id || cmd.telematics_device_id} heartbeat_device=${device.unique_id} reason=heartbeat_from_different_device`);
      result.skipped.push({ command_id: cmd.id, reason: 'device_mismatch', command_device: cmd.device_unique_id, heartbeat_device: device.unique_id });
      continue;
    }

    // Skip expired commands - but ONLY if no heartbeat was received after command creation
    const heartbeatArrivedAfterCreation = cmd.heartbeat_received_at && new Date(cmd.heartbeat_received_at).getTime() > createdAtMs;
    
    if (createdAt && createdAt < expiryCutoff && !heartbeatArrivedAfterCreation) {
      const secondsSinceCreation = (nowMs - createdAtMs) / 1000;
      console.log(`[AUTO_DISPATCH_SKIP_EXPIRED] command_id=${cmd.id} reason=expired_no_heartbeat_after_${NORAN_HEARTBEAT_EXPIRY_SECONDS}s secondsSinceCreation=${secondsSinceCreation.toFixed(1)} heartbeat_received_at=${cmd.heartbeat_received_at || 'NULL'}`);
      await base44.asServiceRole.entities.TelematicsCommand.update(cmd.id, {
        status: 'expired_no_heartbeat', queue_status: 'expired_no_heartbeat',
        confirmation_status: 'expired', failed_at: nowIso,
        failure_reason: 'No heartbeat received within 90 seconds of command creation'
      }).catch(() => {});
      result.skipped.push({ command_id: cmd.id, reason: 'expired_no_heartbeat' });
      continue;
    }

    // Skip starter commands without approval
    if (isStarterCommand(cmd.command_type)) {
      const payload = cmd.request_payload || {};
      if (!(payload.starter_confirmation === true || payload.confirm_starter_command === true)) {
        console.log(`[AUTO_DISPATCH_SKIP_STARTER] command_id=${cmd.id} reason=starter_not_approved`);
        result.skipped.push({ command_id: cmd.id, reason: 'starter_not_approved' });
        continue;
      }
    }

    // Determine heartbeat match time and delay complete time
    const isWaitingForDelay = cmd.queue_status === 'waiting_for_delay';
    const heartbeatMatchedAt = isWaitingForDelay && cmd.heartbeat_received_at
      ? cmd.heartbeat_received_at
      : heartbeatTimestamp;
    
    const heartbeatMatchedMs = new Date(heartbeatMatchedAt).getTime();
    const delayCompleteAt = heartbeatMatchedMs + (configuredDelay * 1000);
    const delayCompleteIso = new Date(delayCompleteAt).toISOString();
    
    // Update command with heartbeat match info if pending (first heartbeat for this command)
    if (!isWaitingForDelay) {
      console.log(`[AUTO_DISPATCH_FIRST_HEARTBEAT] command_id=${cmd.id} heartbeatTimestamp=${heartbeatTimestamp} configuredDelay=${configuredDelay}s delayCompleteAt=${delayCompleteIso}`);
      await base44.asServiceRole.entities.TelematicsCommand.update(cmd.id, {
        heartbeat_received_at: heartbeatTimestamp,
        heartbeat_matched_at: nowIso,
        configured_delay_seconds: configuredDelay,
        delay_complete_at: delayCompleteIso
      }).catch((err) => {
        console.error(`[AUTO_DISPATCH_UPDATE_FAILED] command_id=${cmd.id} error=${err.message}`);
      });
    }

    // Check if delay period complete
    if (nowMs < delayCompleteAt) {
      const secondsRemaining = Math.ceil((delayCompleteAt - nowMs) / 1000);
      if (!isWaitingForDelay) {
        console.log(`[AUTO_DISPATCH_WAITING] command_id=${cmd.id} queue_status=waiting_for_delay seconds_remaining=${secondsRemaining} delayCompleteAt=${delayCompleteIso}`);
        await base44.asServiceRole.entities.TelematicsCommand.update(cmd.id, {
          queue_status: 'waiting_for_delay',
          status: 'waiting_for_delay',
          seconds_until_release: secondsRemaining
        }).catch(() => {});
      } else {
        console.log(`[AUTO_DISPATCH_ALREADY_WAITING] command_id=${cmd.id} seconds_remaining=${secondsRemaining} delayCompleteAt=${delayCompleteIso}`);
      }
      result.waiting.push({ command_id: cmd.id, seconds_remaining, delay_complete_at: delayCompleteIso });
      continue;
    }

    // Delay complete - attempt release through centralized helper
    const secondsAfterDelayComplete = (nowMs - delayCompleteAt) / 1000;
    console.log(`[AUTO_DISPATCH_READY_FOR_RELEASE] command_id=${cmd.id} delayCompleteAt=${delayCompleteIso} now=${nowIso} configuredDelay=${configuredDelay}s secondsAfterDelayComplete=${secondsAfterDelayComplete.toFixed(1)}s calling_release_helper=true matched_heartbeat_device_unique_id=${device.unique_id} matched_heartbeat_event_id=${heartbeatEventId || 'N/A'}`);
    result.evaluated.push({ command_id: cmd.id, ready_for_release: true, delay_complete_at: delayCompleteIso, matched_heartbeat_device: device.unique_id });
    
    try {
      const { releaseNoranQueuedCommandToTraccar } = await import('file:///app/src/functions/releaseNoranQueuedCommandToTraccar.js');
      console.log(`[AUTO_DISPATCH_CALLING_RELEASE] command_id=${cmd.id} source=webhookLightLogForwarder triggeredBy=heartbeat_delay_release matched_heartbeat_event_id=${heartbeatEventId || 'N/A'} expected_release_at=${delayCompleteIso}`);
      const releaseResult = await releaseNoranQueuedCommandToTraccar(base44, cmd.id, {
        source: 'webhookLightLogForwarder',
        triggeredBy: 'heartbeat_delay_release',
        reason: `Delay complete (configured=${configuredDelay}s) - matched_heartbeat=${heartbeatEventId || device.unique_id}`,
        heartbeatMatchedAt,
        expectedReleaseAt: delayCompleteIso
      });
      
      if (releaseResult.released) {
        const actualReleaseAt = new Date().toISOString();
        result.released++;
        console.log(`[AUTO_DISPATCH_RELEASE_SUCCESS] command_id=${cmd.id} traccar_command_id=${releaseResult.traccar_command_id} delay=${releaseResult.actual_delay_seconds}s released=true matched_heartbeat_event_id=${heartbeatEventId || 'N/A'} expected_release_at=${delayCompleteIso} actual_release_at=${actualReleaseAt}`);
        result.released_ids = result.released_ids || [];
        result.released_ids.push(cmd.id);
      } else {
        console.log(`[AUTO_DISPATCH_RELEASE_FAILED] command_id=${cmd.id} reason=${releaseResult.reason || releaseResult.error || 'UNKNOWN'} matched_heartbeat_event_id=${heartbeatEventId || 'N/A'}`);
        result.skipped.push({ command_id: cmd.id, reason: 'release_failed', error: releaseResult.reason || releaseResult.error, matched_heartbeat_event_id: heartbeatEventId });
      }
    } catch (error) {
      console.error(`[AUTO_DISPATCH_RELEASE_ERROR] command_id=${cmd.id} error=${error.message} stack=${error.stack || 'N/A'} matched_heartbeat_event_id=${heartbeatEventId || 'N/A'}`);
      result.skipped.push({ command_id: cmd.id, reason: 'release_error', error: error.message, matched_heartbeat_event_id: heartbeatEventId });
    }
  }

  console.log(`[AUTO_DISPATCH_COMPLETE] device_unique_id=${device.unique_id || device.id} pending=${result.pending} evaluated=${result.evaluated.length} released=${result.released} waiting=${result.waiting.length} skipped=${result.skipped.length}`);
  return result;
}