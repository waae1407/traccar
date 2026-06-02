import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const COMMAND_MAP = {
  location: 'locate',
  lock: 'lock',
  unlock: 'unlock',
  panic: 'horn_lights',
  kill: 'disable_starter',
  unkill: 'restore_starter',
  speed: 'status',
  mileage: 'status'
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const command = String(body.command || '').trim();
    const commandType = COMMAND_MAP[command];
    if (!commandType) return Response.json({ error: 'Invalid command.' }, { status: 400 });

    const response = await base44.functions.invoke('sendTelematicsCommand', {
      vehicle_id: body.vehicle_id || '',
      booking_id: body.booking_id || '',
      telematics_device_id: body.telematics_device_id || '',
      unique_id: body.unique_id || '',
      command_type: commandType,
      source: 'legacy_moovetrax_wrapper',
      reason: body.reason || `Legacy MooveTrax command ${command} routed through unified command engine`
    });

    return Response.json({ ok: true, command, command_type: commandType, unified: true, result: response.data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});