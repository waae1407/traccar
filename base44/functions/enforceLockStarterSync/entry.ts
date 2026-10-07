import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

/**
 * enforceLockStarterSync — Auto-disable starter when doors lock, restore when doors unlock.
 *
 * Triggered by webhookLightLogForwarder when a 0x8009 packet reports a lock_state change
 * (Bluetooth, key fob, or app command). Payment enforcement takes absolute priority:
 * a past-due/suspended subscription keeps the starter disabled regardless of lock state.
 *
 * Safety guards:
 *   - Ignition ON  → skip (never kill starter mid-drive)
 *   - Subscription past_due/cancelled → skip restore (payment enforcement holds)
 *   - Starter already in desired state → no-op (avoid redundant commands)
 */

const SUSPENDED_SUB_STATES = ['past_due', 'cancelled', 'unpaid', 'control_disabled', 'deactivated'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { device_id, lock_state } = await req.json();

    if (!device_id || !lock_state) {
      return Response.json({ error: 'device_id and lock_state are required' }, { status: 400 });
    }

    // 1. Load device
    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: device_id });
    const device = devices[0];
    if (!device) return Response.json({ error: 'Device not found' }, { status: 404 });

    // 2. Check if feature is enabled
    if (!device.lock_starter_sync_enabled) {
      return Response.json({ ok: true, action: 'disabled', reason: 'Lock-starter sync not enabled for this device' });
    }

    // 3. Don't kill starter while engine is running
    if (device.ignition_status === 'on') {
      return Response.json({ ok: true, action: 'skipped', reason: 'Ignition ON — starter kill skipped to avoid mid-drive shutdown' });
    }

    // 4. Check subscription — payment enforcement takes priority
    const subs = await base44.asServiceRole.entities.GPSSubscription.filter({ device_id: device.id }, '-created_date', 1);
    const sub = subs[0];
    const subscriptionSuspended = sub && SUSPENDED_SUB_STATES.includes(sub.subscription_status);

    // 5. Check current starter state
    const starterDisabled = device.starter_disabled;

    // 6. Decide and act
    if (lock_state === 'locked' && !starterDisabled) {
      // Lock detected → disable starter (anti-theft)
      await base44.asServiceRole.functions.invoke('sendTelematicsCommand', {
        telematics_device_id: device.id,
        command_type: 'disable_starter',
        source: 'enforceLockStarterSync',
        service_context: 'lock_state_enforcement',
        reason: 'Auto-kill: vehicle doors locked',
        confirm_starter_command: true,
      }).catch(e => console.error('[enforceLockStarterSync] disable_starter failed:', e.message));

      return Response.json({ ok: true, action: 'disable_starter', reason: 'Vehicle locked — starter disabled' });
    }

    if (lock_state === 'unlocked' && starterDisabled) {
      // Unlock detected → restore starter, BUT only if payment is current
      if (subscriptionSuspended) {
        return Response.json({ ok: true, action: 'skipped', reason: `Subscription ${sub.subscription_status} — payment enforcement holds starter disabled` });
      }

      await base44.asServiceRole.functions.invoke('sendTelematicsCommand', {
        telematics_device_id: device.id,
        command_type: 'restore_starter',
        source: 'enforceLockStarterSync',
        service_context: 'lock_state_enforcement',
        reason: 'Auto-restore: vehicle doors unlocked',
        confirm_starter_command: true,
      }).catch(e => console.error('[enforceLockStarterSync] restore_starter failed:', e.message));

      return Response.json({ ok: true, action: 'restore_starter', reason: 'Vehicle unlocked — starter restored' });
    }

    // No change needed
    return Response.json({
      ok: true,
      action: 'no_change',
      reason: `Lock state "${lock_state}" — starter already ${starterDisabled ? 'disabled' : 'enabled'}`,
    });
  } catch (error) {
    console.error('[enforceLockStarterSync] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});