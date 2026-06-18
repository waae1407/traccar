import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Noran MT20 Backup Command Release Scheduler ──
// BACKUP ONLY - Primary release is handled by webhookLightLogForwarder
// Only releases commands where webhook failed to release after delay complete
// Uses centralized releaseNoranQueuedCommandToTraccar helper for idempotency

const PROVIDER_KEY = 'traccar_noran_mt20';
const HEARTBEAT_EXPIRATION_SECONDS = 90;
const STARTER_COMMANDS = ['disable_starter', 'restore_starter'];

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

    console.log(`[SCHEDULER_ENTRY] running_backup_release_check now=${nowIso}`);

    // BACKUP ONLY: Find commands where webhook failed to release
    // Only release commands where:
    // - queue_status = waiting_for_delay (already matched heartbeat)
    // - matched_heartbeat_at is not null
    // - delay_complete_at <= now
    // - sent_to_traccar_at is null (not already sent)
    // - status is not acknowledged/completed
    
    const waitingCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({
      provider_key: PROVIDER_KEY,
      queue_status: 'waiting_for_delay'
    }, '-created_date', 50);

    if (waitingCommands.length === 0) {
      console.log(`[SCHEDULER_NO_PENDING] waiting_for_delay_count=0`);
      return Response.json({ ok: true, processed: 0, waiting: 0, released: 0, expired: 0, message: 'No commands waiting for delay' });
    }

    const results = { processed: 0, waiting: 0, released: 0, expired: 0, details: [] };

    for (const command of waitingCommands) {
      try {
        const requestedAt = new Date(command.requested_at || command.created_at || command.created_date || now).getTime();
        const elapsedSeconds = Math.floor((nowMs - requestedAt) / 1000);

        // Check expiration (90 seconds without heartbeat)
        // CRITICAL: Do not expire if heartbeat_received_at exists (heartbeat arrived but release failed)
        if (elapsedSeconds > HEARTBEAT_EXPIRATION_SECONDS && !command.heartbeat_received_at) {
          await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
            status: 'expired_no_heartbeat',
            queue_status: 'expired_no_heartbeat',
            confirmation_status: 'expired',
            failed_at: nowIso,
            failure_reason: `Command expired after ${elapsedSeconds}s without heartbeat (max: ${HEARTBEAT_EXPIRATION_SECONDS}s)`
          });
          results.expired++;
          results.details.push({ command_id: command.id, action: 'expired', elapsed_seconds: elapsedSeconds });
          continue;
        }
        
        // Mark commands that expired due to dispatch bug (heartbeat arrived but not released)
        if (elapsedSeconds > HEARTBEAT_EXPIRATION_SECONDS && command.heartbeat_received_at) {
          await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
            failure_reason: 'expired_due_to_dispatch_bug - heartbeat arrived but command not released'
          });
          results.details.push({ command_id: command.id, action: 'marked_dispatch_bug', heartbeat_received_at: command.heartbeat_received_at });
        }

        // Get device - CRITICAL: Verify device exists and matches command
        const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: command.telematics_device_id });
        const device = devices[0];
        if (!device) {
          console.log(`[SCHEDULER_SKIP] command_id=${command.id} reason=device_not_found telematics_device_id=${command.telematics_device_id}`);
          results.details.push({ command_id: command.id, action: 'device_not_found', telematics_device_id: command.telematics_device_id });
          continue;
        }

        // ── CRITICAL DEVICE MATCH GUARD: Verify command.device_unique_id matches device.unique_id ──
        const deviceMatch = command.device_unique_id === device.unique_id || command.telematics_device_id === device.id;
        if (!deviceMatch) {
          console.log(`[SCHEDULER_SKIP_DEVICE_MISMATCH] command_id=${command.id} command_device_unique_id=${command.device_unique_id} device_unique_id=${device.unique_id} reason=cross_device_heartbeat_release_blocked`);
          // Create security event for cross-device release attempt
          await base44.asServiceRole.entities.TelematicsEvent.create({
            company_id: device.company_id || '',
            telematics_device_id: device.id,
            provider_key: PROVIDER_KEY,
            vehicle_id: device.vehicle_id || '',
            event_type: 'cross_device_heartbeat_release_blocked',
            source: 'scheduler',
            raw_payload: {
              command_id: command.id,
              command_device_unique_id: command.device_unique_id,
              heartbeat_device_unique_id: device.unique_id,
              reason: 'Scheduler detected cross-device heartbeat release attempt'
            },
            created_at: nowIso
          }).catch(() => {});
          results.details.push({ command_id: command.id, action: 'cross_device_release_blocked', command_device: command.device_unique_id, heartbeat_device: device.unique_id });
          continue;
        }

        // Check if delay period complete
        const delayCompleteAt = command.delay_complete_at ? new Date(command.delay_complete_at).getTime() : null;
        if (!delayCompleteAt || nowMs < delayCompleteAt) {
          // Delay not complete yet - skip (webhook will handle)
          results.waiting++;
          results.details.push({ command_id: command.id, action: 'waiting_for_delay', delay_complete_at: command.delay_complete_at });
          continue;
        }

        // Check if already sent (idempotency check)
        if (command.sent_to_traccar_at || ['acknowledged', 'executed', 'completed'].includes(command.status || '')) {
          results.details.push({ command_id: command.id, action: 'already_sent', status: command.status });
          continue;
        }

        // Safety: block starter commands without approval
        if (STARTER_COMMANDS.includes(command.command_type)) {
          const payload = command.request_payload || {};
          if (!(payload.starter_confirmation === true || payload.confirm_starter_command === true)) {
            results.details.push({ command_id: command.id, action: 'blocked_starter', reason: 'no_confirmation' });
            continue;
          }
        }

        // BACKUP RELEASE: Use centralized helper with scheduler context
        results.processed++;
        
        // Import and call centralized release helper
        const { releaseNoranQueuedCommandToTraccar } = await import('file:///app/src/functions/releaseNoranQueuedCommandToTraccar.js');
        console.log(`[SCHEDULER_CALLING_RELEASE] command_id=${command.id} device_unique_id=${device.unique_id} source=noranHeartbeatReleaseScheduler`);
        const releaseResult = await releaseNoranQueuedCommandToTraccar(base44, command.id, {
          source: 'noranHeartbeatReleaseScheduler',
          triggeredBy: 'scheduler_backup',
          reason: 'Webhook failed to release after delay complete (backup release)',
          heartbeatMatchedAt: command.heartbeat_matched_at || command.heartbeat_received_at,
          expectedReleaseAt: command.delay_complete_at,
          matched_heartbeat_device_unique_id: device.unique_id,
          matched_heartbeat_event_id: command.matched_heartbeat_event_id || null,
          release_device_match_verified: true
        });
        
        if (releaseResult.released) {
          results.released++;
          results.details.push({
            command_id: command.id,
            action: 'released',
            traccar_command_id: releaseResult.traccar_command_id,
            actual_delay_seconds: releaseResult.actual_delay_seconds,
            matched_heartbeat_device_unique_id: device.unique_id
          });
          console.log(`[SCHEDULER_BACKUP_RELEASE] command_id=${command.id} command_type=${command.command_type} traccar_command_id=${releaseResult.traccar_command_id} device_unique_id=${device.unique_id}`);
        } else {
          results.details.push({ command_id: command.id, action: 'release_failed', reason: releaseResult.reason });
        }

      } catch (error) {
        console.error('[SCHEDULER_BACKUP] Error:', command.id, error.message);
        results.details.push({ command_id: command.id, action: 'error', error: error.message });
      }
    }

    console.log(`[SCHEDULER_COMPLETE] processed=${results.processed} released=${results.released} waiting=${results.waiting} expired=${results.expired}`);
    return Response.json({ ok: true, ...results, timestamp: nowIso });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});