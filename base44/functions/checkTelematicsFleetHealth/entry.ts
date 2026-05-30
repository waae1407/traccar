import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const STALE_HOURS = 6;
const OFFLINE_HOURS = 12;

async function authorize(base44, body) {
  const user = await base44.auth.me().catch(() => null);
  if (user) return user.role === 'admin' ? { ok: true } : { ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  if (body?.automation || body?.args?.scheduled_function === 'checkTelematicsFleetHealth') return { ok: true };
  return { ok: false, response: Response.json({ error: 'Unauthorized scheduled function caller' }, { status: 401 }) };
}

async function alert(base44, payload) {
  await base44.asServiceRole.entities.OperationalAlert.create(payload).catch(() => null);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const auth = await authorize(base44, body);
    if (!auth.ok) return auth.response;

    const now = new Date();
    const devices = await base44.asServiceRole.entities.TelematicsDevice.list('-updated_date', 500);
    const commands = await base44.asServiceRole.entities.TelematicsCommand.list('-created_date', 300);
    const installs = await base44.asServiceRole.entities.TelematicsInstallRecord.list('-updated_date', 300);
    let staleGps = 0;
    let offline = 0;
    let commandFailures = 0;
    let installFailures = 0;

    for (const device of devices) {
      if (['retired', 'suspended'].includes(device.lifecycle_status)) continue;
      const lastSeen = device.last_seen_at ? new Date(device.last_seen_at) : null;
      const hours = lastSeen ? (now.getTime() - lastSeen.getTime()) / 3600000 : Infinity;
      if (hours > STALE_HOURS) {
        staleGps++;
        await base44.asServiceRole.entities.TelematicsEvent.create({
          company_id: device.company_id || '', telematics_device_id: device.id, provider_key: device.provider_key,
          vehicle_id: device.vehicle_id || '', event_type: 'stale_gps', source: 'system', raw_payload: { last_seen_at: device.last_seen_at || null, threshold_hours: STALE_HOURS }, created_at: now.toISOString()
        });
        await alert(base44, {
          alert_type: 'stale_gps', severity: 'warning', title: 'Stale GPS signal', message: `${device.unique_id} has no recent GPS heartbeat.`,
          recommended_action: 'Check device power, installation, or provider connectivity.', provider_key: device.provider_key, telematics_device_id: device.id,
          vehicle_id: device.vehicle_id || '', host_id: device.host_id || '', dedupe_key: `stale_gps:${device.id}:${now.toISOString().slice(0,10)}`, metadata: { last_seen_at: device.last_seen_at || null }
        });
      }
      if (device.online_status === 'offline' || hours > OFFLINE_HOURS) {
        offline++;
        await alert(base44, {
          alert_type: 'device_offline', severity: 'critical', title: 'Device offline', message: `${device.unique_id} appears offline.`,
          recommended_action: 'Escalate to installer/provider support if assigned to an active vehicle.', provider_key: device.provider_key, telematics_device_id: device.id,
          vehicle_id: device.vehicle_id || '', host_id: device.host_id || '', dedupe_key: `device_offline:${device.id}:${now.toISOString().slice(0,10)}`, metadata: { online_status: device.online_status, last_seen_at: device.last_seen_at || null }
        });
      }
    }

    for (const command of commands.filter(c => ['failed', 'expired'].includes(c.queue_status || c.status))) {
      commandFailures++;
      await alert(base44, {
        alert_type: command.queue_status === 'expired' ? 'command_expired' : 'command_failed', severity: 'warning', title: 'Telematics command issue',
        message: `${command.command_type} command is ${command.queue_status || command.status}.`, recommended_action: 'Review command audit and provider response.',
        provider_key: command.provider_key, telematics_device_id: command.telematics_device_id || '', vehicle_id: command.vehicle_id || '', host_id: command.host_id || '', command_id: command.id,
        dedupe_key: `command_issue:${command.id}`, metadata: { failure_reason: command.failure_reason || '' }
      });
    }

    for (const install of installs.filter(i => ['failed'].includes(i.install_status) || i.qa_status === 'rejected')) {
      installFailures++;
      await alert(base44, {
        alert_type: 'installation_failure', severity: 'warning', title: 'Installation issue', message: `Install record ${install.id} needs review.`,
        recommended_action: 'Review installation checklist and photos.', telematics_device_id: install.telematics_device_id || '', vehicle_id: install.vehicle_id || '', host_id: install.host_id || '', install_record_id: install.id,
        dedupe_key: `install_issue:${install.id}`, metadata: { install_status: install.install_status, qa_status: install.qa_status }
      });
    }

    return Response.json({ ok: true, checked_devices: devices.length, stale_gps: staleGps, offline_devices: offline, command_failures: commandFailures, installation_failures: installFailures });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});