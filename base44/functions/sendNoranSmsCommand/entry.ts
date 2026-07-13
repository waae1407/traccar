import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Admin-only function to send SMS configuration commands to Noran MT20 devices.
// Supports single-device and bulk push (all Noran devices) for power-save relay mode (019).

const VALID_COMMANDS = ['enable_heartbeat', 'disable_heartbeat', 'query_config', 'set_relay_power_save', 'query_relay_power_save'];

function buildSmsCommand(commandType, deviceId, body) {
  const now = new Date();
  const hhmmss = [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()]
    .map(n => String(n).padStart(2, '0')).join('');

  if (commandType === 'enable_heartbeat') {
    const interval = body.heartbeat_interval || 30;
    return `*KW,${deviceId},011,${interval}#`;
  }
  if (commandType === 'disable_heartbeat') {
    return `*KW,${deviceId},011,0#`;
  }
  if (commandType === 'query_config') {
    return `*KW,${deviceId},000,${hhmmss}#`;
  }
  // 019: Relay power-save mode configuration
  // X=0: power save (relay releases 60s after ACC off — saves battery)
  // X=1: no power save (relay stays energized 24/7)
  if (commandType === 'set_relay_power_save') {
    const mode = body.power_save_mode === false ? 1 : 0;
    return `*KW,${deviceId},019,${hhmmss},${mode}#`;
  }
  if (commandType === 'query_relay_power_save') {
    return `*KW,${deviceId},019,${hhmmss}#`;
  }
  return null;
}

async function sendTwilioSms(phoneNumber, smsCommand) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!accountSid || !authToken || !fromPhone) throw new Error('Twilio credentials not configured');

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: fromPhone, To: phoneNumber, Body: smsCommand }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Twilio SMS failed');
  return result;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { command, bulk } = body;

    if (!VALID_COMMANDS.includes(command)) {
      return Response.json({
        error: `Invalid command. Supported: ${VALID_COMMANDS.join(', ')}`,
        supported_commands: VALID_COMMANDS
      }, { status: 400 });
    }

    // ── BULK: push to all Noran MT20 devices ──
    if (bulk) {
      const allDevices = await base44.asServiceRole.entities.TelematicsDevice.filter({ provider_key: 'traccar_noran_mt20' });
      const results = [];

      for (const device of allDevices) {
        const phone = device.sim_phone_number || device.sim_iccid;
        if (!phone) {
          results.push({ device_id: device.id, unique_id: device.unique_id, status: 'skipped', reason: 'No phone number stored' });
          continue;
        }

        const deviceId = device.unique_id || device.device_imei;
        const smsCommand = buildSmsCommand(command, deviceId, body);
        if (!smsCommand) {
          results.push({ device_id: device.id, unique_id: device.unique_id, status: 'skipped', reason: 'Could not build command' });
          continue;
        }

        try {
          const smsResult = await sendTwilioSms(phone, smsCommand);
          results.push({ device_id: device.id, unique_id: device.unique_id, phone, status: 'sent', twilio_sid: smsResult.sid, sms_command: smsCommand });

          await base44.asServiceRole.entities.ActivityEvent.create({
            event_type: 'gps.device_config_sms_sent',
            actor_id: user.id,
            actor_email: user.email,
            actor_role: 'admin',
            target_entity: 'TelematicsDevice',
            target_id: device.id,
            vehicle_id: device.vehicle_id || '',
            summary: `Bulk SMS config (${command}) sent to ${device.unique_id}`,
            metadata: { command_type: command, sms_command: smsCommand, device_phone: phone, twilio_sid: smsResult.sid, bulk: true },
            source: 'admin_panel',
            event_status: 'success'
          }).catch(() => {});
        } catch (error) {
          results.push({ device_id: device.id, unique_id: device.unique_id, phone, status: 'failed', error: error.message, sms_command: smsCommand });
        }
      }

      const sent = results.filter(r => r.status === 'sent').length;
      const failed = results.filter(r => r.status === 'failed').length;
      const skipped = results.filter(r => r.status === 'skipped').length;

      return Response.json({
        ok: true,
        bulk: true,
        command,
        total: results.length,
        sent,
        failed,
        skipped,
        results
      });
    }

    // ── SINGLE DEVICE ──
    const { device_id, unique_id } = body;
    if (!device_id && !unique_id) {
      return Response.json({ error: 'device_id or unique_id is required (or use bulk: true for all devices)' }, { status: 400 });
    }

    const query = device_id ? { id: device_id } : { unique_id: unique_id?.toUpperCase() };
    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter(query);
    const device = devices[0];

    if (!device) return Response.json({ error: 'Device not found' }, { status: 404 });
    if (device.provider_key !== 'traccar_noran_mt20') return Response.json({ error: 'Only Noran MT20 devices supported' }, { status: 400 });

    const devicePhone = device.sim_phone_number || device.sim_iccid || body.device_phone;
    if (!devicePhone) {
      return Response.json({
        error: 'Device phone number not stored. Provide device_phone in request or update device record with sim_phone_number.',
        device_id: device.id,
        unique_id: device.unique_id
      }, { status: 400 });
    }

    const deviceId = device.unique_id || device.device_imei;
    const smsCommand = buildSmsCommand(command, deviceId, body);
    if (!smsCommand) {
      return Response.json({ error: 'Could not build SMS command' }, { status: 400 });
    }

    const smsResult = await sendTwilioSms(devicePhone, smsCommand);

    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'gps.device_config_sms_sent',
      actor_id: user.id,
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'TelematicsDevice',
      target_id: device.id,
      vehicle_id: device.vehicle_id || '',
      summary: `SMS config command (${command}) sent to ${device.unique_id}`,
      metadata: {
        command_type: command,
        sms_command: smsCommand,
        device_phone: devicePhone,
        twilio_sid: smsResult.sid,
        ...(command === 'set_relay_power_save' && { power_save_mode: body.power_save_mode !== false })
      },
      source: 'admin_panel',
      event_status: 'success'
    }).catch(() => {});

    const messages = {
      enable_heartbeat: `Heartbeat should be enabled within 1-2 minutes.`,
      disable_heartbeat: `Heartbeat disabled.`,
      query_config: `Configuration query sent. Device will reply via SMS.`,
      set_relay_power_save: body.power_save_mode === false
        ? `Relay power-save DISABLED. Kill relay will stay energized 24/7 (higher battery draw).`
        : `Relay power-save ENABLED. Kill relay will release 60s after ACC off (saves battery).`,
      query_relay_power_save: `Relay power-save mode query sent. Device will reply via SMS.`
    };

    return Response.json({
      ok: true,
      device_id: device.id,
      unique_id: device.unique_id,
      command_sent: command,
      sms_command: smsCommand,
      device_phone: devicePhone,
      twilio_sid: smsResult.sid,
      message: messages[command] || 'Configuration command sent.'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});