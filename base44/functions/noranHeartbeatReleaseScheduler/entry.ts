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
      return Response.json({ ok: true, processed: 0, waiting: 0, released: 0, expired: 0, message: 'No commands waiting for delay' });
    }

    const results = { processed: 0, waiting: 0, released: 0, expired: 0, details: [] };

    for (const command of waitingCommands) {
      try {
        const requestedAt = new Date(command.requested_at || command.created_at || command.created_date || now).getTime();
        const elapsedSeconds = Math.floor((nowMs - requestedAt) / 1000);

        // Check expiration (90 seconds without heartbeat)
        if (elapsedSeconds > HEARTBEAT_EXPIRATION_SECONDS) {
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

        // Get device
        const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: command.telematics_device_id });
        const device = devices[0];
        if (!device) {
          results.details.push({ command_id: command.id, action: 'device_not_found' });
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
        const releaseResult = await releaseNoranQueuedCommandToTraccar(base44, command.id, {
          source: 'noranHeartbeatReleaseScheduler',
          triggeredBy: 'scheduler_backup',
          reason: 'Webhook failed to release after delay complete (backup release)',
          heartbeatMatchedAt: command.heartbeat_matched_at || command.heartbeat_received_at,
          expectedReleaseAt: command.delay_complete_at
        });
        
        if (releaseResult.released) {
          results.released++;
          results.details.push({
            command_id: command.id,
            action: 'released',
            traccar_command_id: releaseResult.traccar_command_id,
            actual_delay_seconds: releaseResult.actual_delay_seconds
          });
          console.log(`[SCHEDULER_BACKUP_RELEASE] command_id=${command.id} command_type=${command.command_type} traccar_command_id=${releaseResult.traccar_command_id}`);
        } else {
          results.details.push({ command_id: command.id, action: 'release_failed', reason: releaseResult.reason });
        }

      } catch (error) {
        console.error('[SCHEDULER_BACKUP] Error:', command.id, error.message);
        results.details.push({ command_id: command.id, action: 'error', error: error.message });
      }
    }

    return Response.json({ ok: true, ...results, timestamp: nowIso });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});