import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SENT_TIMEOUT_MINUTES = 5;
const ACK_EXECUTION_WARNING_MINUTES = 10;
const COMMAND_RESULT_FIELDS = {
  locate: 'locate_result',
  status: 'status_result',
  lock: 'lock_result',
  unlock: 'unlock_result',
  horn: 'horn_result',
  lights: 'lights_result',
  horn_lights: 'horn_lights_result',
  alarm_pulse: 'alarm_pulse_result',
  disable_starter: 'starter_disable_result',
  restore_starter: 'starter_restore_result'
};

async function authorize(base44, body) {
  const user = await base44.auth.me().catch(() => null);
  if (user) return user.role === 'admin' ? { ok: true } : { ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  if (body?.automation || body?.args?.scheduled_function === 'processTelematicsCommandTimeouts') return { ok: true };
  return { ok: false, response: Response.json({ error: 'Unauthorized scheduled function caller' }, { status: 401 }) };
}

async function markCommandTestTimeout(base44, command, nowIso) {
  const resultField = COMMAND_RESULT_FIELDS[command.command_type];
  if (!resultField) return false;
  const isAdminTest = command.request_payload?.admin_device_command_test === true || command.request_payload?.source === 'admin_test';
  if (!isAdminTest) return false;

  const sessions = await base44.asServiceRole.entities.TelematicsDeviceTestSession.filter({ device_id: command.telematics_device_id, status: 'in_progress' });
  const session = sessions
    .sort((a, b) => new Date(b.started_at || b.created_date || 0).getTime() - new Date(a.started_at || a.created_date || 0).getTime())[0];
  if (!session) return false;

  const reason = 'No device reply received before timeout.';
  await base44.asServiceRole.entities.TelematicsDeviceTestSession.update(session.id, {
    [resultField]: 'fail',
    result_details: {
      ...(session.result_details || {}),
      [resultField]: {
        result: 'fail',
        reason,
        command_id: command.id,
        command_type: command.command_type,
        processed_at: nowIso
      }
    }
  });
  return true;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const auth = await authorize(base44, body);
    if (!auth.ok) return auth.response;

    const now = new Date();
    const nowIso = now.toISOString();
    const commands = await base44.asServiceRole.entities.TelematicsCommand.list('-created_date', 300);
    let expired = 0;
    let alerted = 0;
    let testSessionsUpdated = 0;

    for (const command of commands) {
      const status = command.queue_status || command.status;
      const sentAt = command.sent_at ? new Date(command.sent_at) : null;
      const ackAt = command.device_acknowledged_at || command.acknowledged_at ? new Date(command.device_acknowledged_at || command.acknowledged_at) : null;
      const sentAge = sentAt ? (now.getTime() - sentAt.getTime()) / 60000 : 0;
      const ackAge = ackAt ? (now.getTime() - ackAt.getTime()) / 60000 : 0;

      // Pending-waiting-for-fresh-session timeout: 5 minutes with no inbound heartbeat
      if (status === 'waiting_for_fresh_heartbeat') {
        const createdAt = command.created_at ? new Date(command.created_at) : null;
        const pendingAge = createdAt ? (now.getTime() - createdAt.getTime()) / 60000 : 0;
        if (pendingAge > 5) {
          const failureReason = 'Timed out waiting for fresh device heartbeat (5 min)';
          await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
            status: 'failed_no_fresh_session', queue_status: 'failed_no_fresh_session',
            confirmation_status: 'failed', failed_at: nowIso, failure_reason: failureReason,
            udp_packet_observed: false
          });
          await base44.asServiceRole.entities.TelematicsEvent.create({
            company_id: command.company_id || '', telematics_device_id: command.telematics_device_id || '',
            provider_key: command.provider_key, vehicle_id: command.vehicle_id || '',
            event_type: 'command_failed_no_fresh_session', source: 'system',
            raw_payload: { command_id: command.id, failure_reason: failureReason }, created_at: nowIso
          });
          if (await markCommandTestTimeout(base44, command, nowIso)) testSessionsUpdated++;
          expired++;
        }
        continue;
      }

      if (['sent', 'delivered'].includes(status) && sentAge > SENT_TIMEOUT_MINUTES) {
        const failureReason = 'Device acknowledgement timeout';
        await base44.asServiceRole.entities.TelematicsCommand.update(command.id, {
          status: 'expired', queue_status: 'expired', confirmation_status: 'expired', failed_at: nowIso, failure_reason: failureReason
        });
        await base44.asServiceRole.entities.TelematicsEvent.create({
          company_id: command.company_id || '', telematics_device_id: command.telematics_device_id || '', provider_key: command.provider_key,
          vehicle_id: command.vehicle_id || '', event_type: 'command_expired', source: 'system', raw_payload: { command_id: command.id }, created_at: nowIso
        });
        await base44.asServiceRole.entities.OperationalAlert.create({
          alert_type: 'command_expired', severity: 'warning', title: 'Telematics command expired',
          message: `${command.command_type} command expired without device acknowledgement.`, recommended_action: 'Review provider/device connectivity.',
          provider_key: command.provider_key, telematics_device_id: command.telematics_device_id || '', vehicle_id: command.vehicle_id || '', host_id: command.host_id || '', command_id: command.id,
          dedupe_key: `command_expired:${command.id}`, metadata: { status, sent_at: command.sent_at }
        }).catch(() => null);
        if (await markCommandTestTimeout(base44, command, nowIso)) testSessionsUpdated++;
        expired++;
      }

      if (status === 'acknowledged' && ackAge > ACK_EXECUTION_WARNING_MINUTES && !command.executed_at) {
        await base44.asServiceRole.entities.TelematicsEvent.create({
          company_id: command.company_id || '', telematics_device_id: command.telematics_device_id || '', provider_key: command.provider_key,
          vehicle_id: command.vehicle_id || '', event_type: 'command_acknowledged_not_executed', source: 'system', raw_payload: { command_id: command.id }, created_at: nowIso
        });
        await base44.asServiceRole.entities.OperationalAlert.create({
          alert_type: 'command_acknowledged_not_executed', severity: 'warning', title: 'Command acknowledged but not executed',
          message: `${command.command_type} was acknowledged but has not reported execution.`, recommended_action: 'Check provider event stream or device state.',
          provider_key: command.provider_key, telematics_device_id: command.telematics_device_id || '', vehicle_id: command.vehicle_id || '', host_id: command.host_id || '', command_id: command.id,
          dedupe_key: `command_ack_no_execute:${command.id}`, metadata: { acknowledged_at: command.acknowledged_at || command.device_acknowledged_at }
        }).catch(() => null);
        alerted++;
      }
    }

    return Response.json({ ok: true, expired, alerted, testSessionsUpdated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});