import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Runs every 10 seconds via scheduled automation.
// Finds all active TelematicsAlarmSessions and sends the next pulse if interval has elapsed.

const PULSE_INTERVAL_SECONDS = 10;
const MAX_DURATION_SECONDS = 90;
const DEFAULT_MAX_PULSES = 9;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Require admin, scheduler context, or external cron secret
    const user = await base44.auth.me().catch(() => null);
    const isCron = !!(Deno.env.get('CRON_SECRET') && req.headers.get('x-cron-secret') === Deno.env.get('CRON_SECRET'));
    const isScheduled = req.headers.get('x-base44-scheduled-function') === 'true';
    if (!isCron && !isScheduled && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: cron-secret, scheduled, or admin required' }, { status: 403 });
    }

    const activeSessions = await base44.asServiceRole.entities.TelematicsAlarmSession.filter({ status: 'active' });
    if (!activeSessions.length) return Response.json({ ok: true, processed: 0 });

    const now = Date.now();
    const results = [];

    for (const session of activeSessions) {
      const startedAt = new Date(session.started_at || 0).getTime();
      const elapsed = (now - startedAt) / 1000;
      const pulsesSent = Number(session.pulses_sent || 0);
      const maxPulses = Number(session.max_pulses || DEFAULT_MAX_PULSES);
      const intervalSeconds = Number(session.pulse_interval_seconds || PULSE_INTERVAL_SECONDS);
      const maxDuration = Number(session.max_duration_seconds || MAX_DURATION_SECONDS);

      // Expire if over max duration or max pulses reached
      if (elapsed >= maxDuration || pulsesSent >= maxPulses) {
        await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, {
          status: 'completed',
          ended_at: new Date().toISOString(),
          cancel_reason: 'timeout_or_max_pulses'
        });
        results.push({ session_id: session.id, action: 'completed' });
        continue;
      }

      // Check if enough time has passed since last pulse
      // Pulse 1 was sent at start, so next pulse due at start + (pulsesSent * interval)
      const nextPulseDue = startedAt + (pulsesSent * intervalSeconds * 1000);
      if (now < nextPulseDue) {
        results.push({ session_id: session.id, action: 'waiting', pulses_sent: pulsesSent });
        continue;
      }

      // Check device still online
      const devices = await base44.asServiceRole.entities.TelematicsDevice.filter({ id: session.telematics_device_id });
      const device = devices[0];
      if (!device || device.online_status === 'offline') {
        await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, {
          status: 'failed',
          ended_at: new Date().toISOString(),
          cancel_reason: 'device_offline'
        });
        results.push({ session_id: session.id, action: 'failed_device_offline' });
        continue;
      }

      // Check vehicle not returned
      const vehicles = await base44.asServiceRole.entities.Vehicle.filter({ id: session.vehicle_id });
      const vehicle = vehicles[0];
      if (['Dropoff Submitted', 'Return Pending Host Review', 'Retired'].includes(vehicle?.status)) {
        await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, {
          status: 'cancelled',
          ended_at: new Date().toISOString(),
          cancel_reason: 'vehicle_returned'
        });
        results.push({ session_id: session.id, action: 'cancelled_vehicle_returned' });
        continue;
      }

      // Send next pulse
      const nextPulse = pulsesSent + 1;
      try {
        const response = await base44.functions.invoke('sendTelematicsCommand', {
          vehicle_id: session.vehicle_id,
          command_type: 'alarm_pulse',
          alarm_session_id: session.id,
          pulse_number: nextPulse,
          source: 'software_alarm_mode'
        });
        const commandId = response?.data?.command_id || '';
        const isLast = nextPulse >= maxPulses;
        await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, {
          pulses_sent: nextPulse,
          last_command_id: commandId,
          ...(isLast ? { status: 'completed', ended_at: new Date().toISOString(), cancel_reason: 'max_pulses_reached' } : {})
        });
        results.push({ session_id: session.id, action: 'pulse_sent', pulse: nextPulse });
      } catch (error) {
        await base44.asServiceRole.entities.TelematicsAlarmSession.update(session.id, {
          status: 'failed',
          ended_at: new Date().toISOString(),
          cancel_reason: error.message
        });
        results.push({ session_id: session.id, action: 'pulse_failed', error: error.message });
      }
    }

    return Response.json({ ok: true, processed: activeSessions.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});