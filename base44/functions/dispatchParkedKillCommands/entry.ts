import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

/**
 * dispatchParkedKillCommands — Dispatches starter-kill commands that were parked
 * because the vehicle was moving when the kill was first attempted.
 *
 * For each TelematicsCommand with queue_status='parked_pending_stop':
 *   1. Load the device. If speed === 0 → dispatch the kill via sendTelematicsCommand
 *      with bypass_safety_guard=true (we already verified it's stopped).
 *   2. If parked_expires_at has passed → mark as expired.
 *   3. If the linked booking has transitioned to a non-active state → cancel.
 *
 * Triggered by: scheduled workflow every 2 minutes.
 */

const PARKED_TTL_MINUTES = 15;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const results = { dispatched: 0, expired: 0, cancelled: 0, still_moving: 0, errors: [] };

    // Find all parked-pending-stop commands
    const parkedCommands = await base44.asServiceRole.entities.TelematicsCommand.filter({
      queue_status: 'parked_pending_stop',
      command_type: 'disable_starter',
    }, '-created_date', 100);

    for (const cmd of parkedCommands) {
      try {
        // 1. Check TTL expiry
        if (cmd.parked_expires_at && new Date(cmd.parked_expires_at).getTime() <= now.getTime()) {
          await base44.asServiceRole.entities.TelematicsCommand.update(cmd.id, {
            queue_status: 'expired',
            status: 'expired',
            confirmation_status: 'expired',
            failure_reason: 'Parked kill TTL expired — vehicle did not stop within 15 minutes.',
            failed_at: now.toISOString(),
          });
          results.expired++;
          continue;
        }

        // 2. Load device
        const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: cmd.telematics_device_id }, '-created_date', 1);
        const device = devices[0];
        if (!device) {
          await base44.asServiceRole.entities.TelematicsCommand.update(cmd.id, {
            queue_status: 'failed',
            status: 'failed',
            confirmation_status: 'failed',
            failure_reason: 'Device not found during parked-kill dispatch.',
            failed_at: now.toISOString(),
          });
          results.errors.push(`Device not found for command ${cmd.id}`);
          continue;
        }

        // 3. Check if vehicle has stopped
        const speed = Number(device.speed) || 0;
        if (speed > 0) {
          results.still_moving++;
          continue;
        }

        // 4. Check booking hasn't transitioned (for rental devices)
        if (cmd.booking_id) {
          const bookings = await base44.asServiceRole.entities.BookingRequest.filter({ id: cmd.booking_id }, '-created_date', 1);
          const booking = bookings[0];
          if (booking && ['cancelled', 'completed', 'suspended'].includes(booking.booking_status)) {
            await base44.asServiceRole.entities.TelematicsCommand.update(cmd.id, {
              queue_status: 'expired',
              status: 'expired',
              confirmation_status: 'expired',
              failure_reason: `Booking transitioned to ${booking.booking_status} — parked kill cancelled.`,
              failed_at: now.toISOString(),
            });
            results.cancelled++;
            continue;
          }
        }

        // 5. Vehicle is stopped — dispatch the kill
        await base44.asServiceRole.functions.invoke('sendTelematicsCommand', {
          telematics_device_id: device.id,
          vehicle_id: cmd.vehicle_id || '',
          booking_id: cmd.booking_id || '',
          command_type: 'disable_starter',
          source: 'dispatchParkedKillCommands',
          service_context: 'parked_kill_dispatch',
          reason: cmd.request_payload?.reason || 'Parked kill: vehicle has stopped',
          confirm_starter_command: true,
          bypass_safety_guard: true,
        });

        // Mark the parked command as dispatched
        await base44.asServiceRole.entities.TelematicsCommand.update(cmd.id, {
          queue_status: 'sent',
          status: 'sent',
          confirmation_status: 'sent',
          sent_at: now.toISOString(),
          failure_reason: null,
        });

        results.dispatched++;
      } catch (e) {
        results.errors.push(`Command ${cmd.id}: ${e.message}`);
      }
    }

    console.log(`[dispatchParkedKillCommands] ${JSON.stringify(results)}`);
    return Response.json({ ok: true, ...results });
  } catch (error) {
    console.error('[dispatchParkedKillCommands] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});