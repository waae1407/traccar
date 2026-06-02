import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const COMMAND_SEQUENCE = ['locate', 'status', 'lock', 'unlock', 'horn_lights', 'disable_starter', 'restore_starter'];

function cleanDeviceId(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_:-]/g, '').slice(0, 80);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const body = await req.json();
    const uniqueId = cleanDeviceId(body.device_id || body.unique_id);
    if (!uniqueId) return Response.json({ error: 'device_id is required' }, { status: 400 });

    const results = [];
    for (const commandType of COMMAND_SEQUENCE) {
      try {
        const response = await base44.functions.invoke('sendTelematicsCommand', {
          unique_id: uniqueId,
          command_type: commandType,
          admin_device_command_test: true,
          admin_starter_override: true,
          source: 'diagnostic_traccar_command_suite'
        });
        results.push({ command_type: commandType, status: response.data?.queue_status || 'sent', command_id: response.data?.command_id || '', result: response.data });
      } catch (error) {
        results.push({ command_type: commandType, status: 'failed', error: error?.response?.data?.error || error.message });
      }
    }

    return Response.json({ ok: true, diagnostic_only: true, routed_through: 'sendTelematicsCommand', device_id: uniqueId, commands: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});