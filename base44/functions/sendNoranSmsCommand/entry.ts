import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Admin-only function to send SMS configuration commands to Noran MT20 devices.
// Enables heartbeat keepalive packets (0x000f) for better UDP session freshness.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { device_id, unique_id, command } = body;

    if (!device_id && !unique_id) {
      return Response.json({ error: 'device_id or unique_id is required' }, { status: 400 });
    }

    // Find device
    const query = device_id ? { id: device_id } : { unique_id: unique_id?.toUpperCase() };
    const devices = await base44.asServiceRole.entities.TelematicsDevice.filter(query);
    const device = devices[0];

    if (!device) {
      return Response.json({ error: 'Device not found' }, { status: 404 });
    }

    if (device.provider_key !== 'traccar_noran_mt20') {
      return Response.json({ error: 'Only Noran MT20 devices supported' }, { status: 400 });
    }

    // Get device SIM ICCID or use configured phone number
    const devicePhone = device.sim_iccid || body.device_phone;
    if (!devicePhone) {
      return Response.json({ 
        error: 'Device SIM ICCID not stored. Provide device_phone in request or update device record.',
        device_id: device.id,
        unique_id: device.unique_id
      }, { status: 400 });
    }

    // MT20 SMS command formats:
    // Enable heartbeat: *KW,<device_id>,011,<interval_seconds>#
    // Example: *KW,NR09G51902,011,30# (send heartbeat every 30 seconds)
    // Query config: *KW,<device_id>,000,HHMMSS#
    
    let smsCommand = '';
    if (command === 'enable_heartbeat') {
      const interval = body.heartbeat_interval || 30; // seconds
      const deviceId = device.unique_id || device.device_imei;
      smsCommand = `*KW,${deviceId},011,${interval}#`;
    } else if (command === 'disable_heartbeat') {
      const deviceId = device.unique_id || device.device_imei;
      smsCommand = `*KW,${deviceId},011,0#`;
    } else if (command === 'query_config') {
      const now = new Date();
      const hhmmss = [now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()]
        .map(n => String(n).padStart(2, '0')).join('');
      const deviceId = device.unique_id || device.device_imei;
      smsCommand = `*KW,${deviceId},000,${hhmmss}#`;
    } else {
      return Response.json({ 
        error: 'Invalid command. Supported: enable_heartbeat, disable_heartbeat, query_config',
        supported_commands: ['enable_heartbeat', 'disable_heartbeat', 'query_config']
      }, { status: 400 });
    }

    // Send SMS via Twilio
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !fromPhone) {
      return Response.json({ error: 'Twilio credentials not configured' }, { status: 500 });
    }

    const smsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: fromPhone,
        To: devicePhone,
        Body: smsCommand
      }),
    });

    const smsResult = await smsResponse.json();
    if (!smsResponse.ok) {
      return Response.json({ 
        error: smsResult.message || 'Twilio SMS failed', 
        details: smsResult,
        command_sent: smsCommand
      }, { status: 400 });
    }

    // Log the configuration command
    await base44.asServiceRole.entities.ActivityEvent.create({
      event_type: 'gps.device_config_sms_sent',
      actor_id: user.id,
      actor_email: user.email,
      actor_role: 'admin',
      target_entity: 'TelematicsDevice',
      target_id: device.id,
      vehicle_id: device.vehicle_id || '',
      summary: `SMS config command sent to ${device.unique_id}: ${command}`,
      metadata: {
        command_type: command,
        sms_command: smsCommand,
        device_phone: devicePhone,
        twilio_sid: smsResult.sid,
        heartbeat_interval: body.heartbeat_interval || 30
      },
      source: 'admin_panel',
      event_status: 'success'
    }).catch(() => {});

    return Response.json({
      ok: true,
      device_id: device.id,
      unique_id: device.unique_id,
      command_sent: command,
      sms_command: smsCommand,
      device_phone: devicePhone,
      twilio_sid: smsResult.sid,
      message: `SMS sent to device. ${command === 'enable_heartbeat' ? 'Heartbeat should be enabled within 1-2 minutes.' : 'Configuration command sent.'}`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});