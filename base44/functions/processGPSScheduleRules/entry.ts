import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

/**
 * processGPSScheduleRules — Scheduled auto-command executor for GPS-only customers.
 *
 * For each active GPSScheduleRule:
 *   - daily_time: if current time matches trigger_time (within 1-min window) and day-of-week matches → execute command
 *   - parked_duration: if device has been parked for >= trigger_parked_minutes → execute command
 *   - sunset: (simplified) if current hour is 18-19 → execute command
 *
 * Commands: lock, unlock, disable_starter, restore_starter, alarm_pulse
 *
 * Triggered by: cron every 1-5 minutes (CRON_SECRET) or admin.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const cronSecret = url.searchParams.get('secret');
    const isCron = cronSecret === Deno.env.get('CRON_SECRET');

    if (!isCron) {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDay = now.getDay();
    const results = { checked: 0, triggered: 0, errors: [] };

    // Get all active schedule rules
    const rules = await base44.asServiceRole.entities.GPSScheduleRule.filter({
      is_active: true,
    }, '-created_date', 500);

    results.checked = rules.length;

    for (const rule of rules) {
      try {
        // Skip if already triggered in the last 2 minutes (prevents duplicate execution)
        if (rule.last_triggered_at) {
          const minsSinceTrigger = (now.getTime() - new Date(rule.last_triggered_at).getTime()) / 60000;
          if (minsSinceTrigger < 2) continue;
        }

        // Check day-of-week filter
        if (rule.active_days && rule.active_days.length > 0 && !rule.active_days.includes(currentDay)) continue;

        let shouldTrigger = false;

        if (rule.trigger_type === 'daily_time') {
          if (!rule.trigger_time) continue;
          const [triggerHr, triggerMin] = rule.trigger_time.split(':').map(Number);
          // Trigger within 1-minute window
          if (currentHour === triggerHr && Math.abs(currentMinute - triggerMin) <= 1) {
            shouldTrigger = true;
          }
        } else if (rule.trigger_type === 'parked_duration') {
          // Get device to check parked duration
          const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: rule.telematics_device_id }, '-created_date', 1);
          const device = devices[0];
          if (!device || !device.controls_enabled) continue;

          if (device.parked_at && (device.speed === 0 || device.ignition_status === 'off')) {
            const parkedMins = (now.getTime() - new Date(device.parked_at).getTime()) / 60000;
            if (parkedMins >= (rule.trigger_parked_minutes || 30)) {
              shouldTrigger = true;
            }
          }
        } else if (rule.trigger_type === 'sunset') {
          // Simplified: trigger at 18:00 (sunset approximation)
          if (currentHour === 18 && currentMinute <= 1) {
            shouldTrigger = true;
          }
        }

        if (!shouldTrigger) continue;

        // ── Execute the command ──
        const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: rule.telematics_device_id }, '-created_date', 1);
        const device = devices[0];
        if (!device || !device.controls_enabled) continue;

        try {
          await base44.asServiceRole.functions.invoke('sendTelematicsCommand', {
            telematics_device_id: device.id,
            vehicle_id: device.vehicle_id || '',
            command_type: rule.command_type,
            source: 'gps_schedule_rule',
            reason: `Scheduled: ${rule.rule_name}`,
            confirm_starter_command: rule.command_type === 'disable_starter' || rule.command_type === 'restore_starter',
          });
          results.triggered++;
        } catch (e) {
          results.errors.push(`Rule ${rule.id} command: ${e.message}`);
        }

        // Update last triggered
        await base44.asServiceRole.entities.GPSScheduleRule.update(rule.id, {
          last_triggered_at: now.toISOString(),
          trigger_count: (rule.trigger_count || 0) + 1,
        });

        // Notify owner
        try {
          await base44.asServiceRole.functions.invoke('routePlatformNotification', {
            event_type: 'gps_schedule_executed',
            severity: 'info',
            category: 'system',
            title: `Scheduled command executed: ${rule.rule_name}`,
            message: `Your scheduled "${rule.rule_name}" rule executed the ${rule.command_type.replace(/_/g, ' ')} command.`,
            customer_id: rule.customer_email,
            action_url: '/customer/gps',
            metadata: { rule_id: rule.id, command_type: rule.command_type },
            source_function: 'processGPSScheduleRules',
          });
        } catch (e) {
          results.errors.push(`Rule ${rule.id} notification: ${e.message}`);
        }
      } catch (e) {
        results.errors.push(`Rule ${rule.id}: ${e.message}`);
      }
    }

    return Response.json({ ok: true, ...results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});